import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DailyStatsTracker } from '../daily-stats'

describe('DailyStatsTracker', () => {
  const getMock = vi.fn(async () => ({}))
  const setMock = vi.fn(async () => {})

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: getMock,
          set: setMock,
        },
      },
    })
    getMock.mockClear()
    setMock.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('records counts cumulatively for the same local day', async () => {
    vi.setSystemTime(new Date(2026, 2, 30, 23, 30, 0))

    const tracker = new DailyStatsTracker()
    await tracker.load()
    tracker.record(10, 3, 1)
    tracker.record(5, 2, 0)

    expect(tracker.getAll()).toEqual([
      { date: '2026-03-30', scanned: 15, marked: 5, apiCalls: 1 },
    ])
  })

  it('uses local calendar date instead of UTC date', async () => {
    vi.setSystemTime(new Date(2026, 2, 30, 0, 30, 0))

    const tracker = new DailyStatsTracker()
    await tracker.load()
    tracker.record(1, 1, 1)

    expect(tracker.getAll()[0].date).toBe('2026-03-30')
  })

  it('persists recorded stats after the debounce window', async () => {
    const tracker = new DailyStatsTracker()
    await tracker.load()
    tracker.record(2, 1, 1)

    await vi.advanceTimersByTimeAsync(2000)

    expect(setMock).toHaveBeenCalledWith({
      dailyStats: [{ date: expect.any(String), scanned: 2, marked: 1, apiCalls: 1 }],
    })
  })

  it('clears all persisted history immediately', async () => {
    const tracker = new DailyStatsTracker()
    await tracker.load()
    tracker.record(2, 1, 1)

    await tracker.clear()

    expect(tracker.getAll()).toEqual([])
    expect(setMock).toHaveBeenLastCalledWith({ dailyStats: [] })
  })
})
