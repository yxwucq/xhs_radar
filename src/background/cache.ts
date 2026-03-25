import type { AnalysisResult } from '@/shared/types'

const LOG_PREFIX = '[XHS Radar Cache]'
const STORAGE_KEY = 'analysisCache'
const MAX_ENTRIES = 2000
const TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface CacheEntry {
  result: AnalysisResult
  createdAt: number
  lastAccess: number
}

type CacheStore = Record<string, CacheEntry>

/**
 * LRU cache backed by chrome.storage.local.
 * - 24h TTL per entry
 * - Max 2000 entries, LRU eviction
 * - All operations are async (storage I/O)
 */
export class AnalysisCache {
  private store: CacheStore = {}
  private loaded = false
  private persistTimer: ReturnType<typeof setTimeout> | null = null

  /** Load cache from storage. Call once on startup. */
  async load(): Promise<void> {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY)
      this.store = data[STORAGE_KEY] ?? {}
      this.purgeExpired()
      this.loaded = true
      console.log(LOG_PREFIX, `Loaded ${Object.keys(this.store).length} entries`)
    } catch (e) {
      console.log(LOG_PREFIX, 'Failed to load cache:', e)
      this.store = {}
      this.loaded = true
    }
  }

  /** Get a cached result by noteId. Returns null on miss or expiry. */
  get(noteId: string): AnalysisResult | null {
    const entry = this.store[noteId]
    if (!entry) return null

    if (Date.now() - entry.createdAt > TTL_MS) {
      delete this.store[noteId]
      return null
    }

    // Update access time for LRU
    entry.lastAccess = Date.now()
    return entry.result
  }

  /** Get multiple cached results. Returns map of noteId → result (only hits). */
  getMany(noteIds: string[]): Map<string, AnalysisResult> {
    const hits = new Map<string, AnalysisResult>()
    for (const id of noteIds) {
      const result = this.get(id)
      if (result) hits.set(id, result)
    }
    return hits
  }

  /** Store analysis results in cache. */
  async set(results: AnalysisResult[]): Promise<void> {
    const now = Date.now()
    for (const result of results) {
      this.store[result.noteId] = {
        result,
        createdAt: now,
        lastAccess: now,
      }
    }

    this.evictIfNeeded()
    await this.persist()
  }

  /** Store a single result with debounced persist (for streaming). */
  setOne(result: AnalysisResult): void {
    const now = Date.now()
    this.store[result.noteId] = { result, createdAt: now, lastAccess: now }
    this.evictIfNeeded()
    if (!this.persistTimer) {
      this.persistTimer = setTimeout(() => {
        this.persistTimer = null
        this.persist()
      }, 500)
    }
  }

  /** Clear all cached entries. */
  async clear(): Promise<void> {
    this.store = {}
    await this.persist()
    console.log(LOG_PREFIX, 'Cache cleared')
  }

  /** Get current cache size. */
  get size(): number {
    return Object.keys(this.store).length
  }

  // ── Private ────────────────────────────────

  private purgeExpired(): void {
    const now = Date.now()
    let purged = 0
    for (const [id, entry] of Object.entries(this.store)) {
      if (now - entry.createdAt > TTL_MS) {
        delete this.store[id]
        purged++
      }
    }
    if (purged > 0) {
      console.debug(LOG_PREFIX, `Purged ${purged} expired entries`)
    }
  }

  private evictIfNeeded(): void {
    const keys = Object.keys(this.store)
    if (keys.length <= MAX_ENTRIES) return

    // Sort by lastAccess ascending (oldest access first)
    const sorted = keys.sort((a, b) => this.store[a].lastAccess - this.store[b].lastAccess)
    const toEvict = sorted.slice(0, keys.length - MAX_ENTRIES)
    for (const key of toEvict) {
      delete this.store[key]
    }
    console.debug(LOG_PREFIX, `Evicted ${toEvict.length} LRU entries`)
  }

  private async persist(): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: this.store })
    } catch (e) {
      console.log(LOG_PREFIX, 'Failed to persist cache:', e)
    }
  }
}
