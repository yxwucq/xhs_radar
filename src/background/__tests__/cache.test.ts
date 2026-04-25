import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AnalysisResult } from '@/shared/types'

// Mock chrome.storage.local
const mockStorage: Record<string, unknown> = {}
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (data: Record<string, unknown>) => {
        Object.assign(mockStorage, data)
      }),
    },
  },
})

const { AnalysisCache } = await import('../cache')

function makeResult(noteId: string, score = 50): AnalysisResult {
  return {
    noteId,
    score,
    isLowQuality: score < 40,
    tags: [],
    reason: 'test',
  }
}

describe('AnalysisCache', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key]
    vi.clearAllMocks()
  })

  it('returns null for cache miss', async () => {
    const cache = new AnalysisCache()
    await cache.load()
    expect(cache.get('nonexistent')).toBeNull()
  })

  it('stores and retrieves results', async () => {
    const cache = new AnalysisCache()
    await cache.load()

    await cache.set([makeResult('aaa', 20), makeResult('bbb', 80)])

    expect(cache.get('aaa')?.score).toBe(20)
    expect(cache.get('bbb')?.score).toBe(80)
    expect(cache.size).toBe(2)
  })

  it('getMany returns only hits', async () => {
    const cache = new AnalysisCache()
    await cache.load()

    await cache.set([makeResult('aaa'), makeResult('bbb')])

    const hits = cache.getMany(['aaa', 'ccc'])
    expect(hits.size).toBe(1)
    expect(hits.has('aaa')).toBe(true)
    expect(hits.has('ccc')).toBe(false)
  })

  it('expires entries after 24h', async () => {
    const cache = new AnalysisCache()
    await cache.load()

    await cache.set([makeResult('old')])

    // Simulate 25 hours passing by manipulating the stored entry
    const stored = mockStorage['analysisCache'] as Record<string, { createdAt: number }>
    stored['old'].createdAt = Date.now() - 25 * 60 * 60 * 1000

    // Re-load to trigger purge
    const cache2 = new AnalysisCache()
    await cache2.load()
    expect(cache2.get('old')).toBeNull()
  })

  it('evicts LRU entries when over 2000 limit', async () => {
    const cache = new AnalysisCache()
    await cache.load()

    // Fill cache with 2000 entries
    const results: AnalysisResult[] = []
    for (let i = 0; i < 2000; i++) {
      results.push(makeResult(`note_${String(i).padStart(4, '0')}`))
    }
    await cache.set(results)
    expect(cache.size).toBe(2000)

    // Access the first entry to make it recently used
    cache.get('note_0000')

    // Add 10 more — should evict 10 least recently used
    const newResults: AnalysisResult[] = []
    for (let i = 2000; i < 2010; i++) {
      newResults.push(makeResult(`note_${i}`))
    }
    await cache.set(newResults)

    expect(cache.size).toBe(2000)
    // note_0000 was accessed, so it should survive
    expect(cache.get('note_0000')).not.toBeNull()
    // note_0001 was never re-accessed, should be evicted (among the first to go)
    expect(cache.get('note_0001')).toBeNull()
  })

  it('keeps a re-accessed entry even when all writes share the same timestamp', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T12:00:00.000Z'))

    const cache = new AnalysisCache()
    await cache.load()

    const results: AnalysisResult[] = []
    for (let i = 0; i < 2000; i++) {
      results.push(makeResult(`same_time_${String(i).padStart(4, '0')}`))
    }
    await cache.set(results)

    cache.get('same_time_0000')

    const extra: AnalysisResult[] = []
    for (let i = 2000; i < 2010; i++) {
      extra.push(makeResult(`same_time_${i}`))
    }
    await cache.set(extra)

    expect(cache.get('same_time_0000')).not.toBeNull()
    expect(cache.get('same_time_0001')).toBeNull()

    vi.useRealTimers()
  })

  it('clears all entries', async () => {
    const cache = new AnalysisCache()
    await cache.load()
    await cache.set([makeResult('aaa')])
    expect(cache.size).toBe(1)

    await cache.clear()
    expect(cache.size).toBe(0)
    expect(cache.get('aaa')).toBeNull()
  })

  it('persists to chrome.storage.local on set', async () => {
    const cache = new AnalysisCache()
    await cache.load()
    await cache.set([makeResult('aaa')])

    expect(chrome.storage.local.set).toHaveBeenCalled()
    expect(mockStorage['analysisCache']).toBeDefined()
  })

  it('loads from chrome.storage.local', async () => {
    // Pre-populate storage
    mockStorage['analysisCache'] = {
      preloaded: {
        result: makeResult('preloaded', 30),
        createdAt: Date.now(),
        lastAccess: Date.now(),
      },
    }

    const cache = new AnalysisCache()
    await cache.load()
    expect(cache.get('preloaded')?.score).toBe(30)
  })

  it('serializes overlapping writes — last call wins, no concurrent sets', async () => {
    // Replace set with a delayed implementation so writes overlap in time.
    let inFlight = 0
    let maxInFlight = 0
    const setSpy = vi.fn(async (data: Record<string, unknown>) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(r => setTimeout(r, 10))
      Object.assign(mockStorage, data)
      inFlight--
    })
    ;(chrome.storage.local.set as unknown as typeof setSpy) = setSpy

    const cache = new AnalysisCache()
    await cache.load()

    // Fire two writes back-to-back. The second should be queued behind the first.
    const p1 = cache.set([makeResult('first')])
    const p2 = cache.set([makeResult('second')])
    await Promise.all([p1, p2])

    // No two chrome.storage.local.set calls were ever in flight at the same time.
    expect(maxInFlight).toBe(1)
    // Latest state landed in storage (both entries persisted).
    const stored = mockStorage['analysisCache'] as Record<string, unknown>
    expect(stored).toHaveProperty('first')
    expect(stored).toHaveProperty('second')
  })
})
