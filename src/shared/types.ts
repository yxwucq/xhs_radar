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

/** LLM analysis mode — detailed (full JSON) or lite (LOW/OK) */
export type AnalysisMode = 'detailed' | 'lite'

export interface ScenarioPreset {
  id: string
  name: string
  description: string
  sensitivity: number
  enabledTags: LowQualityTag[]
  analysisMode: AnalysisMode
  filterMode: FilterMode
  /** Natural language hint injected into the LLM system prompt for this scenario */
  promptHint: string
  builtin?: boolean
}

/** User configuration stored in chrome.storage.local */
export interface UserConfig {
  enabled: boolean
  filterMode: FilterMode
  analysisMode: AnalysisMode
  llmProvider: 'openai' | 'anthropic'
  apiKey: string
  /** Custom API base URL. Empty string means use official endpoint. */
  apiBaseUrl: string
  model: string
  sensitivity: number
  enabledTags: LowQualityTag[]
  /** Per-category keyword rules for pre-filter. User-customizable. */
  keywordRules: Record<LowQualityTag, string[]>
  /** User-created custom filter rules */
  customRules: CustomRule[]
  /** Extra prompt guidance for the currently active scenario. */
  promptHint: string
  activeScenarioId: string
  scenarios: ScenarioPreset[]
  /** Scenario IDs to show in Popup quick-switch bar (max 4) */
  quickScenarioIds: string[]
  /** Max notes to pre-analyze from feed API (0 = unlimited) */
  prefetchLimit: number
  /**
   * Inject `thinking: { type: "disabled" }` into OpenAI-compatible requests.
   * Recognized by Kimi K2.6, DeepSeek V4, and similar models that default to
   * thinking on. Has no effect on official OpenAI / Anthropic.
   * Falls back per endpoint within the session if the server rejects the field.
   */
  disableReasoning: boolean
}

export interface CustomRule {
  id: string
  name: string
  /** LLM instruction — tells the model what to filter (e.g. "过滤推销加密货币的内容") */
  description: string
  /** Keywords for instant pre-filter (optional, complements LLM) */
  keywords: string[]
  enabled: boolean
}

/** Last LLM error, surfaced to popup for user notification */
export interface LastLLMError {
  type: 'auth' | 'timeout' | 'network' | 'unknown'
  message: string
  /** Unix ms */
  timestamp: number
}

/** Runtime stats stored in chrome.storage.session */
export interface SessionStats {
  scanned: number
  marked: number
  cacheHits: number
  apiCalls: number
  errors: number
}

/** Per-day stats for history tracking */
export interface DailyStats {
  date: string // YYYY-MM-DD
  scanned: number
  marked: number
  apiCalls: number
}
