import type { LowQualityTag, UserConfig, ScenarioPreset, CustomRule } from './types'

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
  /** Title inside the note detail overlay */
  detailTitle: [
    '#detail-title',
    '.note-content .title',
  ],

  /** Body/description text inside the note detail overlay */
  detailDesc: [
    '#detail-desc',
    '.note-content .desc',
  ],
} as const

/** Data attribute to mark processed detail overlays */
export const DETAIL_PROCESSED_ATTR = 'data-xhs-radar-detail-processed'

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

/** Category descriptions shown in UI */
export const TAG_DESCRIPTIONS: Record<LowQualityTag, string> = {
  clickbait: '标题夸张、使用诱导词、悬念式标题',
  anxiety: '利用年龄/容貌/财富/育儿焦虑吸引点击',
  misinformation: '伪科学、未经证实的医疗建议、编造故事',
  hidden_ad: '伪装成真实分享的广告、虚假种草、品牌植入',
  emotional_manipulation: '刻意煽动对立、制造矛盾、贩卖负面情绪',
}

/** Default per-category keyword rules */
export const DEFAULT_KEYWORD_RULES: Record<LowQualityTag, string[]> = {
  clickbait: [
    '震惊', '必看', '不看后悔', '速看', '赶紧收藏',
    '99%的人不知道', '建议收藏', '删前快看',
    '再不看就晚了', '万万没想到', '居然',
  ],
  anxiety: [
    '容貌焦虑', '身材焦虑', '年龄焦虑',
    '一夜暴富', '月入过万', '躺赚', '年薪百万',
    '再不努力就晚了', '同龄人已经',
  ],
  misinformation: [
    '太可怕了', '千万别', '这都不知道',
    '医生都不告诉你', '偏方', '神药',
  ],
  hidden_ad: [
    '好用到哭', '无限回购', '闺蜜推荐', '自用分享',
    '平替', '必入', '绝绝子',
  ],
  emotional_manipulation: [
    '心疼', '泪目', '破防了', '看哭了',
    '太讽刺了', '细思极恐', '人间真实',
  ],
}

export const DEFAULT_SCENARIOS: ScenarioPreset[] = [
  {
    id: 'focus',
    name: '专注',
    description: '只保留值得花注意力的内容，压低娱乐化和刺激性干扰。',
    sensitivity: 80,
    enabledTags: ['clickbait', 'hidden_ad', 'emotional_manipulation', 'anxiety', 'misinformation'],
    analysisMode: 'detailed',
    filterMode: 'blur',
    promptHint: '优先过滤分散注意力、低信息密度、娱乐化强、强刺激性的内容；只保留更值得投入注意力的内容。',
    builtin: true,
  },
  {
    id: 'browse',
    name: '获取',
    description: '尽量多看信息，但过滤明显误导、软广和低可信内容。',
    sensitivity: 60,
    enabledTags: ['clickbait', 'misinformation', 'hidden_ad', 'emotional_manipulation'],
    analysisMode: 'detailed',
    filterMode: 'blur',
    promptHint: '优先过滤明显误导、虚假、软广和夸张诱导内容；允许较广泛的信息浏览，但减少被骗和被营销的概率。',
    builtin: true,
  },
  {
    id: 'relax',
    name: '放松',
    description: '允许轻松好玩和无用但有趣的内容，只拦截明显有害项。',
    sensitivity: 35,
    enabledTags: ['misinformation', 'hidden_ad'],
    analysisMode: 'lite',
    filterMode: 'blur',
    promptHint: '允许轻松、好玩、搞笑、八卦、闲聊和生活化内容，不要求高信息密度；仅重点过滤明显误导、诈骗、恶意营销和严重有害内容。',
    builtin: true,
  },
  {
    id: 'calm',
    name: '安宁',
    description: '减少焦虑、冲突和强情绪刺激，保留更平静的内容。',
    sensitivity: 72,
    enabledTags: ['anxiety', 'emotional_manipulation', 'misinformation', 'clickbait', 'hidden_ad'],
    analysisMode: 'lite',
    filterMode: 'blur',
    promptHint: '优先过滤焦虑、冲突、惊悚、愤怒、极端对立和过度刺激内容；保留轻松、平静、治愈和低压内容。',
    builtin: true,
  },
]

export const DEFAULT_SCENARIO_ID = DEFAULT_SCENARIOS[0].id
export const DEFAULT_QUICK_SCENARIO_IDS = DEFAULT_SCENARIOS.slice(0, 4).map(s => s.id)

