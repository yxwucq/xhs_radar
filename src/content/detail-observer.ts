import type { AnalysisResult } from '@/shared/types'
import { XHS_SELECTORS, NOTE_ID_PATTERNS, DETAIL_PROCESSED_ATTR } from '@/shared/constants'
import { createLoadingBanner, createResultBanner, removeBanner } from './detail-banner'

const LOG_PREFIX = '[XHS Radar Detail]'

export type DetailResultCallback = (noteId: string, result: AnalysisResult) => void

/**
 * Detects when user clicks a note card link to open the detail overlay.
 *
 * Zero idle overhead: a single passive click listener on document that only
 * acts when the click target is inside a note link (`a[href*="/explore/"]`).
 * After a click, two deferred setTimeout calls extract content once the
 * overlay has loaded — no MutationObserver, no polling, no history patching.
 */
export class DetailObserver {
  private currentNoteId: string | null = null
  private currentRunId = 0
  private retryTimer: ReturnType<typeof setInterval> | null = null
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null
  private overlayObserver: MutationObserver | null = null
  private onResult: DetailResultCallback

  constructor(onResult: DetailResultCallback) {
    this.onResult = onResult
  }

  start(): void {
    document.addEventListener('click', this.onClick, { capture: true, passive: true })
    console.debug(LOG_PREFIX, 'Detail observer started (click-based)')
  }

  stop(): void {
    document.removeEventListener('click', this.onClick, { capture: true })
    this.stopWatching()
  }

  handleResult(noteId: string, result: AnalysisResult): void {
    const container = this.findDetailContainer()
    if (container?.getAttribute(DETAIL_PROCESSED_ATTR) === noteId) {
      removeBanner(container)
      container.prepend(createResultBanner(result))
    }

    this.onResult(noteId, result)
  }

  // ── Private ────────────────────────────────

  private onClick = (e: Event): void => {
    const target = e.target as HTMLElement | null
    if (!target) return

    // Walk up to find the note link
    const link = target.closest('a[href*="/explore/"], a[href*="/search_result/"]') as HTMLAnchorElement | null
    if (!link) return

    const noteId = this.extractNoteIdFromHref(link.href)
    if (!noteId) return

    this.beginWatching(noteId)
  }

  private beginWatching(noteId: string): void {
    this.stopWatching()
    this.currentNoteId = noteId
    const runId = ++this.currentRunId

    // Try immediately in case the overlay is already mounted.
    if (this.tryExtract(noteId, runId)) return

    // Keep checking briefly while the SPA hydrates or streams content in.
    this.retryTimer = setInterval(() => {
      if (this.tryExtract(noteId, runId)) {
        this.stopWatching()
      }
    }, 300)

    this.timeoutTimer = setTimeout(() => {
      if (this.currentRunId === runId) {
        console.debug(LOG_PREFIX, 'Detail overlay did not become ready in time:', noteId)
        this.stopWatching()
      }
    }, 6000)

    this.overlayObserver = new MutationObserver(() => {
      if (this.tryExtract(noteId, runId)) {
        this.stopWatching()
      }
    })
    this.overlayObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  /**
   * Try to extract content from the detail overlay.
   * Returns true once analysis has been started for the active note.
   */
  private tryExtract(noteId: string, runId: number): boolean {
    if (this.currentNoteId !== noteId || this.currentRunId !== runId) return false

    const container = this.findDetailContainer()
    if (!container) {
      return false
    }

    if (container.getAttribute(DETAIL_PROCESSED_ATTR) === noteId) return true

    const titleEl = this.querySelectors(container, XHS_SELECTORS.detailTitle)
    const descEl = this.querySelectors(container, XHS_SELECTORS.detailDesc)
    const title = titleEl?.textContent?.trim() ?? ''
    const content = descEl?.textContent?.trim() ?? ''

    if (!title && !content) return false

    container.setAttribute(DETAIL_PROCESSED_ATTR, noteId)
    this.analyze(container, noteId)
    return true
  }

  private analyze(container: Element, noteId: string): void {
    const titleEl = this.querySelectors(container, XHS_SELECTORS.detailTitle)
    const descEl = this.querySelectors(container, XHS_SELECTORS.detailDesc)

    const title = titleEl?.textContent?.trim() ?? ''
    const content = descEl?.textContent?.trim() ?? ''

    if (!title && !content) return

    console.log(LOG_PREFIX, 'Analyzing:', noteId, `title=${title.length}c content=${content.length}c`)

    removeBanner(container)
    container.prepend(createLoadingBanner())

    try {
      chrome.runtime.sendMessage({
        type: 'ANALYZE_DETAIL',
        payload: { noteId, title, content, author: '' },
      }).catch(() => {})
    } catch {
      removeBanner(container)
    }
  }

  private stopWatching(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer)
      this.retryTimer = null
    }
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer)
      this.timeoutTimer = null
    }
    if (this.overlayObserver) {
      this.overlayObserver.disconnect()
      this.overlayObserver = null
    }
  }

  private findDetailContainer(): Element | null {
    return document.querySelector('#noteContainer')
      ?? document.querySelector('.note-detail-mask')
      ?? null
  }

  private extractNoteIdFromHref(href: string): string | null {
    for (const pattern of NOTE_ID_PATTERNS) {
      const match = href.match(pattern)
      if (match) return match[1]
    }
    return null
  }

  private querySelectors(root: Element, selectors: readonly string[]): Element | null {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel)
        if (el) return el
      } catch { /* skip */ }
    }
    return null
  }
}
