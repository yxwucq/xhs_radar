import './styles.css'
import type { NoteData, AnalysisResult, FilterMode, LowQualityTag, CustomRule } from '@/shared/types'
import type { Message } from '@/shared/messaging'
import { DEFAULT_CONFIG, mergeConfigWithDefaults } from '@/shared/constants'
import { FeedObserver } from './observer'
import { AnalysisQueue } from './queue'
import { DetailObserver } from './detail-observer'
import { applyBlurMark, applyVanishMark, removeMark, clearAllMarks, setCardStatus } from './renderer'

const LOG_PREFIX = '[XHS Radar]'

/** noteId → card element */
const cardMap = new Map<string, HTMLElement>()
/** noteId → analysis result (for re-rendering on mode switch) */
const resultMap = new Map<string, AnalysisResult>()

let enabled = true
let filterMode: FilterMode = 'blur'
let enabledTags: LowQualityTag[] = [...DEFAULT_CONFIG.enabledTags]
let prefetchLimit: number = DEFAULT_CONFIG.prefetchLimit
let keywordRules: Record<LowQualityTag, string[]> = { ...DEFAULT_CONFIG.keywordRules }
let customRules: CustomRule[] = []

/**
 * Local keyword matching — runs in content script, no round-trip to background.
 * Returns AnalysisResult if keyword matched, null otherwise.
 */
function localKeywordMatch(noteId: string, title: string): AnalysisResult | null {
  const lowerTitle = title.toLowerCase()

  // Check built-in rules
  for (const tag of enabledTags) {
    for (const kw of keywordRules[tag] ?? []) {
      if (lowerTitle.includes(kw.toLowerCase())) {
        return { noteId, score: 20, isLowQuality: true, tags: [tag], reason: `关键词: ${kw}` }
      }
    }
  }

  // Check custom rules
  for (const rule of customRules) {
    if (!rule.enabled) continue
    for (const kw of rule.keywords) {
      if (lowerTitle.includes(kw.toLowerCase())) {
        return { noteId, score: 20, isLowQuality: true, tags: [], reason: `关键词: ${kw}` }
      }
    }
  }

  return null
}
/** Set to true when extension context is invalidated (extension reloaded) */
let dead = false

function die(): void {
  dead = true
  console.warn(LOG_PREFIX, 'Extension context invalidated — content script stopped')
}

// Load initial config
try {
  chrome.storage.local.get('config').then((stored) => {
    if (stored.config) {
      const config = mergeConfigWithDefaults(stored.config)
      enabled = config.enabled
      filterMode = config.filterMode
      enabledTags = config.enabledTags
      prefetchLimit = config.prefetchLimit
      keywordRules = config.keywordRules
      customRules = config.customRules
    }
  }).catch(() => { die() })
} catch { die() }

/**
 * Check if a result should be marked based on enabled tag filters.
 * A result is marked if it's low quality AND has at least one tag matching enabledTags.
 * If result has no tags but is low quality, it's still marked (catch-all).
 */
function shouldMark(result: AnalysisResult): boolean {
  if (!result.isLowQuality) return false
  if (result.tags.length === 0) return true
  return result.tags.some(t => enabledTags.includes(t))
}

/**
 * Apply visual mark to a card based on current filter mode and tag filters.
 */
function applyMark(card: HTMLElement, result: AnalysisResult): void {
  removeMark(card) // clear any existing mark first
  if (!enabled || !shouldMark(result)) return

  if (filterMode === 'vanish') {
    applyVanishMark(card, result)
  } else {
    applyBlurMark(card, result)
  }
}

/**
 * Re-render all marked cards (e.g., after mode switch).
 */
function rerenderAll(): void {
  clearAllMarks()
  if (!enabled) return

  for (const [noteId, result] of resultMap) {
    const card = cardMap.get(noteId)
    if (card) applyMark(card, result)
  }
}

/**
 * Called when LLM analysis results come back.
 */
