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
    <div className="p-4 w-80">
      {/* Header + Toggle */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-bold text-gray-800 leading-tight">XHS Radar</h1>
          <p className="text-xs text-gray-400">内容质量雷达</p>
        </div>
        <button
          onClick={handleToggle}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            enabled ? 'bg-red-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              enabled ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>

      {/* API Key Warning */}
      {!hasApiKey && (
        <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-700">
            请先设置 API Key
            <button onClick={openSettings} className="ml-1 underline font-medium">
              前往设置
            </button>
          </p>
        </div>
      )}

      {/* Mode Switch */}
      {enabled && (
        <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg mb-4">
          {(['blur', 'vanish'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => handleModeSwitch(mode)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filterMode === mode
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {mode === 'blur' ? 'Blur Mode' : 'Vanish Mode'}
            </button>
          ))}
        </div>
      )}

      {/* Stats */}
      {enabled && stats && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <StatCard label="已扫描" value={stats.scanned} />
          <StatCard label="已标记" value={stats.marked} color="text-red-500" />
          <StatCard label="缓存命中" value={stats.cacheHits} />
          <StatCard label="API 调用" value={stats.apiCalls} />
          {stats.errors > 0 && (
            <StatCard label="错误" value={stats.errors} color="text-amber-500" />
          )}
        </div>
      )}

      {/* Settings Link */}
      <button
        onClick={openSettings}
        className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 transition-colors"
      >
        Settings
      </button>
    </div>
  )
}

function StatCard({
  label,
  value,
  color = 'text-gray-800',
}: {
  label: string
  value: number
  color?: string
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-2">
      <div className={`text-lg font-semibold ${color} leading-tight`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  )
}
