import { useState, useEffect } from 'react'
import type { UserConfig, LowQualityTag, AnalysisMode } from '@/shared/types'
import { DEFAULT_CONFIG, DEFAULT_API_URLS, SUGGESTED_MODELS, TAG_LABELS } from '@/shared/constants'

const ALL_TAGS: LowQualityTag[] = [
  'anxiety', 'clickbait', 'misinformation', 'hidden_ad', 'emotional_manipulation',
]

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
        next.apiBaseUrl = '' // reset to default when switching provider
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
    return <div className="max-w-xl mx-auto p-8 text-gray-400">Loading...</div>
  }

  const suggestions = SUGGESTED_MODELS[config.llmProvider]
  const defaultUrl = DEFAULT_API_URLS[config.llmProvider]

  return (
    <div className="max-w-xl mx-auto p-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">XHS Content Radar</h1>
      <p className="text-sm text-gray-500 mb-8">Settings</p>

      <div className="space-y-6">
        {/* Analysis Mode */}
        <Field label="Analysis Mode">
          <div className="flex gap-4">
            {([
              ['detailed', '详细模式', 'LLM 返回评分、标签和理由'],
              ['lite', '精简模式', 'LLM 只返回 LOW/OK，更快更省'],
            ] as const).map(([mode, label, desc]) => (
              <label key={mode} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="analysisMode"
                  value={mode}
                  checked={config.analysisMode === mode}
                  onChange={() => updateField('analysisMode', mode as AnalysisMode)}
                  className="accent-red-500"
                />
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-gray-400">({desc})</span>
              </label>
            ))}
          </div>
        </Field>

        {/* Keyword Pre-filter (always active) */}
        <Field label="Keyword Pre-filter">
          <textarea
            value={config.keywordList.join('\n')}
            onChange={e => updateField('keywordList',
              e.target.value.split('\n').map(s => s.trim()).filter(Boolean)
            )}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent font-mono"
            placeholder={'震惊\n必看\n不看后悔\n...'}
          />
          <p className="text-xs text-gray-400 mt-1">
            前置过滤：标题命中关键词直接标记，不调 API。未命中的再交给 LLM。
          </p>
        </Field>

        {/* Provider */}
        <Field label="API Protocol">
          <div className="flex gap-4">
            {(['openai', 'anthropic'] as const).map(p => (
              <label key={p} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="provider"
                  value={p}
                  checked={config.llmProvider === p}
                  onChange={() => updateField('llmProvider', p)}
                  className="accent-red-500"
                />
                <span className="text-sm">
                  {p === 'openai' ? 'OpenAI Compatible' : 'Anthropic Compatible'}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {config.llmProvider === 'openai'
              ? 'Compatible with OpenAI, Azure, OpenRouter, DeepSeek, local models, etc.'
              : 'Compatible with Anthropic API and compatible proxies.'}
          </p>
        </Field>

        {/* API Base URL */}
        <Field label="API Base URL">
          <input
            type="url"
            value={config.apiBaseUrl}
            onChange={e => updateField('apiBaseUrl', e.target.value)}
            placeholder={defaultUrl}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent font-mono"
          />
          <p className="text-xs text-gray-400 mt-1">
            Leave empty to use the official endpoint. For third-party providers, enter the full chat completions URL.
          </p>
        </Field>

        {/* API Key */}
        <Field label="API Key">
          <input
            type="password"
            value={config.apiKey}
            onChange={e => updateField('apiKey', e.target.value)}
            placeholder={config.llmProvider === 'openai' ? 'sk-...' : 'sk-ant-...'}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
          />
        </Field>

        {/* Model */}
        <Field label="Model">
          <input
            type="text"
            list="model-suggestions"
            value={config.model}
            onChange={e => updateField('model', e.target.value)}
            placeholder="Enter model name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent font-mono"
          />
          <datalist id="model-suggestions">
            {suggestions.map(m => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <p className="text-xs text-gray-400 mt-1">
            Select a suggested model or type any model name your provider supports.
          </p>
        </Field>

        <Field label={`Sensitivity: ${config.sensitivity}`}>
          <input
            type="range"
            min={0}
            max={100}
            value={config.sensitivity}
            onChange={e => updateField('sensitivity', Number(e.target.value))}
            className="w-full accent-red-500"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>Lenient</span>
            <span>Strict</span>
          </div>
        </Field>

        {/* Enabled Tags */}
        <Field label="Filter Types">
          <div className="space-y-2">
            {ALL_TAGS.map(tag => (
              <label key={tag} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enabledTags.includes(tag)}
                  onChange={() => toggleTag(tag)}
                  className="w-4 h-4 accent-red-500 rounded"
                />
                <span className="text-sm text-gray-700">{TAG_LABELS[tag]}</span>
                <span className="text-xs text-gray-400">({tag})</span>
              </label>
            ))}
          </div>
        </Field>

        <hr className="border-gray-200" />

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
          >
            {saved ? 'Saved!' : 'Save'}
          </button>

          <button
            onClick={handleClearCache}
            className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            {cacheCleared ? 'Cleared!' : 'Clear Cache'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      {children}
    </div>
  )
}
