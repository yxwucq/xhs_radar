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

    if (result.isLowQuality) {
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
  for (const note of notes) {
    cardMap.set(note.noteId, note.element)
    setCardStatus(note.element, 'pending', note.title)
  }
  queue.enqueue(notes)
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

// ── Init ──────────────────────────────────────────

function init(): void {
  console.log(LOG_PREFIX, 'Content script loaded on', window.location.href)

  // Clean up zombie marks from previous content script instances (extension reload)
  clearAllMarks()
  document.querySelectorAll('[data-xhs-radar-status]').forEach(el => el.remove())

  const observer = new FeedObserver(handleNewNotes)
  observer.start()
}

init()
