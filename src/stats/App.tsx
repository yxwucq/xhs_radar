import { useState, useEffect } from 'react'
import type { DailyStats } from '@/shared/types'

export default function App() {
  const [days, setDays] = useState<DailyStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_DAILY_STATS' }, (response) => {
      if (response?.days) {
        setDays(response.days.slice().reverse()) // newest first
      }
      setLoading(false)
    })
  }, [])

  const totalScanned = days.reduce((s, d) => s + d.scanned, 0)
  const totalMarked = days.reduce((s, d) => s + d.marked, 0)
  const totalApi = days.reduce((s, d) => s + d.apiCalls, 0)
  const maxScanned = Math.max(...days.map(d => d.scanned), 1)

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted text-sm">Loading...</div>
  }

  return (
    <div className="max-w-2xl mx-auto py-12 px-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-2xl bg-amber-light flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4845A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 20V10M12 20V4M6 20v-6"/>
          </svg>
        </div>
        <div>
          <h1 className="font-serif text-2xl font-bold text-bark tracking-tight">使用统计</h1>
          <p className="text-xs text-muted mt-0.5">最近 {days.length} 天的守护记录</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <SummaryCard label="总扫描" value={totalScanned} />
        <SummaryCard label="总过滤" value={totalMarked} accent />
        <SummaryCard label="API 调用" value={totalApi} />
      </div>

      {/* Daily breakdown */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-sand/50">
          <h2 className="font-serif text-sm font-semibold text-bark">每日明细</h2>
        </div>

        {days.length === 0 ? (
          <div className="px-5 py-8 text-center text-muted text-sm">
            暂无数据，开始浏览小红书后将自动记录
          </div>
        ) : (
          <div className="divide-y divide-sand/30">
            {days.map(day => (
              <div key={day.date} className="px-5 py-3 flex items-center gap-4">
                <span className="text-xs text-muted w-20 flex-shrink-0 font-mono">
                  {formatDate(day.date)}
                </span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-5 bg-sand/30 rounded-full overflow-hidden flex">
                    <div
                      className="bar h-full bg-amber-warm/30 rounded-full"
                      style={{ width: `${(day.scanned / maxScanned) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <span className="text-xs text-bark w-16 text-right">
                    <span className="text-muted">扫描 </span>
                    <span className="font-semibold">{day.scanned}</span>
                  </span>
                  <span className="text-xs w-16 text-right">
                    <span className="text-muted">过滤 </span>
                    <span className="font-semibold text-coral">{day.marked}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-white rounded-2xl shadow-card p-4">
      <div className={`text-2xl font-serif font-bold leading-tight ${accent ? 'text-coral' : 'text-bark'}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-[10px] text-muted mt-1 tracking-wide">{label}</div>
    </div>
  )
}

function formatDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-')
  return `${parseInt(month)}月${parseInt(day)}日`
}
