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
  private processedNotes = new Set<string>()
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
  }

  handleResult(noteId: string, result: AnalysisResult): void {
    if (noteId !== this.currentNoteId) return

    const container = this.findDetailContainer()
    if (container) {
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
    if (!noteId || this.processedNotes.has(noteId)) return

    this.processedNotes.add(noteId)
    this.currentNoteId = noteId

    // Wait for overlay to render, then try to extract content
    setTimeout(() => this.tryExtract(noteId, 0), 800)
  }

  /**
   * Try to extract content from the detail overlay.
   * At most 2 attempts (800ms and 2s after click) — then gives up or analyzes title-only.
   */
  private tryExtract(noteId: string, attempt: number): void {
    if (this.currentNoteId !== noteId) return

    const container = this.findDetailContainer()
    if (!container) {
      if (attempt === 0) setTimeout(() => this.tryExtract(noteId, 1), 1200)
      return
    }

    if (container.hasAttribute(DETAIL_PROCESSED_ATTR)) return

    const descEl = this.querySelectors(container, XHS_SELECTORS.detailDesc)
    const content = descEl?.textContent?.trim() ?? ''

    // If no content yet on first attempt, retry once more
    if (!content && attempt === 0) {
      setTimeout(() => this.tryExtract(noteId, 1), 1200)
      return
    }

    container.setAttribute(DETAIL_PROCESSED_ATTR, noteId)
    this.analyze(container, noteId)
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