function handleResults(results: AnalysisResult[]): void {
  for (const result of results) {
    const card = cardMap.get(result.noteId)
    if (!card) continue

    resultMap.set(result.noteId, result)
    const willMark = enabled && shouldMark(result)

    // Detect fallback results (API failed — reason contains "失败" or "超时" or "无效")
    const isFallback = !result.isLowQuality && result.reason &&
      /失败|超时|无效|未设置|跳过/.test(result.reason)

    if (isFallback) {
      setCardStatus(card, 'error', result.reason)
    } else if (willMark) {
      console.log(LOG_PREFIX, '⚠ LOW QUALITY', {
        noteId: result.noteId,
        score: result.score,
        tags: result.tags,
        reason: result.reason,
      })
      setCardStatus(card, 'fail', `score=${result.score} ${result.reason ?? ''}`, result.score)
    } else {
      setCardStatus(card, 'pass', `score=${result.score}`, result.score)
    }

    applyMark(card, result)
  }
}

const queue = new AnalysisQueue()

/** Handle detail overlay analysis results — retroactively mark the feed card. */
function handleDetailResult(noteId: string, result: AnalysisResult): void {
  resultMap.set(noteId, result)
  const card = cardMap.get(noteId)
  if (card) {
    const willMark = enabled && shouldMark(result)
    applyMark(card, result)
    const isFallback = !result.isLowQuality && result.reason && /失败|超时|无效|未设置|跳过/.test(result.reason)
    const status = isFallback ? 'error' : willMark ? 'fail' : 'pass'
    const detail = willMark ? `score=${result.score} ${result.reason ?? ''}` : `score=${result.score}`
    setCardStatus(card, status, detail, result.score)
  }
}

const detailObserver = new DetailObserver(handleDetailResult)

function handleNewNotes(notes: NoteData[]): void {
  if (!enabled || dead) return
  const uncached: NoteData[] = []
  for (const note of notes) {
    cardMap.set(note.noteId, note.element)
    // Already analyzed — apply cached result immediately, skip queue
    const cached = resultMap.get(note.noteId)
    if (cached) {
      applyMark(note.element, cached)
      const isFallback = !cached.isLowQuality && cached.reason && /失败|超时|无效|未设置|跳过/.test(cached.reason)
      setCardStatus(note.element, isFallback ? 'error' : cached.isLowQuality ? 'fail' : 'pass', undefined, cached.score)
      continue
    }
    setCardStatus(note.element, 'pending', note.title)
    uncached.push(note)
  }
  if (uncached.length > 0) queue.enqueue(uncached)
}

// ── Listen for messages from popup & background ────────────────

try {
  chrome.runtime.onMessage.addListener((message: Message) => {
    if (dead) return
    switch (message.type) {
      case 'ANALYZE_RESULT':
        handleResults(message.payload.results)
        break

      case 'DETAIL_RESULT':
        detailObserver.handleResult(message.payload.noteId, message.payload.result)
        break

      case 'TOGGLE_ENABLED':
        enabled = message.payload.enabled
        if (!enabled) {
          clearAllMarks()
        } else {
          rerenderAll()
        }
        break

      case 'SET_FILTER_MODE':
        filterMode = message.payload.mode
        rerenderAll()
        break
    }
  })
} catch { die() }

// Listen for storage changes (covers config saved from Options page)
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (dead) return
    if (area !== 'local' || !changes.config) return
    const newConfig = changes.config.newValue
    if (!newConfig) return
    const config = mergeConfigWithDefaults(newConfig)

    const modeChanged = config.filterMode !== filterMode
    const enabledChanged = config.enabled !== enabled
    const tagsChanged = JSON.stringify(config.enabledTags) !== JSON.stringify(enabledTags)

    enabled = config.enabled
    filterMode = config.filterMode
    enabledTags = config.enabledTags
    prefetchLimit = config.prefetchLimit
    keywordRules = config.keywordRules
    customRules = config.customRules

    if (enabledChanged || modeChanged || tagsChanged) {
      rerenderAll()
    }
  })
} catch { die() }

// Feed API hook disabled — XHS CSP blocks all injection methods.
// Analysis uses title + author + likeCount only.


// ── Init ──────────────────────────────────────────

function init(): void {
  console.log(LOG_PREFIX, 'Content script loaded on', window.location.href)

  // Clean up zombie marks from previous content script instances (extension reload)
  clearAllMarks()
  document.querySelectorAll('[data-xhs-radar-status]').forEach(el => el.remove())

  const observer = new FeedObserver(handleNewNotes)
  observer.start()

  detailObserver.start()
}

init()
