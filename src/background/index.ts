import type { Message, NoteInput } from '@/shared/messaging'
import type { UserConfig, SessionStats, AnalysisResult } from '@/shared/types'
import { DEFAULT_CONFIG, mergeConfigWithDefaults } from '@/shared/constants'
import { LLMGateway } from './llm-gateway'
import { AnalysisCache } from './cache'
import { analyzeByKeywords } from './keyword-analyzer'
import { DailyStatsTracker } from './daily-stats'

const LOG_PREFIX = '[XHS Radar BG]'

const gateway = new LLMGateway()
const cache = new AnalysisCache()
const dailyStats = new DailyStatsTracker()

let config: UserConfig = { ...DEFAULT_CONFIG }
let stats: SessionStats = {
  scanned: 0,
  marked: 0,
  cacheHits: 0,
  apiCalls: 0,
  errors: 0,
}

function resetSessionStats(): void {
  stats = {
    scanned: 0,
    marked: 0,
    cacheHits: 0,
    apiCalls: 0,
    errors: 0,
  }
}

/** Load config and cache on startup */
async function init(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get('config')
    if (stored.config) {
      config = mergeConfigWithDefaults(stored.config)
    }
    gateway.updateConfig(config)
    await cache.load()
    await dailyStats.load()
    console.log(LOG_PREFIX, 'Initialized:', config.llmProvider, config.model, `cache=${cache.size}`)
  } catch (e) {
    console.log(LOG_PREFIX, 'Init failed:', e)
  }
}

init()

// Listen for config changes from Options page
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.config) {
    config = mergeConfigWithDefaults(changes.config.newValue)
    gateway.updateConfig(config)
    console.log(LOG_PREFIX, 'Config updated')
  }
})

// ── Message handler ────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  switch (message.type) {
    case 'ANALYZE_NOTES': {
      const tabId = sender.tab?.id
      sendResponse({ received: true })
      handleAnalyze(message.payload.notes, tabId ?? undefined)
        .catch(err => {
          console.log(LOG_PREFIX, 'Analysis failed:', err)
          stats.errors++
        })
      return false
    }

    case 'GET_STATUS':
      sendResponse({ ...stats, cacheSize: cache.size })
      return false

    case 'GET_DAILY_STATS':
      sendResponse({ days: dailyStats.getAll() })
      return false

    case 'CLEAR_DAILY_STATS':
      dailyStats.clear()
        .then(() => {
          resetSessionStats()
          sendResponse({ ok: true })
        })
        .catch(() => sendResponse({ ok: false }))
      return true

    case 'TOGGLE_ENABLED':
      config.enabled = message.payload.enabled
      chrome.storage.local.set({ config })
      sendResponse({ ok: true })
      return false

    case 'SET_FILTER_MODE':
      config.filterMode = message.payload.mode
      chrome.storage.local.set({ config })
      sendResponse({ ok: true })
      return false

    case 'CONFIG_CHANGED':
      config = { ...config, ...message.payload }
      chrome.storage.local.set({ config })
      gateway.updateConfig(config)
      if ('clearCache' in message.payload) {
        cache.clear()
      }
      sendResponse({ ok: true })
      return false

    case 'ANALYZE_DETAIL': {
      const detailTabId = sender.tab?.id
      sendResponse({ received: true })
      handleDetailAnalyze(message.payload, detailTabId ?? undefined)
        .catch(err => {
          console.log(LOG_PREFIX, 'Detail analysis failed:', err)
          stats.errors++
        })
      return false
    }

    default:
      return false
  }
})

/** Push results to a tab */
function pushToTab(tabId: number, results: AnalysisResult[]): void {
  if (results.length === 0) return
  chrome.tabs.sendMessage(tabId, {
    type: 'ANALYZE_RESULT',
    payload: { results },
  }).catch(() => {})
}

