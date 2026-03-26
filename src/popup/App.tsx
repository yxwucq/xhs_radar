import { useState, useEffect, useCallback } from 'react'
import type { FilterMode, SessionStats } from '@/shared/types'

interface ExtendedStats extends SessionStats {
  cacheSize?: number
}

export default function App() {
  const [enabled, setEnabled] = useState(true)
  const [filterMode, setFilterMode] = useState<FilterMode>('blur')
  const [stats, setStats] = useState<ExtendedStats | null>(null)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  const loadState = useCallback(() => {
    chrome.storage.local.get('config').then((stored) => {
      if (stored.config) {
        setEnabled(stored.config.enabled ?? true)
        setFilterMode(stored.config.filterMode ?? 'blur')
        setHasApiKey(!!stored.config.apiKey)
      }
    })
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
      if (response) setStats(response)
    })
  }, [])

  useEffect(() => {
    loadState()
  }, [loadState])

  function handleToggle() {
    const next = !enabled
    setEnabled(next)
    chrome.runtime.sendMessage({ type: 'TOGGLE_ENABLED', payload: { enabled: next } }, () => {
      if (chrome.runtime.lastError) console.warn('Toggle failed:', chrome.runtime.lastError.message)
    })
  }

  function handleModeSwitch(mode: FilterMode) {
    setFilterMode(mode)
    chrome.runtime.sendMessage({ type: 'SET_FILTER_MODE', payload: { mode } }, () => {
      if (chrome.runtime.lastError) console.warn('Mode switch failed:', chrome.runtime.lastError.message)
    })
  }

  function openSettings() {
    chrome.runtime.openOptionsPage()
  }

  return (
    <div className="p-5 font-body">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-amber-light flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4845A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="3"/>
              <line x1="12" y1="2" x2="12" y2="5"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
              <line x1="2" y1="12" x2="5" y2="12"/>
              <line x1="19" y1="12" x2="22" y2="12"/>
            </svg>
          </div>
          <div>
            <h1 className="font-serif text-base font-semibold text-bark leading-tight tracking-tight">
              Content Radar
            </h1>
            <p className="text-[10px] text-muted leading-tight mt-0.5">
              {enabled ? '守护中' : '已暂停'}
            </p>
          </div>
        </div>

        <button
          onClick={handleToggle}
          className={`toggle-track relative w-11 h-6 rounded-full ${
            enabled ? 'bg-amber-warm' : 'bg-sand'
          }`}
        >
          <span
            className={`toggle-knob absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-soft ${
              enabled ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>

      {/* API Key Warning */}
      {!hasApiKey && (
        <div className="mb-4 p-3 bg-amber-light rounded-2xl border border-amber-warm/20">
          <p className="text-xs text-bark/70">
            请先设置 API Key
            <button
              onClick={openSettings}
              className="ml-1 text-amber-warm font-medium underline underline-offset-2 decoration-amber-warm/40 hover:decoration-amber-warm"
            >
              前往设置
            </button>
          </p>
        </div>
      )}

      {/* Mode Switch */}
      {enabled && (
        <div className="pill-group flex mb-4">
          {(['blur', 'vanish'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => handleModeSwitch(mode)}
              className={`pill-btn flex-1 ${filterMode === mode ? 'active' : ''}`}
            >
              {mode === 'blur' ? '模糊模式' : '隐藏模式'}
            </button>
          ))}
        </div>
      )}

      {/* Stats Summary — click to expand */}
      {enabled && stats && (
        <button
          onClick={() => setShowDetail(!showDetail)}
          className="w-full mb-4 bg-white rounded-2xl p-3 shadow-card text-left transition-all duration-200 hover:shadow-soft"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted">已扫描</span>
              <span className="text-sm font-serif font-semibold text-bark">{stats.scanned}</span>
              <span className="text-xs text-muted">已过滤</span>
              <span className="text-sm font-serif font-semibold text-coral">{stats.marked}</span>
            </div>
            <svg
              className={`w-3.5 h-3.5 text-muted transition-transform duration-200 ${showDetail ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>

          {/* Expanded detail */}
          {showDetail && (
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-sand/60">
              <DetailRow label="缓存命中" value={stats.cacheHits} />
              <DetailRow label="API 调用" value={stats.apiCalls} />
              {stats.errors > 0 && <DetailRow label="错误" value={stats.errors} accent />}
              {stats.cacheSize != null && <DetailRow label="缓存条数" value={stats.cacheSize} />}
            </div>
          )}
        </button>
      )}

      {/* Settings Link */}
      <button
        onClick={openSettings}
        className="w-full py-2.5 text-xs text-muted hover:text-bark rounded-xl hover:bg-sand/50 transition-all duration-200 flex items-center justify-center gap-1.5"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
        设置
      </button>
    </div>
  )
}

function DetailRow({
  label,
  value,
  accent = false,
}: {
  label: string
  value: number
  accent?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-muted">{label}</span>
      <span className={`text-xs font-medium ${accent ? 'text-coral' : 'text-bark'}`}>{value}</span>
    </div>
  )
}
