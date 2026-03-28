import { useState, useEffect } from 'react'
import type { UserConfig } from '@/shared/types'
import { DEFAULT_CONFIG, DEFAULT_API_URLS, SUGGESTED_MODELS } from '@/shared/constants'

export default function App() {
  const [step, setStep] = useState(0)
  const [config, setConfig] = useState<UserConfig>(DEFAULT_CONFIG)
  const [apiTest, setApiTest] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [apiTestMsg, setApiTestMsg] = useState('')

  useEffect(() => {
    chrome.storage.local.get('config').then((stored) => {
      if (stored.config) setConfig({ ...DEFAULT_CONFIG, ...stored.config })
    })
  }, [])

  // Auto-save config changes
  function updateConfig<K extends keyof UserConfig>(key: K, value: UserConfig[K]) {
    setConfig(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'llmProvider') {
        const provider = value as UserConfig['llmProvider']
        next.model = SUGGESTED_MODELS[provider][0]
        next.apiBaseUrl = ''
      }
      chrome.storage.local.set({ config: next })
      chrome.runtime.sendMessage({ type: 'CONFIG_CHANGED', payload: next }).catch(() => {})
      return next
    })
  }

  async function handleTestApi() {
    if (!config.apiKey) {
      setApiTest('fail'); setApiTestMsg('请先填写 API Key'); return
    }
    setApiTest('testing'); setApiTestMsg('')
    try {
      const baseUrl = config.apiBaseUrl || DEFAULT_API_URLS[config.llmProvider]
      const isAnthropic = config.llmProvider === 'anthropic'

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
      const resp = await fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
      clearTimeout(timeout)

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        setApiTest('fail'); setApiTestMsg(`HTTP ${resp.status}: ${text.slice(0, 60)}`); return
      }
      const text = await resp.text()
      try { JSON.parse(text) } catch { setApiTest('fail'); setApiTestMsg('响应不是 JSON'); return }
      setApiTest('ok'); setApiTestMsg(`${config.model} 连接成功`)
    } catch (e) {
      setApiTest('fail')
      setApiTestMsg((e as Error).message?.includes('aborted') ? '请求超时 (10s)' : (e as Error).message?.slice(0, 60) || '连接失败')
    }
  }

  function finish() {
    chrome.storage.local.set({ onboardingComplete: true })
    chrome.tabs.create({ url: 'https://www.xiaohongshu.com/explore' })
  }

  const suggestions = SUGGESTED_MODELS[config.llmProvider]
  const defaultUrl = DEFAULT_API_URLS[config.llmProvider]

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-6">
      <div className="max-w-md w-full">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === step ? 'bg-amber-warm w-6' : i < step ? 'bg-amber-warm/40' : 'bg-sand'
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="step-enter" key={step}>
          {step === 0 && <StepWelcome onNext={() => setStep(1)} />}
          {step === 1 && (
            <StepApi
              config={config}
              updateConfig={updateConfig}
              apiTest={apiTest}
              apiTestMsg={apiTestMsg}
              onTest={handleTestApi}
              suggestions={suggestions}
              defaultUrl={defaultUrl}
              onNext={() => setStep(2)}
              onSkip={() => setStep(2)}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && <StepIndicators onNext={() => setStep(3)} onBack={() => setStep(1)} />}
          {step === 3 && <StepDone onFinish={finish} onBack={() => setStep(2)} />}
        </div>
      </div>
    </div>
  )
}

/* ─── Step 0: Welcome ─── */
function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <div className="w-16 h-16 rounded-3xl bg-amber-light mx-auto mb-6 flex items-center justify-center shadow-card">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D4845A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="3"/>
          <line x1="12" y1="2" x2="12" y2="5"/>
          <line x1="12" y1="19" x2="12" y2="22"/>
          <line x1="2" y1="12" x2="5" y2="12"/>
          <line x1="19" y1="12" x2="22" y2="12"/>
        </svg>
      </div>
      <h1 className="font-serif text-2xl font-bold text-bark mb-2">红薯雷达</h1>
      <p className="text-sm text-muted mb-2">小红书内容质量守护</p>
      <p className="text-xs text-muted/80 leading-relaxed mb-8 max-w-xs mx-auto">
        利用 AI 自动识别小红书信息流中的低质内容（标题党、焦虑诱导、软广等），为你打造更健康的浏览体验。
      </p>
      <button onClick={onNext} className="px-8 py-2.5 bg-amber-warm text-white rounded-xl text-sm font-semibold hover:bg-amber-warm/90 transition-all shadow-soft">
        开始设置
      </button>
    </div>
  )
}

