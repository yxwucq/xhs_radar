/** Low-quality content category tags */
export type LowQualityTag =
  | 'anxiety'
  | 'clickbait'
  | 'misinformation'
  | 'hidden_ad'
  | 'emotional_manipulation'

/** Raw data extracted from a note card DOM element */
export interface NoteData {
  noteId: string
  title: string
  /** Content preview — empty string if not available (XHS feed cards typically have no description) */
  content: string
  author: string
  /** Like count as displayed string (e.g. "665", "1.2万") */
  likeCount: string
  /** The DOM element of the note card (not serialized) */
  element: HTMLElement
}

/** LLM analysis result for a single note */
export interface AnalysisResult {
  noteId: string
  score: number
  isLowQuality: boolean
  tags: LowQualityTag[]
  reason: string
}

/** Risk level derived from score */
export type RiskLevel = 'high' | 'medium' | 'normal'

/** Display mode for marking low-quality content */
export type FilterMode = 'blur' | 'vanish'

/** User configuration stored in chrome.storage.local */
export interface UserConfig {
  enabled: boolean
  filterMode: FilterMode
  llmProvider: 'openai' | 'anthropic'
  apiKey: string
  /** Custom API base URL. Empty string means use official endpoint. */
  apiBaseUrl: string
  model: string
  sensitivity: number
  enabledTags: LowQualityTag[]
}

/** Runtime stats stored in chrome.storage.session */
export interface SessionStats {
  scanned: number
  marked: number
  cacheHits: number
  apiCalls: number
  errors: number
}