async function handleDetailAnalyze(
  payload: { noteId: string; title: string; content: string; author: string },
  tabId?: number
): Promise<void> {
  if (!config.enabled || !config.apiKey) return

  stats.scanned++
  stats.apiCalls++

  // Use single-note analysis through existing gateway
  const noteInput: NoteInput = {
    noteId: payload.noteId,
    title: payload.title,
    content: payload.content,
    author: payload.author,
    likeCount: '',
  }

  const results = await gateway.analyze(
    [noteInput], config.sensitivity,
    { mode: 'detailed', customRules: config.customRules, promptHint: config.promptHint }
  )

  const result = results[0]
  if (result) {
    cache.setOne(result) // overwrite any title-only cached result
    if (result.isLowQuality) stats.marked++

    if (tabId != null) {
      chrome.tabs.sendMessage(tabId, {
        type: 'DETAIL_RESULT',
        payload: { noteId: payload.noteId, result },
      }).catch(() => {})
    }
  }

  dailyStats.record(1, result?.isLowQuality ? 1 : 0, 1)
}

async function handleAnalyze(notes: NoteInput[], tabId?: number): Promise<void> {
  if (!config.enabled) return

  stats.scanned += notes.length
  let markedCount = 0

  // ── Layer 1: Keyword pre-filter (instant, push immediately) ──
  const keywordResults = analyzeByKeywords(notes, config.keywordRules, config.enabledTags, config.customRules)
  const keywordHits: AnalysisResult[] = []
  const passedNotes: NoteInput[] = []

  for (let i = 0; i < notes.length; i++) {
    if (keywordResults[i].isLowQuality) {
      keywordHits.push(keywordResults[i])
    } else {
      passedNotes.push(notes[i])
    }
  }

  if (keywordHits.length > 0) {
    console.log(LOG_PREFIX, `Keyword pre-filter: ${keywordHits.length} hit, ${passedNotes.length} to LLM`)
    await cache.set(keywordHits)
    stats.marked += keywordHits.length
    markedCount += keywordHits.length
    if (tabId != null) pushToTab(tabId, keywordHits)
  }

  // ── Layer 2: Cache hits (push immediately) ──
  if (passedNotes.length === 0 || !config.apiKey) {
    if (passedNotes.length > 0 && !config.apiKey) {
      console.log(LOG_PREFIX, 'No API key set, skipping LLM analysis')
    }
    const noKeyReason = !config.apiKey ? 'API Key 未设置，跳过分析' : ''
    const skipped = passedNotes.map(n => ({
      noteId: n.noteId, score: 75, isLowQuality: false, tags: [] as AnalysisResult['tags'], reason: noKeyReason,
    }))
    if (tabId != null) pushToTab(tabId, skipped)
    dailyStats.record(notes.length, markedCount, 0)
    return
  }

  const cached = cache.getMany(passedNotes.map(n => n.noteId))
  const uncached = passedNotes.filter(n => !cached.has(n.noteId))
  stats.cacheHits += cached.size
  const cachedMarked = [...cached.values()].filter(r => r.isLowQuality).length
  stats.marked += cachedMarked
  markedCount += cachedMarked

  // Push cache hits immediately
  if (cached.size > 0 && tabId != null) {
    pushToTab(tabId, [...cached.values()])
  }

  // ── Layer 3: LLM analysis with streaming ──
  if (uncached.length > 0) {
    stats.apiCalls++

    // Streaming callback: push each result to tab as it arrives
    const onPartialResult = tabId != null ? (result: AnalysisResult) => {
      cache.setOne(result)
      if (result.isLowQuality) {
        stats.marked++
        markedCount++
      }
      pushToTab(tabId, [result])
    } : undefined

    const allResults = await gateway.analyze(
      uncached, config.sensitivity,
      { mode: config.analysisMode, customRules: config.customRules, promptHint: config.promptHint },
      onPartialResult
    )

    // For non-streaming path or any results not yet pushed
    if (!onPartialResult) {
      await cache.set(allResults)
      const llmMarked = allResults.filter(r => r.isLowQuality).length
      stats.marked += llmMarked
      markedCount += llmMarked
      if (tabId != null) pushToTab(tabId, allResults)
    }
  }

  dailyStats.record(notes.length, markedCount, uncached.length > 0 ? 1 : 0)
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log(LOG_PREFIX, 'Extension installed — opening onboarding')
    chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') })
  }
})

console.log(LOG_PREFIX, 'Service worker ready')
