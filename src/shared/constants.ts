import type { LowQualityTag, UserConfig } from './types'

/**
 * XHS DOM Selectors — centralized here for easy maintenance.
 * When XHS updates their page structure, only this file needs updating.
 *
 * Strategy: use structural selectors where possible,
 * fall back to class-based selectors with multiple candidates.
 */
export const XHS_SELECTORS = {
  /** Container that holds the feed of note cards */
  feedContainer: [
    '#exploreFeeds',
    '.feeds-container',
    '.search-layout__main',
  ],

  /** Individual note card elements within the feed */
  noteCard: [
    'section.note-item',
  ],

  /** Note link — used to extract noteId from href */
  noteLink: [
    'a[href*="/explore/"]',
    'a[href*="/search_result/"]',
  ],

  /** Title text within a note card */
  noteTitle: [
    '.footer a.title span',
    'a.title span',
    'a.title',
  ],

  /**
   * Content/description preview within a note card.
   * NOTE: as of 2026-03, XHS feed cards do NOT display content previews.
   * Cards only show cover image + title + author + like count.
   * These selectors are kept as fallback in case XHS adds descriptions later.
   */
  noteContent: [
    '.desc',
    '.note-desc',
  ],

  /** Author nickname within a note card */
  noteAuthor: [
    '.author-wrapper a.author span.name',
    '.author-wrapper .name',
    'a.author span.name',
  ],

  /** Like count within a note card */
  noteLikeCount: [
    '.like-wrapper .count',
    '.like-wrapper span.count',
  ],
} as const

/** Regex patterns to extract note ID from URLs */
export const NOTE_ID_PATTERNS = [
  /\/explore\/([a-f0-9]{24})/,
  /\/search_result\/([a-f0-9]{24})/,
  /\/discovery\/item\/([a-f0-9]{24})/,
  /\/([a-f0-9]{24})(?:\?|$)/,
]

/** Data attribute to mark processed cards */
export const PROCESSED_ATTR = 'data-xhs-radar-processed'

/** Low-quality tag labels in Chinese */
export const TAG_LABELS: Record<LowQualityTag, string> = {
  anxiety: '焦虑诱导',
  clickbait: '标题党',
  misinformation: '虚假信息',
  hidden_ad: '软广伪装',
  emotional_manipulation: '情绪操控',
}

/** Score thresholds */
export const SCORE_THRESHOLDS = {
  highRisk: 30,
  mediumRisk: 50,
} as const

/** Default user configuration */
/** Default API endpoints per provider */
export const DEFAULT_API_URLS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
} as const

/** Suggested models per provider (shown as hints, user can type any model) */
export const SUGGESTED_MODELS = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1-nano'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
} as const

/** Default keyword list for keyword mode */
export const DEFAULT_KEYWORDS: string[] = [
  '震惊', '必看', '不看后悔', '速看', '赶紧收藏',
  '一夜暴富', '月入过万', '躺赚', '年薪百万',
  '99%的人不知道', '建议收藏', '太可怕了',
  '容貌焦虑', '身材焦虑', '年龄焦虑',
  '这都不知道', '再不看就晚了', '删前快看',
  '千万别', '万万没想到',
]

/** Default user configuration */
export const DEFAULT_CONFIG: UserConfig = {
  enabled: true,
  filterMode: 'blur',
  analysisMode: 'detailed' as const,
  llmProvider: 'openai',
  apiKey: '',
  apiBaseUrl: '',
  model: 'gpt-4o-mini',
  sensitivity: 50,
  enabledTags: [
    'anxiety',
    'clickbait',
    'misinformation',
    'hidden_ad',
    'emotional_manipulation',
  ],
  keywordList: [...DEFAULT_KEYWORDS],
}