/* ─── Step 1: API Setup ─── */
function StepApi({
  config, updateConfig, apiTest, apiTestMsg, onTest, suggestions, defaultUrl, onNext, onSkip, onBack,
}: {
  config: UserConfig
  updateConfig: <K extends keyof UserConfig>(key: K, value: UserConfig[K]) => void
  apiTest: string; apiTestMsg: string; onTest: () => void
  suggestions: readonly string[]; defaultUrl: string
  onNext: () => void; onSkip: () => void; onBack: () => void
}) {
  return (
    <div>
      <h2 className="font-serif text-lg font-bold text-bark mb-1">配置 API</h2>
      <p className="text-xs text-muted mb-5">填入你的 LLM API 信息，用于内容分析</p>

      <div className="space-y-4 mb-6">
        {/* Provider */}
        <div className="flex gap-2">
          {(['openai', 'anthropic'] as const).map(p => (
            <button
              key={p}
              onClick={() => updateConfig('llmProvider', p)}
              className={`flex-1 py-2 rounded-xl border-[1.5px] text-xs font-medium transition-all ${
                config.llmProvider === p
                  ? 'border-amber-warm bg-amber-light/50 text-bark'
                  : 'border-sand bg-white text-muted hover:border-amber-warm/40'
              }`}
            >
              {p === 'openai' ? 'OpenAI Compatible' : 'Anthropic'}
            </button>
          ))}
        </div>

        {/* Base URL */}
        <input
          type="url"
          value={config.apiBaseUrl}
          onChange={e => updateConfig('apiBaseUrl', e.target.value)}
          placeholder={`API URL (默认: ${defaultUrl.slice(0, 35)}...)`}
          className="input-field mono"
        />

        {/* API Key */}
        <input
          type="password"
          value={config.apiKey}
          onChange={e => updateConfig('apiKey', e.target.value)}
          placeholder={config.llmProvider === 'openai' ? 'sk-...' : 'sk-ant-...'}
          className="input-field"
        />

        {/* Model */}
        <input
          type="text"
          list="model-suggestions"
          value={config.model}
          onChange={e => updateConfig('model', e.target.value)}
          placeholder="模型名称"
          className="input-field mono"
        />
        <datalist id="model-suggestions">
          {suggestions.map(m => <option key={m} value={m} />)}
        </datalist>

        {/* Test */}
        <button
          onClick={onTest}
          disabled={apiTest === 'testing'}
          className="w-full py-2.5 rounded-xl border-[1.5px] border-sand text-xs font-medium text-muted hover:border-amber-warm hover:text-amber-warm transition-all flex items-center justify-center gap-2"
        >
          {apiTest === 'testing'
            ? <><span className="inline-block w-3 h-3 border-2 border-muted border-t-amber-warm rounded-full animate-spin" />测试中...</>
            : '测试 API 连接'}
        </button>
        {apiTest === 'ok' && <p className="text-xs text-sage font-medium text-center">{apiTestMsg}</p>}
        {apiTest === 'fail' && <p className="text-xs text-coral font-medium text-center">{apiTestMsg}</p>}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-xs text-muted hover:text-bark transition-colors">返回</button>
        <div className="flex items-center gap-3">
          <button onClick={onSkip} className="text-xs text-muted hover:text-bark transition-colors">跳过</button>
          <button onClick={onNext} className="px-6 py-2 bg-amber-warm text-white rounded-xl text-sm font-semibold hover:bg-amber-warm/90 transition-all">
            下一步
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Step 2: Indicator Explanation ─── */
function StepIndicators({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const indicators = [
    { symbol: '', color: 'bg-yellow-400', label: '处理中', desc: '正在分析内容质量', pulse: true },
    { symbol: '✓', color: 'bg-green-500', label: '通过', desc: '内容质量正常' },
    { symbol: '✗', color: 'bg-red-500', label: '低质', desc: '已识别为低质内容，将被模糊或隐藏' },
    { symbol: '!', color: 'bg-orange-400', label: '错误', desc: 'API 调用失败或未配置' },
  ]

  return (
    <div>
      <h2 className="font-serif text-lg font-bold text-bark mb-1">了解标记含义</h2>
      <p className="text-xs text-muted mb-5">每张笔记卡片左上角会出现一个状态标记</p>

      <div className="space-y-3 mb-6">
        {indicators.map(ind => (
          <div key={ind.label} className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-card">
            <div
              className={`w-6 h-6 rounded-full ${ind.color} text-white text-xs font-bold flex items-center justify-center flex-shrink-0`}
              style={ind.pulse ? { animation: 'mock-pulse 1s ease-in-out infinite' } : {}}
            >
              {ind.symbol}
            </div>
            <div>
              <div className="text-sm font-medium text-bark">{ind.label}</div>
              <div className="text-[11px] text-muted">{ind.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-amber-light/50 rounded-xl p-3 mb-6">
        <p className="text-[11px] text-bark/70 leading-relaxed">
          <span className="font-semibold">模糊模式</span>：低质内容被模糊处理，点击可查看原内容<br/>
          <span className="font-semibold">隐藏模式</span>：低质内容直接隐藏
        </p>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-xs text-muted hover:text-bark transition-colors">返回</button>
        <button onClick={onNext} className="px-6 py-2 bg-amber-warm text-white rounded-xl text-sm font-semibold hover:bg-amber-warm/90 transition-all">
          下一步
        </button>
      </div>
    </div>
  )
}

/* ─── Step 3: Done ─── */
function StepDone({ onFinish, onBack }: { onFinish: () => void; onBack: () => void }) {
  return (
    <div className="text-center">
      <div className="text-4xl mb-4">🎉</div>
      <h2 className="font-serif text-lg font-bold text-bark mb-2">设置完成</h2>
      <p className="text-xs text-muted mb-6 leading-relaxed max-w-xs mx-auto">
        红薯雷达 已准备就绪。打开小红书，开始享受更干净的信息流吧。
      </p>

      <div className="space-y-3">
        <button
          onClick={onFinish}
          className="w-full py-3 bg-amber-warm text-white rounded-xl text-sm font-semibold hover:bg-amber-warm/90 transition-all shadow-soft"
        >
          打开小红书
        </button>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="w-full py-2.5 rounded-xl border-[1.5px] border-sand text-xs text-muted hover:border-amber-warm hover:text-amber-warm transition-all"
        >
          前往详细设置
        </button>
      </div>

      <button onClick={onBack} className="text-[11px] text-muted hover:text-bark transition-colors mt-4 inline-block">
        返回上一步
      </button>
    </div>
  )
}
