import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FeedObserver } from '../observer'
import { PROCESSED_ATTR } from '@/shared/constants'
import type { NoteData } from '@/shared/types'
import { EXPLORE_FEED_HTML } from './fixture'

/**
 * happy-dom provides IntersectionObserver, but entries never fire automatically.
 * We capture the IO instance and manually trigger intersections.
 */
let ioCallback: IntersectionObserverCallback
let ioInstance: IntersectionObserver
const observedElements: Element[] = []

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null
  readonly rootMargin: string = ''
  readonly thresholds: ReadonlyArray<number> = []

  constructor(callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {
    ioCallback = callback
    ioInstance = this as unknown as IntersectionObserver
  }

  observe(target: Element): void {
    observedElements.push(target)
  }
  unobserve(_target: Element): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] { return [] }
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

function simulateVisible(elements: Element[]): void {
  const entries = elements.map(el => ({
    target: el,
    isIntersecting: true,
    boundingClientRect: {} as DOMRectReadOnly,
    intersectionRatio: 1,
    intersectionRect: {} as DOMRectReadOnly,
    rootBounds: null,
    time: Date.now(),
  })) as IntersectionObserverEntry[]
  ioCallback(entries, ioInstance)
}

describe('FeedObserver', () => {
  let onNotes: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.body.innerHTML = EXPLORE_FEED_HTML
    onNotes = vi.fn()
    observedElements.length = 0
  })

  it('registers existing cards with IntersectionObserver on start', () => {
    const observer = new FeedObserver(onNotes)
    observer.start()

    expect(observedElements).toHaveLength(3)
    // Not yet notified (cards haven't "intersected")
    expect(onNotes).not.toHaveBeenCalled()

    observer.stop()
  })

  it('emits notes when cards become visible', () => {
    const observer = new FeedObserver(onNotes)
    observer.start()

    // Simulate all 3 cards entering viewport
    simulateVisible(observedElements)

    expect(onNotes).toHaveBeenCalledTimes(1)
    const notes: NoteData[] = onNotes.mock.calls[0][0]
    expect(notes).toHaveLength(3)

    observer.stop()
  })

  it('marks processed cards with data attribute', () => {
    const observer = new FeedObserver(onNotes)
    observer.start()

    const cards = document.querySelectorAll('section.note-item')
    for (const card of cards) {
      expect(card.hasAttribute(PROCESSED_ATTR)).toBe(true)
    }

    observer.stop()
  })

  it('does not process already-processed cards', () => {
    const cards = document.querySelectorAll('section.note-item')
    for (const card of cards) {
      card.setAttribute(PROCESSED_ATTR, 'true')
    }

    const observer = new FeedObserver(onNotes)
    observer.start()

    expect(observedElements).toHaveLength(0)

    observer.stop()
  })

  it('detects dynamically added cards via MutationObserver', async () => {
    const observer = new FeedObserver(onNotes)
    observer.start()

    // Simulate initial cards visible
    simulateVisible(observedElements)
    onNotes.mockClear()
    observedElements.length = 0

    // Add a new card
    const container = document.getElementById('exploreFeeds')!
    const newCard = document.createElement('section')
    newCard.className = 'note-item'
    newCard.innerHTML = `<div><a style="display:none;" href="/explore/aaaa00000000000000000001"></a><div class="footer"><a class="title"><span>Dynamic note</span></a><div class="author-wrapper"><a class="author"><span class="name">Tester</span></a><span class="like-wrapper"><span class="count">42</span></span></div></div></div>`
    container.appendChild(newCard)

    // MutationObserver is async
    await new Promise(resolve => setTimeout(resolve, 0))

    // Card registered but not yet visible
    expect(observedElements).toHaveLength(1)
    expect(onNotes).not.toHaveBeenCalled()

    // Simulate it entering viewport
    simulateVisible(observedElements)

    expect(onNotes).toHaveBeenCalledTimes(1)
    const notes: NoteData[] = onNotes.mock.calls[0][0]
    expect(notes[0].noteId).toBe('aaaa00000000000000000001')
    expect(notes[0].title).toBe('Dynamic note')

    observer.stop()
  })
})
