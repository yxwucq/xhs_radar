import { PROCESSED_ATTR } from '@/shared/constants'
import type { NoteData } from '@/shared/types'
import { extractNote, findNoteCards, findFeedContainer } from './extractor'

const LOG_PREFIX = '[XHS Radar Observer]'
const VIEWPORT_ATTR = 'data-xhs-radar-visible'

export type NoteCallback = (notes: NoteData[]) => void

/**
 * Manages MutationObserver + IntersectionObserver for detecting note cards.
 *
 * Flow:
 * 1. MutationObserver detects new card DOM nodes
 * 2. IntersectionObserver waits for cards to enter viewport
 * 3. Only then: extract data and notify callback
 *
 * This avoids wasting LLM calls on off-screen cards the user never sees.
 */
export class FeedObserver {
  private mutationObserver: MutationObserver | null = null
  private intersectionObserver: IntersectionObserver | null = null
  private onNotes: NoteCallback
  private pendingCards = new Map<HTMLElement, true>()
  private currentContainer: Element | null = null
  private watchdog: ReturnType<typeof setInterval> | null = null

  constructor(onNotes: NoteCallback) {
    this.onNotes = onNotes
  }

  start(): void {
    this.intersectionObserver = new IntersectionObserver(
      (entries) => this.handleIntersection(entries),
      { rootMargin: '800px' } // trigger ~2-3 cards before visible
    )
    this.tryConnect(0)

    // Watchdog: detect SPA navigation replacing feed container
    this.watchdog = setInterval(() => {
      if (this.currentContainer && !document.contains(this.currentContainer)) {
        console.log(LOG_PREFIX, 'Feed container detached (SPA refresh), reconnecting...')
        this.reconnect()
      }
    }, 2000)
  }

  stop(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect()
      this.mutationObserver = null
    }
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect()
      this.intersectionObserver = null
    }
    if (this.watchdog) {
      clearInterval(this.watchdog)
      this.watchdog = null
    }
    this.currentContainer = null
    this.pendingCards.clear()
    console.log(LOG_PREFIX, 'Disconnected')
  }

  private reconnect(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect()
      this.mutationObserver = null
    }
    this.currentContainer = null
    this.pendingCards.clear()
    this.tryConnect(0)
  }

  private tryConnect(attempt: number): void {
    const container = findFeedContainer()

    if (!container) {
      if (attempt < 5) {
        const delay = Math.min(1000 * 2 ** attempt, 10000)
        console.debug(LOG_PREFIX, `Feed container not found, retrying in ${delay}ms (attempt ${attempt + 1})`)
        setTimeout(() => this.tryConnect(attempt + 1), delay)
      } else {
        console.warn(LOG_PREFIX, 'Feed container not found after 5 attempts. Selectors may need updating.')
      }
      return
    }

    this.currentContainer = container
    console.log(LOG_PREFIX, 'Connected to feed container')

    // Register existing cards
    this.registerNewCards(container)

    // Watch for new cards
    this.mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            this.registerNewCards(node)
          }
        }
      }
    })

    this.mutationObserver.observe(container, {
      childList: true,
      subtree: true,
    })
  }

  /**
   * Find unprocessed cards and register them with IntersectionObserver.
   */
  private registerNewCards(root: Element): void {
    const cards = findNoteCards(root)
    if (root instanceof HTMLElement && root.matches('section.note-item')) {
      cards.unshift(root)
    }

    for (const card of cards) {
      if (card.hasAttribute(PROCESSED_ATTR)) continue
      card.setAttribute(PROCESSED_ATTR, 'true')

      if (this.intersectionObserver) {
        this.pendingCards.set(card, true)
        this.intersectionObserver.observe(card)
      }
    }
  }

  /**
   * When cards enter viewport, extract and emit.
   */
  private handleIntersection(entries: IntersectionObserverEntry[]): void {
    const newNotes: NoteData[] = []

    for (const entry of entries) {
      if (!entry.isIntersecting) continue

      const card = entry.target as HTMLElement
      if (card.hasAttribute(VIEWPORT_ATTR)) continue
      card.setAttribute(VIEWPORT_ATTR, 'true')

      // Stop observing this card
      this.intersectionObserver?.unobserve(card)
      this.pendingCards.delete(card)

      const note = extractNote(card)
      if (note) newNotes.push(note)
    }

    if (newNotes.length > 0) {
      console.log(LOG_PREFIX, `Detected ${newNotes.length} visible note(s)`)
      this.onNotes(newNotes)
    }
  }
}
