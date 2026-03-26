import { useState, useEffect } from 'react'
import type { DailyStats } from '@/shared/types'

export default function App() {
  const [days, setDays] = useState<DailyStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_DAILY_STATS' }, (response) => {
      if (response?.days) {
        // Chronological order for charts
        setDays(response.days)
      }
      setLoading(false)
    })
  }, [])

  const totalScanned = days.reduce((s, d) => s + d.scanned, 0)
  const totalMarked = days.reduce((s, d) => s + d.marked, 0)
  const totalApi = days.reduce((s, d) => s + d.apiCalls, 0)
  const avgFilterRate = totalScanned > 0 ? Math.round((totalMarked / totalScanned) * 100) : 0

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
          <h1 className="font-serif text-2xl font-bold text-bark tracking-tight">守护统计</h1>
          <p className="text-xs text-muted mt-0.5">你的信息流健康养成记录</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        <SummaryCard label="总扫描" value={totalScanned.toLocaleString()} />
        <SummaryCard label="已过滤" value={totalMarked.toLocaleString()} accent />
        <SummaryCard label="过滤率" value={`${avgFilterRate}%`} />
        <SummaryCard label="活跃天数" value={`${days.filter(d => d.scanned > 0).length}`} />
      </div>

      {/* Trend chart */}
      {days.length > 1 && (
        <div className="bg-white rounded-2xl shadow-card p-5 mb-6">
          <h2 className="font-serif text-sm font-semibold text-bark mb-4">过滤趋势</h2>
          <TrendChart days={days} />
          <div className="flex items-center justify-center gap-6 mt-3">
            <Legend color="#D4845A" label="过滤数量" />
            <Legend color="#7BB686" label="过滤率 %" />
          </div>
        </div>
      )}

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
            {[...days].reverse().map(day => {
              const rate = day.scanned > 0 ? Math.round((day.marked / day.scanned) * 100) : 0
              return (
                <div key={day.date} className="px-5 py-3 flex items-center gap-4">
                  <span className="text-xs text-muted w-16 flex-shrink-0 font-mono">
                    {formatDate(day.date)}
                  </span>
                  <div className="flex-1 flex items-center gap-1.5">
                    <div className="flex-1 h-4 bg-sand/30 rounded-full overflow-hidden">
                      <div
                        className="bar h-full rounded-full"
                        style={{
                          width: `${Math.max(rate, 2)}%`,
                          background: `linear-gradient(90deg, #D4845A, ${rate > 20 ? '#E08B7A' : '#D4845A'})`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-muted w-8 text-right">{rate}%</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[11px] text-bark">
                      <span className="text-muted">检查 </span>
                      <span className="font-semibold">{day.scanned}</span>
                    </span>
                    <span className="text-[11px]">
                      <span className="text-muted">过滤 </span>
                      <span className="font-semibold text-coral">{day.marked}</span>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/** SVG trend chart — dual axis: bar for marked count, line for filter rate */
function TrendChart({ days }: { days: DailyStats[] }) {
  const W = 580
  const H = 160
  const padX = 30
  const padY = 20
  const chartW = W - padX * 2
  const chartH = H - padY * 2

  const maxMarked = Math.max(...days.map(d => d.marked), 1)
  const points = days.map((d, i) => {
    const x = padX + (days.length === 1 ? chartW / 2 : (i / (days.length - 1)) * chartW)
    const rate = d.scanned > 0 ? d.marked / d.scanned : 0
    const yMarked = padY + chartH - (d.marked / maxMarked) * chartH
    const yRate = padY + chartH - rate * chartH
    return { x, yMarked, yRate, day: d }
  })

  const rateLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.yRate}`).join(' ')
  const barWidth = Math.max(Math.min(chartW / days.length - 4, 24), 4)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 160 }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(pct => {
        const y = padY + chartH * (1 - pct)
        return <line key={pct} x1={padX} x2={W - padX} y1={y} y2={y} stroke="#EDE8E1" strokeWidth="0.5" />
      })}

      {/* Bars — marked count */}
      {points.map((p, i) => (
        <rect
          key={i}
          x={p.x - barWidth / 2}
          y={p.yMarked}
          width={barWidth}
          height={padY + chartH - p.yMarked}
          rx={barWidth / 2}
          fill="#D4845A"
          opacity={0.25}
        />
      ))}

      {/* Area fill under rate line */}
      <path
        d={`${rateLine} L${points[points.length - 1].x},${padY + chartH} L${points[0].x},${padY + chartH} Z`}
        fill="#7BB686"
        opacity={0.08}
      />

      {/* Rate line */}
      <path d={rateLine} fill="none" stroke="#7BB686" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Rate dots */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.yRate} r="3" fill="white" stroke="#7BB686" strokeWidth="1.5" />
      ))}

      {/* X axis labels (first, middle, last) */}
      {[0, Math.floor(days.length / 2), days.length - 1]
        .filter((v, i, a) => a.indexOf(v) === i)
        .map(i => (
          <text
            key={i}
            x={points[i].x}
            y={H - 2}
            textAnchor="middle"
            fontSize="9"
            fill="#9A9084"
            fontFamily="system-ui"
          >
            {formatDate(days[i].date)}
          </text>
        ))}

      {/* Y axis labels (left = marked count) */}
      <text x={padX - 4} y={padY + 4} textAnchor="end" fontSize="8" fill="#9A9084">{maxMarked}</text>
      <text x={padX - 4} y={padY + chartH + 4} textAnchor="end" fontSize="8" fill="#9A9084">0</text>
    </svg>
  )
}

function SummaryCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white rounded-2xl shadow-card p-4">
      <div className={`text-xl font-serif font-bold leading-tight ${accent ? 'text-coral' : 'text-bark'}`}>
        {value}
      </div>
      <div className="text-[10px] text-muted mt-1 tracking-wide">{label}</div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color, opacity: 0.6 }} />
      <span className="text-[10px] text-muted">{label}</span>
    </div>
  )
}

function formatDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-')
  return `${parseInt(month)}月${parseInt(day)}日`
}
