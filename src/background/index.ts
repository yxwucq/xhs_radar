import type { Message, NoteInput } from '@/shared/messaging'
import type { UserConfig, SessionStats, AnalysisResult } from '@/shared/types'
import { DEFAULT_CONFIG } from '@/shared/constants'
import { LLMGateway } from './llm-gateway'
import { AnalysisCache } from './cache'
import { analyzeByKeywords } from './keyword-analyzer'

const LOG_PREFIX = '[XHS Radar BG]'

const gateway = new LLMGateway()
const cache = new AnalysisCache()

let config: UserConfig = { ...DEFAULT_CONFIG }
let stats: SessionStats = {
  scanned: 0,
  marked: 0,
  cacheHits: 0,
  apiCalls: 0,
  errors: 0,
}

/** Load config and cache on startup */
async function init(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get('config')
    if (stored.config) {
      config = { ...DEFAULT_CONFIG, ...stored.config }
    }
    gateway.updateConfig(config)
    await cache.load()
    console.log(LOG_PREFIX, 'Initialized:', config.llmProvider, config.model, `cache=${cache.size}`)
  } catch (e) {
    console.error(LOG_PREFIX, 'Init failed:', e)
  }
}

init()

// Listen for config changes from Options page
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.config) {
    config = { ...DEFAULT_CONFIG, ...changes.config.newValue }
    gateway.updateConfig(config)
    console.log(LOG_PREFIX, 'Config updated')
  }
})

// ── Message handler ────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  switch (message.type) {
    case 'ANALYZE_NOTES': {
      const tabId = sender.tab?.id
      // Acknowledge immediately — closes message channel, no timeout risk
      sendResponse({ received: true })
      // Process async, push results back to tab when done
      handleAnalyze(message.payload.notes)
        .then(results => {
          if (tabId != null) {
            chrome.tabs.sendMessage(tabId, {
              type: 'ANALYZE_RESULT',
              payload: { results },
            }).catch(err => {
              console.warn(LOG_PREFIX, 'Failed to send results to tab:', err)
            })
          }
        })
        .catch(err => {
          console.error(LOG_PREFIX, 'Analysis failed:', err)
          stats.errors++
        })
      return false
    }

    case 'GET_STATUS':
      sendResponse({ ...stats, cacheSize: cache.size })
      return false

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

    default:
      return false
  }
})

async function handleAnalyze(notes: NoteInput[]): Promise<AnalysisResult[]> {
  if (!config.enabled) return []

  stats.scanned += notes.length

  // ── Layer 1: Keyword pre-filter (instant, always active) ──
  const keywordResults = analyzeByKeywords(notes, config.keywordList)
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
  }

  // ── Layer 2: LLM analysis on remaining notes ──
  if (passedNotes.length === 0 || !config.apiKey) {
    if (passedNotes.length > 0 && !config.apiKey) {
      console.log(LOG_PREFIX, 'No API key set, skipping LLM analysis')
    }
    return [...keywordHits, ...passedNotes.map(n => ({
      noteId: n.noteId, score: 75, isLowQuality: false, tags: [] as AnalysisResult['tags'], reason: '',
    }))]
  }

  // Check cache
  const cached = cache.getMany(passedNotes.map(n => n.noteId))
  const uncached = passedNotes.filter(n => !cached.has(n.noteId))
  stats.cacheHits += cached.size

  // Call LLM for uncached
  let freshResults: AnalysisResult[] = []
  if (uncached.length > 0) {
    stats.apiCalls++
    freshResults = await gateway.analyze(uncached, config.sensitivity, config.analysisMode)
    await cache.set(freshResults)
  }

  // Merge all results
  const llmResults: AnalysisResult[] = passedNotes.map(n => {
    const hit = cached.get(n.noteId)
    if (hit) return hit
    return freshResults.find(r => r.noteId === n.noteId) ?? {
      noteId: n.noteId, score: 75, isLowQuality: false, tags: [] as AnalysisResult['tags'], reason: '分析失败',
    }
  })

  stats.marked += llmResults.filter(r => r.isLowQuality).length

  return [...keywordHits, ...llmResults]
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log(LOG_PREFIX, 'Extension installed')
    chrome.runtime.openOptionsPage()
  }
})

console.log(LOG_PREFIX, 'Service worker ready')
