import type { DailyStats } from '@/shared/types'

const STORAGE_KEY = 'dailyStats'
const MAX_DAYS = 30

function todayKey(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Persistent daily statistics tracker.
 * Stores per-day scanned/marked/apiCalls, keeps last 30 days.
 */
export class DailyStatsTracker {
  private days: DailyStats[] = []
  private today: DailyStats | null = null
  private persistTimer: ReturnType<typeof setTimeout> | null = null

  async load(): Promise<void> {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY)
      this.days = data[STORAGE_KEY] ?? []
      // Purge entries older than 30 days
      this.days = this.days.slice(-MAX_DAYS)
    } catch {
      this.days = []
    }
    this.ensureToday()
  }

  private ensureToday(): DailyStats {
    const key = todayKey()
    if (this.today && this.today.date === key) return this.today

    let entry = this.days.find(d => d.date === key)
    if (!entry) {
      entry = { date: key, scanned: 0, marked: 0, apiCalls: 0 }
      this.days.push(entry)
      // Trim to MAX_DAYS
      if (this.days.length > MAX_DAYS) {
        this.days = this.days.slice(-MAX_DAYS)
      }
    }
    this.today = entry
    return entry
  }

  /** Record scanned and marked counts */
  record(scanned: number, marked: number, apiCalls: number): void {
    const today = this.ensureToday()
    today.scanned += scanned
    today.marked += marked
    today.apiCalls += apiCalls
    this.debouncedPersist()
  }

  /** Get all daily stats (last 30 days) */
  getAll(): DailyStats[] {
    return [...this.days]
  }

  async clear(): Promise<void> {
    this.days = []
    this.today = null
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: [] })
  }

  private debouncedPersist(): void {
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      chrome.storage.local.set({ [STORAGE_KEY]: this.days }).catch(() => {})
    }, 2000)
  }
}
