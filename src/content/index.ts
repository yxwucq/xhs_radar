import './styles.css'
import type { NoteData, AnalysisResult, FilterMode, LowQualityTag } from '@/shared/types'
import type { Message } from '@/shared/messaging'
import { DEFAULT_CONFIG } from '@/shared/constants'
import { FeedObserver } from './observer'
import { AnalysisQueue } from './queue'
import { applyBlurMark, applyVanishMark, removeMark, clearAllMarks, setCardStatus } from './renderer'

const LOG_PREFIX = '[XHS Radar]'

/** noteId → card element */
const cardMap = new Map<string, HTMLElement>()
/** noteId → analysis result (for re-rendering on mode switch) */
const resultMap = new Map<string, AnalysisResult>()
/** noteId → desc from feed API (populated by interceptor) */
const descCache = new Map<string, string>()

let enabled = true
let filterMode: FilterMode = 'blur'
let enabledTags: LowQualityTag[] = [...DEFAULT_CONFIG.enabledTags]
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
      enabled = stored.config.enabled ?? true
      filterMode = stored.config.filterMode ?? DEFAULT_CONFIG.filterMode
      enabledTags = stored.config.enabledTags ?? DEFAULT_CONFIG.enabledTags
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

    // Detect fallback results (API failed — reason contains "失败" or "超时" or "无效")
    const isFallback = !result.isLowQuality && result.reason &&
      /失败|超时|无效|未设置|跳过/.test(result.reason)

    if (isFallback) {
      setCardStatus(card, 'error', result.reason)
    } else if (result.isLowQuality) {
      console.log(LOG_PREFIX, '⚠ LOW QUALITY', {
        noteId: result.noteId,
        score: result.score,
        tags: result.tags,
        reason: result.reason,
      })
      setCardStatus(card, 'fail', `score=${result.score} ${result.reason ?? ''}`)
    } else {
      setCardStatus(card, 'pass', `score=${result.score}`)
    }

    applyMark(card, result)
  }
}

const queue = new AnalysisQueue()

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
      setCardStatus(note.element, isFallback ? 'error' : cached.isLowQuality ? 'fail' : 'pass')
      continue
    }
    if (!note.content && descCache.has(note.noteId)) {
      note.content = descCache.get(note.noteId)!
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

    const modeChanged = newConfig.filterMode !== filterMode
    const enabledChanged = newConfig.enabled !== enabled
    const tagsChanged = JSON.stringify(newConfig.enabledTags) !== JSON.stringify(enabledTags)

    enabled = newConfig.enabled ?? enabled
    filterMode = newConfig.filterMode ?? filterMode
    enabledTags = newConfig.enabledTags ?? enabledTags

    if (enabledChanged || modeChanged || tagsChanged) {
      rerenderAll()
    }
  })
} catch { die() }

// ── Feed API Interceptor (external script, safe from CSP) ──────

/** Listen for desc data posted from the injected page script */
window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.type !== 'XHS_RADAR_FEED_DATA') return
  const items = e.data.items as Array<{ noteId: string; desc: string }>
  if (!items?.length) return
  for (const item of items) {
    if (item.desc) descCache.set(item.noteId, item.desc)
  }
  console.log(LOG_PREFIX, `Feed API intercepted: ${items.filter(i => i.desc).length}/${items.length} with desc`)
})

/** Inject feed-hook.js into page's main world via <script src> */
function injectFeedHook(): void {
  try {
    const url = chrome.runtime.getURL('feed-hook.js')
    const script = document.createElement('script')
    script.src = url
    script.onload = () => script.remove()
    ;(document.head || document.documentElement).appendChild(script)
  } catch {
    // Extension context may be invalidated — ignore silently
  }
}

// ── Init ──────────────────────────────────────────

function init(): void {
  console.log(LOG_PREFIX, 'Content script loaded on', window.location.href)

  // Clean up zombie marks from previous content script instances (extension reload)
  clearAllMarks()
  document.querySelectorAll('[data-xhs-radar-status]').forEach(el => el.remove())

  // Inject feed API interceptor (must be before observer to catch initial feed load)
  injectFeedHook()

  const observer = new FeedObserver(handleNewNotes)
  observer.start()
}

init()