function cloneKeywordRules(source: Record<LowQualityTag, string[]>): Record<LowQualityTag, string[]> {
  return {
    anxiety: [...(source.anxiety ?? [])],
    clickbait: [...(source.clickbait ?? [])],
    misinformation: [...(source.misinformation ?? [])],
    hidden_ad: [...(source.hidden_ad ?? [])],
    emotional_manipulation: [...(source.emotional_manipulation ?? [])],
  }
}

function cloneCustomRules(source: CustomRule[]) {
  return source.map(rule => ({ ...rule, keywords: [...rule.keywords] }))
}

export function cloneScenario(scenario: ScenarioPreset): ScenarioPreset {
  return {
    ...scenario,
    enabledTags: [...scenario.enabledTags],
  }
}

export function normalizeScenarios(scenarios?: ScenarioPreset[]): ScenarioPreset[] {
  if (!scenarios || scenarios.length === 0) {
    return DEFAULT_SCENARIOS.map(cloneScenario)
  }

  const builtinById = new Map(DEFAULT_SCENARIOS.map(s => [s.id, s]))
  const merged: ScenarioPreset[] = []

  for (const scenario of scenarios) {
    const builtin = builtinById.get(scenario.id)
    if (!builtin && scenario.builtin) {
      continue
    }
    const base = builtin ?? scenario
    merged.push({
      ...cloneScenario(base),
      ...scenario,
      builtin: builtin ? true : scenario.builtin,
      enabledTags: [...(scenario.enabledTags ?? base.enabledTags)],
    })
    if (builtin) builtinById.delete(scenario.id)
  }

  for (const remaining of builtinById.values()) {
    merged.push(cloneScenario(remaining))
  }

  return merged
}

export function applyScenarioToConfig(config: UserConfig, scenario: ScenarioPreset): UserConfig {
  return {
    ...config,
    activeScenarioId: scenario.id,
    filterMode: scenario.filterMode,
    analysisMode: scenario.analysisMode,
    sensitivity: scenario.sensitivity,
    enabledTags: [...scenario.enabledTags],
    promptHint: scenario.promptHint,
    // keywordRules and customRules are global — not overwritten by scenario
  }
}

export function mergeConfigWithDefaults(stored?: Partial<UserConfig> | null): UserConfig {
  const scenarios = normalizeScenarios(stored?.scenarios)
  const defaultScenario = scenarios.find(s => s.id === DEFAULT_SCENARIO_ID) ?? scenarios[0]

  // Base config derives scenario-dependent fields from the default scenario
  const base: UserConfig = {
    enabled: true,
    filterMode: defaultScenario.filterMode,
    analysisMode: defaultScenario.analysisMode,
    llmProvider: 'openai',
    apiKey: '',
    apiBaseUrl: '',
    model: 'gpt-4o-mini',
    sensitivity: defaultScenario.sensitivity,
    enabledTags: [...defaultScenario.enabledTags],
    keywordRules: cloneKeywordRules(DEFAULT_KEYWORD_RULES),
    customRules: [],
    promptHint: defaultScenario.promptHint,
    activeScenarioId: DEFAULT_SCENARIO_ID,
    scenarios,
    quickScenarioIds: DEFAULT_QUICK_SCENARIO_IDS,
    prefetchLimit: 40,
    disableReasoning: false,
  }

  const merged: UserConfig = {
    ...base,
    ...stored,
    enabledTags: [...(stored?.enabledTags ?? base.enabledTags)],
    keywordRules: cloneKeywordRules(stored?.keywordRules ?? base.keywordRules),
    customRules: cloneCustomRules(stored?.customRules ?? base.customRules),
    scenarios,
  }

  // Align config with active scenario to ensure consistency
  const activeScenario = scenarios.find(s => s.id === merged.activeScenarioId)
  if (activeScenario) {
    merged.sensitivity = activeScenario.sensitivity
    merged.enabledTags = [...activeScenario.enabledTags]
    merged.analysisMode = activeScenario.analysisMode
    merged.filterMode = activeScenario.filterMode
    merged.promptHint = activeScenario.promptHint
  }

  // Filter out quickScenarioIds referencing deleted scenarios, deduplicate, backfill if needed
  const scenarioIds = new Set(scenarios.map(s => s.id))
  const seen = new Set<string>()
  const validQuickIds = (stored?.quickScenarioIds ?? base.quickScenarioIds)
    .filter(id => {
      if (!scenarioIds.has(id) || seen.has(id)) return false
      seen.add(id)
      return true
    })
  if (validQuickIds.length === 0) {
    merged.quickScenarioIds = scenarios.slice(0, 4).map(s => s.id)
  } else {
    merged.quickScenarioIds = validQuickIds
  }

  return merged
}

/** Default user configuration */
export const DEFAULT_CONFIG: UserConfig = mergeConfigWithDefaults()
