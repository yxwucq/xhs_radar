import type { AnalysisResult, FilterMode, SessionStats, UserConfig } from './types'

/** Serializable note input sent from content script to background */
export interface NoteInput {
  noteId: string
  title: string
  content: string
  author: string
  likeCount: string
}

// ── Message definitions ────────────────────────────────────

export interface AnalyzeNotesMessage {
  type: 'ANALYZE_NOTES'
  payload: { notes: NoteInput[] }
}

export interface AnalyzeResultMessage {
  type: 'ANALYZE_RESULT'
  payload: { results: AnalysisResult[] }
}

export interface GetStatusMessage {
  type: 'GET_STATUS'
}

export interface StatusUpdateMessage {
  type: 'STATUS_UPDATE'
  payload: SessionStats
}

export interface ConfigChangedMessage {
  type: 'CONFIG_CHANGED'
  payload: Partial<UserConfig>
}

export interface ToggleEnabledMessage {
  type: 'TOGGLE_ENABLED'
  payload: { enabled: boolean }
}

export interface SetFilterModeMessage {
  type: 'SET_FILTER_MODE'
  payload: { mode: FilterMode }
}

export interface GetDailyStatsMessage {
  type: 'GET_DAILY_STATS'
}

export interface AnalyzeDetailMessage {
  type: 'ANALYZE_DETAIL'
  payload: {
    noteId: string
    title: string
    content: string
    author: string
  }
}

export interface DetailResultMessage {
  type: 'DETAIL_RESULT'
  payload: {
    noteId: string
    result: AnalysisResult
  }
}

/** Union of all messages that can be sent */
export type Message =
  | AnalyzeNotesMessage
  | AnalyzeResultMessage
  | GetStatusMessage
  | StatusUpdateMessage
  | ConfigChangedMessage
  | ToggleEnabledMessage
  | SetFilterModeMessage
  | GetDailyStatsMessage
  | AnalyzeDetailMessage
  | DetailResultMessage

// ── Response types ─────────────────────────────────────────

export type MessageResponse<T extends Message['type']> =
  T extends 'ANALYZE_NOTES' ? { results: AnalysisResult[] } :
  T extends 'GET_STATUS' ? SessionStats :
  T extends 'TOGGLE_ENABLED' ? { ok: boolean } :
  T extends 'SET_FILTER_MODE' ? { ok: boolean } :
  T extends 'CONFIG_CHANGED' ? { ok: boolean } :
  T extends 'ANALYZE_DETAIL' ? { received: boolean } :
  void

// ── Send helpers ───────────────────────────────────────────

/** Send a message to the background service worker and await a typed response */
export function sendToBackground<T extends Message>(
  message: T
): Promise<MessageResponse<T['type']>> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else {
        resolve(response)
      }
    })
  })
}

/** Send a message to all content scripts in a specific tab */
export function sendToTab<T extends Message>(
  tabId: number,
  message: T
): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else {
        resolve()
      }
    })
  })
}
