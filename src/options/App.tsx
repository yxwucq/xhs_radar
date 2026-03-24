import { useState, useEffect } from 'react'
import type { UserConfig, LowQualityTag, AnalysisMode } from '@/shared/types'
import { DEFAULT_CONFIG, DEFAULT_API_URLS, SUGGESTED_MODELS, TAG_LABELS } from '@/shared/constants'

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
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cacheCleared, setCacheCleared] = useState(false)

  useEffect(() => {
    chrome.storage.local.get('config').then((stored) => {
      if (stored.config) {
        setConfig({ ...DEFAULT_CONFIG, ...stored.config })
      }
      setLoading(false)
    })
  }, [])

  function updateField<K extends keyof UserConfig>(key: K, value: UserConfig[K]) {
    setConfig(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'llmProvider') {
        const provider = value as UserConfig['llmProvider']
        next.model = SUGGESTED_MODELS[provider][0]
        next.apiBaseUrl = ''
      }
      return next
    })
    setSaved(false)
  }

  function toggleTag(tag: LowQualityTag) {
    setConfig(prev => {
      const tags = prev.enabledTags.includes(tag)
        ? prev.enabledTags.filter(t => t !== tag)
        : [...prev.enabledTags, tag]
      return { ...prev, enabledTags: tags }
    })
    setSaved(false)
  }

  async function handleSave() {
    await chrome.storage.local.set({ config })
    chrome.runtime.sendMessage({ type: 'CONFIG_CHANGED', payload: config })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
            <h1 className="font-serif text-2xl font-bold text-bark tracking-tight">Content Radar</h1>
            <p className="text-xs text-muted mt-0.5">小红书内容质量守护</p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* ── Analysis Mode ── */}
        <Section title="分析模式">
          <div className="flex gap-3">
            {([
              ['detailed', '详细模式', '标签 + 理由'],
              ['lite', '精简模式', '仅 LOW / OK'],
            ] as const).map(([mode, label, desc]) => (
              <button
                key={mode}
                onClick={() => updateField('analysisMode', mode as AnalysisMode)}
                className={`flex-1 p-3.5 rounded-xl border-[1.5px] text-left transition-all duration-200 ${
                  config.analysisMode === mode
                    ? 'border-amber-warm bg-amber-light/50 shadow-card'
                    : 'border-sand bg-white hover:border-amber-warm/40'
                }`}
              >
                <div className={`text-sm font-medium ${config.analysisMode === mode ? 'text-bark' : 'text-muted'}`}>
                  {label}
                </div>
                <div className="text-[11px] text-muted mt-0.5">{desc}</div>
              </button>
            ))}
          </div>
        </Section>

        {/* ── Keyword Pre-filter ── */}
        <Section title="关键词预筛" hint="标题命中关键词直接标记，不调 API">
          <textarea
            value={config.keywordList.join('\n')}
            onChange={e => updateField('keywordList',
              e.target.value.split('\n').map(s => s.trim()).filter(Boolean)
            )}
            rows={5}
            className="input-field mono"
            placeholder={'震惊\n必看\n不看后悔\n...'}
          />
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

        {/* ── Filter Types ── */}
        <Section title="过滤类型">
          <div className="flex flex-wrap gap-2">
            {ALL_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`tag-chip ${config.enabledTags.includes(tag) ? 'selected' : ''}`}
              >
                <span>{TAG_ICONS[tag]}</span>
                <span>{TAG_LABELS[tag]}</span>
              </button>
            ))}
          </div>
        </Section>

        {/* ── Actions ── */}
        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSave} className="btn-primary">
            {saved ? '已保存 ✓' : '保存设置'}
          </button>
          <button onClick={handleClearCache} className="btn-secondary">
            {cacheCleared ? '已清除 ✓' : '清除缓存'}
          </button>
          {saved && (
            <span className="toast text-xs text-sage font-medium">设置已生效</span>
          )}
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
