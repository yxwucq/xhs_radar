import { useState, useEffect } from 'react'
import type { UserConfig, LowQualityTag, CustomRule, ScenarioPreset } from '@/shared/types'
import {
  DEFAULT_CONFIG,
  DEFAULT_API_URLS,
  SUGGESTED_MODELS,
  RECOMMENDED_PRESETS,
  TAG_LABELS,
  TAG_DESCRIPTIONS,
  applyScenarioToConfig,
  cloneScenario,
  mergeConfigWithDefaults,
} from '@/shared/constants'
import type { RecommendedPreset } from '@/shared/constants'

const ALL_TAGS: LowQualityTag[] = [
  'anxiety', 'clickbait', 'misinformation', 'hidden_ad', 'emotional_manipulation',
]

const TAG_ICONS: Record<LowQualityTag, string> = {
  anxiety: '😰',
  clickbait: '🎣',
  misinformation: '🚫',
  hidden_ad: '📢',
  emotional_manipulation: '🎭',
}

export default function App() {
  const [config, setConfig] = useState<UserConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const [cacheCleared, setCacheCleared] = useState(false)
  const [expandedTag, setExpandedTag] = useState<LowQualityTag | null>(null)
  const [apiTest, setApiTest] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [apiTestMsg, setApiTestMsg] = useState('')

  useEffect(() => {
    chrome.storage.local.get('config').then((stored) => {
      setConfig(mergeConfigWithDefaults(stored.config))
      setLoading(false)
      // Delay to avoid auto-save on initial load
      setTimeout(() => setInitialized(true), 100)
    })
  }, [])

  // Auto-save on any config change
  useEffect(() => {
    if (!initialized) return
    chrome.storage.local.set({ config })
    chrome.runtime.sendMessage({ type: 'CONFIG_CHANGED', payload: config }).catch(() => {})
  }, [config, initialized])

  function syncScenarioIfEditable(next: UserConfig): UserConfig {
    const active = next.scenarios.find(s => s.id === next.activeScenarioId)
    if (!active || active.builtin) return next

    return {
      ...next,
      scenarios: next.scenarios.map(s => s.id === active.id ? {
        ...s,
        sensitivity: next.sensitivity,
        enabledTags: [...next.enabledTags],
        analysisMode: next.analysisMode,
        filterMode: next.filterMode,
        promptHint: next.promptHint,
      } : s),
    }
  }

  function applyScenario(scenarioId: string) {
    setConfig(prev => {
      const scenario = prev.scenarios.find(s => s.id === scenarioId)
      if (!scenario) return prev
      return applyScenarioToConfig(prev, scenario)
    })
  }

  function duplicateActiveScenario() {
    setConfig(prev => {
      const source = prev.scenarios.find(s => s.id === prev.activeScenarioId) ?? prev.scenarios[0]
      const copy: ScenarioPreset = {
        ...cloneScenario(source),
        id: `custom-${Date.now().toString(36)}`,
        name: `${source.name}副本`,
        description: '基于当前配置复制，可继续自定义调整。',
        sensitivity: prev.sensitivity,
        enabledTags: [...prev.enabledTags],
        analysisMode: prev.analysisMode,
        filterMode: prev.filterMode,
        promptHint: prev.promptHint,
        builtin: false,
      }

      const next = {
        ...prev,
        scenarios: [...prev.scenarios, copy],
      }
      return applyScenarioToConfig(next, copy)
    })
  }

  function addNewScenario() {
    setConfig(prev => {
      const newScenario: ScenarioPreset = {
        id: `custom-${Date.now().toString(36)}`,
        name: '新情景',
        description: '',
        sensitivity: 50,
        enabledTags: [...prev.enabledTags],
        analysisMode: 'detailed',
        filterMode: 'blur',
        promptHint: '',
        builtin: false,
      }

      const next = {
        ...prev,
        scenarios: [...prev.scenarios, newScenario],
      }
      return applyScenarioToConfig(next, newScenario)
    })
  }

  function updateScenarioField<K extends keyof ScenarioPreset>(id: string, key: K, value: ScenarioPreset[K]) {
    setConfig(prev => {
      const next = {
        ...prev,
        scenarios: prev.scenarios.map(s => s.id === id ? { ...s, [key]: value } : s),
      }
      // If editing the active scenario, sync to global config
      if (id === prev.activeScenarioId) {
        const updated = next.scenarios.find(s => s.id === id)!
        return applyScenarioToConfig(next, updated)
      }
      return next
    })
  }

  function toggleScenarioTag(id: string, tag: LowQualityTag) {
    setConfig(prev => {
      const scenario = prev.scenarios.find(s => s.id === id)
      if (!scenario) return prev
      const tags = scenario.enabledTags.includes(tag)
        ? scenario.enabledTags.filter(t => t !== tag)
        : [...scenario.enabledTags, tag]
      const next = {
        ...prev,
        scenarios: prev.scenarios.map(s => s.id === id ? { ...s, enabledTags: tags } : s),
      }
      if (id === prev.activeScenarioId) {
        return { ...next, enabledTags: tags }
      }
      return next
    })
  }

  function updateScenarioMeta(id: string, patch: Partial<Pick<ScenarioPreset, 'name' | 'description' | 'promptHint'>>) {
    setConfig(prev => {
      const next = {
        ...prev,
        scenarios: prev.scenarios.map(s => s.id === id ? { ...s, ...patch } : s),
      }
      if (id !== prev.activeScenarioId) return next
      return {
        ...next,
        promptHint: patch.promptHint ?? next.promptHint,
      }
    })
  }

  function removeScenario(id: string) {
    setConfig(prev => {
      const target = prev.scenarios.find(s => s.id === id)
      if (!target || target.builtin) return prev

      const scenarios = prev.scenarios.filter(s => s.id !== id)
      const quickScenarioIds = (prev.quickScenarioIds ?? []).filter(qid => qid !== id)
      const fallback = scenarios.find(s => s.id === 'focus') ?? scenarios[0]
      if (prev.activeScenarioId !== id || !fallback) {
        return { ...prev, scenarios, quickScenarioIds }
      }
      return applyScenarioToConfig({ ...prev, scenarios, quickScenarioIds }, fallback)
    })
  }

  function updateField<K extends keyof UserConfig>(key: K, value: UserConfig[K]) {
    setConfig(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'llmProvider') {
        const provider = value as UserConfig['llmProvider']
        next.model = SUGGESTED_MODELS[provider][0]
        next.apiBaseUrl = ''
      }
      return syncScenarioIfEditable(next)
    })
  }

  function applyPreset(preset: RecommendedPreset) {
    setConfig(prev => ({
      ...prev,
      llmProvider: preset.provider,
      apiBaseUrl: preset.apiBaseUrl,
      model: preset.model,
      disableReasoning: preset.disableReasoning,
    }))
  }

  function toggleTag(tag: LowQualityTag) {
    setConfig(prev => {
      const tags = prev.enabledTags.includes(tag)
        ? prev.enabledTags.filter(t => t !== tag)
        : [...prev.enabledTags, tag]
      return syncScenarioIfEditable({ ...prev, enabledTags: tags })
    })
  }

  function addCustomRule() {
    const rule: CustomRule = {
      id: Date.now().toString(36),
      name: '新规则',
      description: '',
      keywords: [],
      enabled: true,
    }
    setConfig(prev => syncScenarioIfEditable({ ...prev, customRules: [...(prev.customRules ?? []), rule] }))
  }

  function updateCustomRule(id: string, patch: Partial<CustomRule>) {
    setConfig(prev => syncScenarioIfEditable({
      ...prev,
      customRules: (prev.customRules ?? []).map(r => r.id === id ? { ...r, ...patch } : r),
    }))
  }

  function removeCustomRule(id: string) {
    setConfig(prev => syncScenarioIfEditable({
      ...prev,
      customRules: (prev.customRules ?? []).filter(r => r.id !== id),
    }))
  }

  function updateKeywordsForTag(tag: LowQualityTag, keywords: string[]) {
    setConfig(prev => syncScenarioIfEditable({
      ...prev,
      keywordRules: { ...prev.keywordRules, [tag]: keywords },
    }))
  }

  async function requestApiPermission(url: string): Promise<boolean> {
    try {
      const origin = new URL(url).origin
      return await chrome.permissions.request({ origins: [origin + '/*'] })
    } catch {
      return false
    }
  }

  async function handleTestApi() {
    if (!config.apiKey) {
      setApiTest('fail')
      setApiTestMsg('请先填写 API Key')
      return
    }
    setApiTest('testing')
    setApiTestMsg('')
    try {
      const baseUrl = config.apiBaseUrl || DEFAULT_API_URLS[config.llmProvider]
      const isAnthropic = config.llmProvider === 'anthropic'

      // Request host permission for the API endpoint
      const granted = await requestApiPermission(baseUrl)
      if (!granted) {
        setApiTest('fail')
        setApiTestMsg('需要授权访问该 API 地址')
        return
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (isAnthropic) {
        headers['x-api-key'] = config.apiKey
        headers['anthropic-version'] = '2023-06-01'
        headers['anthropic-dangerous-direct-browser-access'] = 'true'
      } else {
        headers['Authorization'] = `Bearer ${config.apiKey}`
      }

      const body = isAnthropic
        ? { model: config.model, max_tokens: 32, messages: [{ role: 'user', content: 'Hi' }] }
        : { model: config.model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 32 }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const resp = await fetch(baseUrl, {
        method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        setApiTest('fail')
        setApiTestMsg(`HTTP ${resp.status}: ${text.slice(0, 80)}`)
        return
      }

      const text = await resp.text()
      try { JSON.parse(text) } catch {
        setApiTest('fail')
        setApiTestMsg('响应不是 JSON')
        return
      }

      setApiTest('ok')
      setApiTestMsg(`${config.model} 连接成功`)
    } catch (e) {
      setApiTest('fail')
      setApiTestMsg((e as Error).message?.includes('aborted') ? '请求超时 (10s)' : (e as Error).message?.slice(0, 80) || '连接失败')
    }
  }

  async function handleClearCache() {
    await chrome.storage.local.remove('analysisCache')
    setCacheCleared(true)
    setTimeout(() => setCacheCleared(false), 2000)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted text-sm">Loading...</div>
      </div>
    )
  }

  const suggestions = SUGGESTED_MODELS[config.llmProvider]
  const defaultUrl = DEFAULT_API_URLS[config.llmProvider]

  return (
    <div className="max-w-xl mx-auto py-12 px-6">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-light flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4845A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="3"/>
              <line x1="12" y1="2" x2="12" y2="5"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
              <line x1="2" y1="12" x2="5" y2="12"/>
              <line x1="19" y1="12" x2="22" y2="12"/>
            </svg>
          </div>
          <div>
            <h1 className="font-serif text-2xl font-bold text-bark tracking-tight">红薯雷达</h1>
            <p className="text-xs text-muted mt-0.5">小红书内容质量守护</p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* ── Scenarios ── */}
        <Section title="情景模式" hint="切换不同使用状态下的过滤策略，自定义情景可自由编辑所有参数">
          <div className="space-y-3">
            {config.scenarios.map((scenario) => {
              const isActive = config.activeScenarioId === scenario.id
              const isCustom = !scenario.builtin
              return (
                <div
                  key={scenario.id}
                  className={`rounded-xl border-[1.5px] p-3.5 transition-all duration-200 cursor-pointer ${
                    isActive ? 'border-amber-warm bg-amber-light/40 shadow-card' : 'border-sand bg-white hover:border-amber-warm/40'
                  }`}
                  onClick={() => !isActive && applyScenario(scenario.id)}
                >
                  {/* Header row */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      {isCustom ? (
                        <input
                          type="text"
                          value={scenario.name}
                          onChange={e => updateScenarioMeta(scenario.id, { name: e.target.value })}
                          onClick={e => e.stopPropagation()}
                          className="w-full text-sm font-medium text-bark bg-transparent border-none outline-none p-0"
                        />
                      ) : (
                        <div className="text-sm font-medium text-bark">{scenario.name}</div>
                      )}
                      <p className="text-[10px] text-muted mt-1">
                        灵敏度 {scenario.sensitivity} · {scenario.enabledTags.length} 类过滤 · {scenario.filterMode === 'blur' ? '模糊' : '隐藏'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isActive && (
                        <span className="px-2 py-1 rounded-lg text-[10px] font-medium bg-amber-warm text-white">当前</span>
                      )}
                      {isCustom && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeScenario(scenario.id) }}
                          className="text-[10px] text-muted hover:text-coral transition-colors px-1"
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded panel — shown when active */}
                  {isActive && (
                    <div className="mt-3 pt-3 border-t border-sand/60 space-y-3" onClick={e => e.stopPropagation()}>
                      {/* Description */}
                      {isCustom ? (
                        <div>
                          <span className="text-[11px] text-muted font-medium">描述</span>
                          <input
                            type="text"
                            value={scenario.description}
                            onChange={e => updateScenarioMeta(scenario.id, { description: e.target.value })}
                            className="input-field text-xs mt-1"
                            placeholder="这个情景的用途"
                          />
                        </div>
                      ) : scenario.description ? (
                        <p className="text-[11px] text-muted leading-relaxed">{scenario.description}</p>
                      ) : null}

                      {/* Sensitivity */}
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted font-medium">灵敏度</span>
                          <span className="text-[11px] text-bark font-medium">{scenario.sensitivity}</span>
                        </div>
                        {isCustom ? (
                          <>
                            <input
                              type="range" min="10" max="95" step="5"
                              value={scenario.sensitivity}
                              onChange={e => updateScenarioField(scenario.id, 'sensitivity', Number(e.target.value))}
                              className="w-full mt-1"
                            />
                            <div className="flex justify-between text-[9px] text-muted">
                              <span>宽松</span><span>严格</span>
                            </div>
                          </>
                        ) : (
                          <div className="w-full bg-sand/50 rounded-full h-1.5 mt-2">
                            <div className="bg-amber-warm/60 h-1.5 rounded-full" style={{ width: `${scenario.sensitivity}%` }} />
                          </div>
                        )}
                      </div>

                      {/* Filter mode */}
                      <div>
                        <span className="text-[11px] text-muted font-medium">过滤模式</span>
                        <div className="flex gap-2 mt-1.5">
                          {(['blur', 'vanish'] as const).map(mode => (
                            <button
                              key={mode}
                              onClick={() => isCustom && updateScenarioField(scenario.id, 'filterMode', mode)}
                              className={`flex-1 py-1.5 rounded-lg text-[11px] transition-all ${
                                scenario.filterMode === mode
                                  ? 'bg-amber-warm/15 text-amber-warm font-medium border border-amber-warm/30'
                                  : 'bg-sand/50 text-muted border border-transparent'
                              } ${isCustom ? 'cursor-pointer hover:border-sand' : 'cursor-default'}`}
                            >
                              {mode === 'blur' ? '模糊' : '隐藏'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Analysis mode */}
                      <div>
                        <span className="text-[11px] text-muted font-medium">分析模式</span>
                        <div className="flex gap-2 mt-1.5">
                          {(['detailed', 'lite'] as const).map(mode => (
                            <button
                              key={mode}
                              onClick={() => isCustom && updateScenarioField(scenario.id, 'analysisMode', mode)}
                              className={`flex-1 py-1.5 rounded-lg text-[11px] transition-all ${
                                scenario.analysisMode === mode
                                  ? 'bg-amber-warm/15 text-amber-warm font-medium border border-amber-warm/30'
                                  : 'bg-sand/50 text-muted border border-transparent'
                              } ${isCustom ? 'cursor-pointer hover:border-sand' : 'cursor-default'}`}
                            >
                              {mode === 'detailed' ? '详细' : '精简'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Tag toggles */}
                      <div>
                        <span className="text-[11px] text-muted font-medium">过滤类型</span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {ALL_TAGS.map(tag => (
                            <button
                              key={tag}
                              onClick={() => isCustom && toggleScenarioTag(scenario.id, tag)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] transition-all ${
                                scenario.enabledTags.includes(tag)
                                  ? 'bg-amber-warm/15 text-amber-warm font-medium border border-amber-warm/30'
                                  : 'bg-sand/50 text-muted border border-transparent'
                              } ${isCustom ? 'cursor-pointer hover:border-sand' : 'cursor-default'}`}
                            >
                              {TAG_ICONS[tag]} {TAG_LABELS[tag]}
                            </button>
                          ))}
                          {(config.customRules ?? []).map(rule => (
                            <button
                              key={rule.id}
                              onClick={() => updateCustomRule(rule.id, { enabled: !rule.enabled })}
                              className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer ${
                                rule.enabled
                                  ? 'bg-amber-warm/15 text-amber-warm font-medium border border-amber-warm/30'
                                  : 'bg-sand/50 text-muted border border-transparent hover:border-sand'
                              }`}
                            >
                              {rule.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Prompt hint */}
                      <div>
                        <span className="text-[11px] text-muted font-medium">AI 提示词</span>
                        <textarea
                          value={scenario.promptHint}
                          onChange={e => isCustom && updateScenarioMeta(scenario.id, { promptHint: e.target.value })}
                          rows={2}
                          className={`input-field text-xs mt-1 ${!isCustom ? 'opacity-70' : ''}`}
                          placeholder="告诉模型这个情景下更应该少看什么、保留什么"
                          readOnly={!isCustom}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={addNewScenario}
                className="flex-1 py-2.5 rounded-xl border-[1.5px] border-dashed border-sand text-xs text-muted hover:border-amber-warm hover:text-amber-warm transition-all duration-200 flex items-center justify-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                新建情景
              </button>
              <button
                onClick={duplicateActiveScenario}
                className="flex-1 py-2.5 rounded-xl border-[1.5px] border-dashed border-sand text-xs text-muted hover:border-amber-warm hover:text-amber-warm transition-all duration-200 flex items-center justify-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                复制当前
              </button>
            </div>

            {/* Quick-switch config */}
            <div className="mt-4 pt-4 border-t border-sand/60">
              <span className="text-[11px] text-muted font-medium">弹窗快捷切换（最多 4 个）</span>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {config.scenarios.map(s => {
                  const isQuick = (config.quickScenarioIds ?? []).includes(s.id)
                  const count = (config.quickScenarioIds ?? []).length
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        setConfig(prev => {
                          const ids = prev.quickScenarioIds ?? []
                          const next = ids.includes(s.id)
                            ? ids.filter(id => id !== s.id)
                            : ids.length < 4 ? [...ids, s.id] : ids
                          return { ...prev, quickScenarioIds: next }
                        })
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] transition-all ${
                        isQuick
                          ? 'bg-amber-warm/15 text-amber-warm font-medium border border-amber-warm/30'
                          : count >= 4
                            ? 'bg-sand/30 text-muted/40 border border-transparent cursor-not-allowed'
                            : 'bg-sand/50 text-muted border border-transparent hover:border-sand'
                      }`}
                      disabled={!isQuick && count >= 4}
                    >
                      {s.name}
                    </button>
                  )
                })}
              </div>
              <p className="text-[10px] text-muted mt-1.5">选中的情景会出现在弹窗面板的快捷切换栏</p>
            </div>
          </div>
        </Section>

        {/* ── Keyword Rules (global, shared across scenarios) ── */}
        <Section title="关键词规则" hint="全局关键词匹配，所有情景共享，命中即标记无需 API">
          <div className="space-y-2.5">
            {ALL_TAGS.map(tag => {
              const isEnabled = config.enabledTags.includes(tag)
              const isExpanded = expandedTag === tag
              const keywords = config.keywordRules?.[tag] ?? []
              return (
                <div key={tag} className={`rounded-xl border-[1.5px] transition-all duration-200 overflow-hidden ${
                  isEnabled ? 'border-sand' : 'border-sand/50 opacity-60'
                }`}>
                  {/* Header */}
                  <div className="flex items-center gap-3 p-3 cursor-pointer"
                    onClick={() => setExpandedTag(isExpanded ? null : tag)}>
                    <span className="text-base">{TAG_ICONS[tag]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-bark">{TAG_LABELS[tag]}</div>
                      <div className="text-[11px] text-muted truncate">{TAG_DESCRIPTIONS[tag]}</div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleTag(tag) }}
                      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                        isEnabled ? 'bg-amber-warm' : 'bg-sand'
                      }`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        isEnabled ? 'translate-x-4' : ''
                      }`} />
                    </button>
                    <svg className={`w-4 h-4 text-muted transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>
                  {/* Expanded: keyword editor */}
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-sand/60">
                      <div className="mt-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] text-muted font-medium">关键词（每行一个）</span>
                          <span className="text-[10px] text-muted">{keywords.length} 个</span>
                        </div>
                        <textarea
                          value={keywords.join('\n')}
                          onChange={e => updateKeywordsForTag(tag,
                            e.target.value.split('\n').map(s => s.trim()).filter(Boolean)
                          )}
                          rows={4}
                          className="input-field mono text-xs"
                          placeholder="输入关键词，每行一个..."
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Section>

        {/* ── Custom Rules ── */}
        <Section title="自定义规则" hint="创建你自己的过滤规则">
          <div className="space-y-2.5">
            {(config.customRules ?? []).map(rule => (
              <div key={rule.id} className={`rounded-xl border-[1.5px] transition-all duration-200 overflow-hidden ${
                rule.enabled ? 'border-sand' : 'border-sand/50 opacity-60'
              }`}>
                <div className="flex items-center gap-3 p-3">
                  <span className="text-base">📌</span>
                  <input
                    type="text"
                    value={rule.name}
                    onChange={e => updateCustomRule(rule.id, { name: e.target.value })}
                    className="flex-1 text-sm font-medium text-bark bg-transparent border-none outline-none"
                    placeholder="规则名称"
                  />
                  <button
                    onClick={() => updateCustomRule(rule.id, { enabled: !rule.enabled })}
                    className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                      rule.enabled ? 'bg-amber-warm' : 'bg-sand'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      rule.enabled ? 'translate-x-4' : ''
                    }`} />
                  </button>
                  <button
                    onClick={() => removeCustomRule(rule.id)}
                    className="text-muted hover:text-coral transition-colors flex-shrink-0"
                    title="删除规则"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
                <div className="px-3 pb-3 border-t border-sand/60 space-y-3">
                  {/* LLM instruction */}
                  <div className="mt-2.5">
                    <span className="text-[11px] text-muted font-medium">LLM 过滤指令</span>
                    <input
                      type="text"
                      value={rule.description}
                      onChange={e => updateCustomRule(rule.id, { description: e.target.value })}
                      className="input-field text-xs mt-1"
                      placeholder="例：过滤推销加密货币或理财课程的内容"
                    />
                    <p className="text-[10px] text-muted mt-1">告诉 LLM 这条规则要过滤什么（会注入到 prompt 中）</p>
                  </div>
                  {/* Keywords */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] text-muted font-medium">关键词预筛（可选）</span>
                      <span className="text-[10px] text-muted">{rule.keywords.length} 个</span>
                    </div>
                    <textarea
                      value={rule.keywords.join('\n')}
                      onChange={e => updateCustomRule(rule.id, {
                        keywords: e.target.value.split('\n').map(s => s.trim()).filter(Boolean)
                      })}
                      rows={3}
                      className="input-field mono text-xs"
                      placeholder="输入关键词，每行一个（命中直接标记，不调 API）"
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={addCustomRule}
              className="w-full py-2.5 rounded-xl border-[1.5px] border-dashed border-sand text-xs text-muted hover:border-amber-warm hover:text-amber-warm transition-all duration-200 flex items-center justify-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              添加自定义规则
            </button>
          </div>
        </Section>

        {/* ── API Configuration ── */}
        <Section title="API 配置">
          <div className="space-y-4">
            {/* Provider */}
            <div>
              <Label text="协议" />
              <div className="flex gap-3 mt-1.5">
                {(['openai', 'anthropic'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => updateField('llmProvider', p)}
                    className={`flex-1 py-2.5 rounded-xl border-[1.5px] text-xs font-medium transition-all duration-200 ${
                      config.llmProvider === p
                        ? 'border-amber-warm bg-amber-light/50 text-bark'
                        : 'border-sand bg-white text-muted hover:border-amber-warm/40'
                    }`}
                  >
                    {p === 'openai' ? 'OpenAI Compatible' : 'Anthropic'}
                  </button>
                ))}
              </div>
            </div>

            {/* Recommended presets */}
            <div>
              <Label text="推荐配置" />
              <p className="text-[11px] text-muted mt-0.5 mb-1.5">一键填好下方的 URL 与模型</p>
              <div className="flex flex-wrap gap-1.5">
                {RECOMMENDED_PRESETS.map(preset => {
                  const active = config.model === preset.model && config.apiBaseUrl === preset.apiBaseUrl
                  return (
                    <button
                      key={preset.id}
                      onClick={() => applyPreset(preset)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] transition-all ${
                        active
                          ? 'bg-amber-warm/15 text-amber-warm font-medium border border-amber-warm/30'
                          : 'bg-sand/50 text-muted border border-transparent hover:border-sand'
                      }`}
                    >
                      {preset.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Base URL */}
            <div>
              <Label text="API Base URL" />
              <input
                type="url"
                value={config.apiBaseUrl}
                onChange={e => updateField('apiBaseUrl', e.target.value)}
                placeholder={defaultUrl}
                className="input-field mono mt-1.5"
              />
              <p className="text-[11px] text-muted mt-1.5">留空使用官方端点</p>
            </div>

            {/* API Key */}
            <div>
              <Label text="API Key" />
              <input
                type="password"
                value={config.apiKey}
                onChange={e => updateField('apiKey', e.target.value)}
                placeholder={config.llmProvider === 'openai' ? 'sk-...' : 'sk-ant-...'}
                className="input-field mt-1.5"
              />
            </div>

            {/* Model */}
            <div>
              <Label text="模型" />
              <input
                type="text"
                list="model-suggestions"
                value={config.model}
                onChange={e => updateField('model', e.target.value)}
                placeholder="Enter model name"
                className="input-field mono mt-1.5"
              />
              <datalist id="model-suggestions">
                {suggestions.map(m => <option key={m} value={m} />)}
              </datalist>
            </div>

            {/* Disable reasoning toggle */}
            <div className="flex items-start gap-3 pt-1">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-bark">关闭模型思考模式</div>
                <div className="text-[11px] text-muted mt-0.5">
                  适用于 Kimi、DeepSeek 等带默认思考的模型；遇到不支持的服务会自动跳过
                </div>
              </div>
              <button
                onClick={() => updateField('disableReasoning', !config.disableReasoning)}
                className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5 ${
                  config.disableReasoning ? 'bg-amber-warm' : 'bg-sand'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  config.disableReasoning ? 'translate-x-4' : ''
                }`} />
              </button>
            </div>

            {/* Test API */}
            <div className="pt-2">
              <button
                onClick={handleTestApi}
                disabled={apiTest === 'testing'}
                className="btn-secondary text-xs flex items-center gap-2"
              >
                {apiTest === 'testing' ? (
                  <><span className="inline-block w-3 h-3 border-2 border-muted border-t-amber-warm rounded-full animate-spin" />测试中...</>
                ) : (
                  '测试 API 连接'
                )}
              </button>
              {apiTest === 'ok' && (
                <p className="toast text-xs text-sage font-medium mt-2">
                  {apiTestMsg}
                </p>
              )}
              {apiTest === 'fail' && (
                <p className="toast text-xs text-coral font-medium mt-2">
                  {apiTestMsg}
                </p>
              )}
            </div>
          </div>
        </Section>

        {/* ── Prefetch ── */}
        <Section title="预加载" hint="从 feed API 预取笔记数量，滚动到时结果已就绪">
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={100}
              step={10}
              value={config.prefetchLimit}
              onChange={e => updateField('prefetchLimit', Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm font-serif font-semibold text-bark w-8 text-right">
              {config.prefetchLimit || '不限'}
            </span>
          </div>
          <div className="flex justify-between text-[11px] text-muted mt-1">
            <span>关闭</span>
            <span>100 条</span>
          </div>
        </Section>

        {/* ── Sensitivity ── */}
        <Section title="灵敏度">
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={100}
              value={config.sensitivity}
              onChange={e => updateField('sensitivity', Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm font-serif font-semibold text-bark w-8 text-right">
              {config.sensitivity}
            </span>
          </div>
          <div className="flex justify-between text-[11px] text-muted mt-1">
            <span>宽松</span>
            <span>严格</span>
          </div>
        </Section>

        {/* ── Actions ── */}
        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleClearCache} className="btn-secondary">
            {cacheCleared ? '已清除 ✓' : '清除缓存'}
          </button>
          <span className="text-[11px] text-muted">设置修改后自动保存</span>
          <button
            onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') })}
            className="text-[11px] text-muted hover:text-amber-warm transition-colors underline underline-offset-2 ml-auto"
          >
            查看教程
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="section-card">
      <div className="mb-4">
        <h2 className="font-serif text-sm font-semibold text-bark">{title}</h2>
        {hint && <p className="text-[11px] text-muted mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function Label({ text }: { text: string }) {
  return <label className="block text-xs font-medium text-muted">{text}</label>
}
