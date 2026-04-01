import { useState, useEffect, useCallback } from 'react'
import type { FilterMode, SessionStats, DailyStats, ScenarioPreset, UserConfig } from '@/shared/types'
import { DEFAULT_CONFIG, applyScenarioToConfig, mergeConfigWithDefaults } from '@/shared/constants'

interface ExtendedStats extends SessionStats {
  cacheSize?: number
}

interface SummaryStats {
  scanned: number
  marked: number
}

export default function App() {
  const [enabled, setEnabled] = useState(true)
  const [, setFilterMode] = useState<FilterMode>('blur')
  const [stats, setStats] = useState<ExtendedStats | null>(null)
  const [summary, setSummary] = useState<SummaryStats | null>(null)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [config, setConfig] = useState<UserConfig>(DEFAULT_CONFIG)

  const loadState = useCallback(() => {
    chrome.storage.local.get('config').then((stored) => {
      const next = mergeConfigWithDefaults(stored.config)
      setConfig(next)
      setEnabled(next.enabled)
      setFilterMode(next.filterMode)
      setHasApiKey(!!next.apiKey)
    })
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
      if (response) setStats(response)
    })
    chrome.runtime.sendMessage({ type: 'GET_DAILY_STATS' }, (response) => {
      const days: DailyStats[] = response?.days ?? []
      setSummary({
        scanned: days.reduce((sum, day) => sum + day.scanned, 0),
        marked: days.reduce((sum, day) => sum + day.marked, 0),
      })
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

  function openSettings() {
    chrome.runtime.openOptionsPage()
  }

  function handleScenarioSwitch(scenario: ScenarioPreset) {
    const next = applyScenarioToConfig(config, scenario)
    setConfig(next)
    setFilterMode(next.filterMode)
    chrome.storage.local.set({ config: next })
    chrome.runtime.sendMessage({ type: 'CONFIG_CHANGED', payload: next }, () => {
      if (chrome.runtime.lastError) console.warn('Scenario switch failed:', chrome.runtime.lastError.message)
    })
  }

  const visibleScenarios = (() => {
    const ids = config.quickScenarioIds ?? []
    const quick = ids
      .map(id => config.scenarios.find(s => s.id === id))
      .filter((s): s is ScenarioPreset => !!s)
    // Ensure active scenario is always visible
    const active = config.scenarios.find(s => s.id === config.activeScenarioId)
    if (active && !quick.some(s => s.id === active.id)) {
      return [...quick.slice(0, 3), active]
    }
    return quick.slice(0, 4)
  })()

  return (
    <div className="px-5 pt-5 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-light flex items-center justify-center shadow-card">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4845A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="3"/>
              <line x1="12" y1="2" x2="12" y2="5"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
              <line x1="2" y1="12" x2="5" y2="12"/>
              <line x1="19" y1="12" x2="22" y2="12"/>
            </svg>
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-bark leading-tight tracking-tight">
              红薯雷达
            </h1>
            <p className="text-[10px] text-muted leading-tight mt-0.5" style={{ fontFamily: 'system-ui' }}>
              {enabled ? '正在守护你的信息流' : '守护已暂停'}
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
          <p className="text-[11px] text-bark/70" style={{ fontFamily: 'system-ui' }}>
            请先设置 API Key
            <button
              onClick={openSettings}
              className="ml-1 text-amber-warm font-semibold underline underline-offset-2 decoration-amber-warm/40 hover:decoration-amber-warm"
            >
              前往设置
            </button>
          </p>
        </div>
      )}

      {/* Mode Switch */}
      {enabled && (
        <div className="mb-4">
          <div className="pill-group flex overflow-x-auto">
            {visibleScenarios.map((scenario) => (
              <button
                key={scenario.id}
                onClick={() => handleScenarioSwitch(scenario)}
                className={`pill-btn flex-1 min-w-[64px] ${config.activeScenarioId === scenario.id ? 'active' : ''}`}
              >
                {scenario.name}
              </button>
            ))}
          </div>
          {(() => {
            const active = config.scenarios.find(s => s.id === config.activeScenarioId)
            return active?.description ? (
              <p className="text-[10px] text-muted mt-1.5 px-1 leading-relaxed" style={{ fontFamily: 'system-ui' }}>
                {active.description}
              </p>
            ) : null
          })()}
        </div>
      )}

      {/* Stats */}
      {enabled && stats && summary && (
        <div className="stats-card w-full mb-4 rounded-2xl p-4">
          <div className="mb-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted/80" style={{ fontFamily: 'system-ui' }}>
              近 30 天累计
            </p>
            <p className="text-[12px] text-bark/80 leading-relaxed mt-1.5 pr-1" style={{ fontFamily: 'system-ui' }}>
              已为你检查{' '}
              <span className="font-bold text-bark">{summary.scanned}</span>
              {' '}篇笔记，发现{' '}
              <span className="font-bold text-coral">{summary.marked}</span>
              {' '}篇低质内容
            </p>
          </div>

          <button
            onClick={() => setShowDetail(!showDetail)}
            className="session-toggle w-full flex items-center justify-between mt-3 pt-3 border-t border-sand/50 text-left"
            style={{ fontFamily: 'system-ui' }}
          >
            <div>
              <div className="text-[11px] font-medium text-bark/85">当前会话</div>
              <div className="text-[10px] text-muted mt-0.5">
                本轮检查 {stats.scanned} · 过滤 {stats.marked}
              </div>
            </div>
            <svg
              className={`w-3.5 h-3.5 text-muted transition-transform duration-200 ${showDetail ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {showDetail && (
            <div className="detail-grid grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-sand/50">
              <DetailRow label="本轮检查" value={stats.scanned} />
              <DetailRow label="本轮过滤" value={stats.marked} accent={stats.marked > 0} />
              <DetailRow label="缓存命中" value={stats.cacheHits} />
              <DetailRow label="API 调用" value={stats.apiCalls} />
              {stats.errors > 0 && <DetailRow label="错误" value={stats.errors} accent />}
              {stats.cacheSize != null && <DetailRow label="缓存条数" value={stats.cacheSize} />}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex gap-2">
        <button
          onClick={openSettings}
          className="footer-btn flex-1 py-2 text-[11px] text-muted hover:text-bark rounded-xl flex items-center justify-center gap-1.5"
          style={{ fontFamily: 'system-ui' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
          设置
        </button>
        <button
          onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('src/stats/index.html') })}
          className="footer-btn flex-1 py-2 text-[11px] text-muted hover:text-bark rounded-xl flex items-center justify-center gap-1.5"
          style={{ fontFamily: 'system-ui' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 20V10M12 20V4M6 20v-6"/>
          </svg>
          统计
        </button>
      </div>
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
      <span className="text-[10px] text-muted" style={{ fontFamily: 'system-ui' }}>{label}</span>
      <span className={`text-[11px] font-semibold ${accent ? 'text-coral' : 'text-bark/70'}`} style={{ fontFamily: 'system-ui' }}>{value}</span>
    </div>
  )
}
