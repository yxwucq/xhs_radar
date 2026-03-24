import type { NoteData } from '@/shared/types'
import { XHS_SELECTORS, NOTE_ID_PATTERNS } from '@/shared/constants'

const LOG_PREFIX = '[XHS Radar Extractor]'

/**
 * Try multiple selectors in order, return the first match.
 * Returns null (never throws) if selectors are invalid or DOM is malformed.
 */
function querySelector(root: Element, selectors: readonly string[]): Element | null {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel)
      if (el) return el
    } catch {
      // Invalid selector — skip silently
    }
  }
  return null
}

/**
 * Extract noteId from an element by searching for note links.
 */
function extractNoteId(card: Element): string | null {
  for (const sel of XHS_SELECTORS.noteLink) {
    const anchor = card.querySelector(sel)
    if (!anchor) continue
    const href = anchor.getAttribute('href') ?? ''
    for (const pattern of NOTE_ID_PATTERNS) {
      const match = href.match(pattern)
      if (match) return match[1]
    }
  }
  return null
}

/**
 * Extract NoteData from a single note card DOM element.
 * Returns null if noteId or title cannot be extracted.
 */
export function extractNote(card: HTMLElement): NoteData | null {
  try {
    const noteId = extractNoteId(card)
    if (!noteId) {
      console.debug(LOG_PREFIX, 'No noteId found in card')
      return null
    }

    const titleEl = querySelector(card, XHS_SELECTORS.noteTitle)
    const title = titleEl?.textContent?.trim() ?? ''

    if (!title) {
      console.debug(LOG_PREFIX, 'No title found for note:', noteId)
      return null
    }

    const contentEl = querySelector(card, XHS_SELECTORS.noteContent)
    const content = contentEl?.textContent?.trim() ?? ''

    const authorEl = querySelector(card, XHS_SELECTORS.noteAuthor)
    const author = authorEl?.textContent?.trim() ?? ''

    const likeCountEl = querySelector(card, XHS_SELECTORS.noteLikeCount)
    const likeCount = likeCountEl?.textContent?.trim() ?? ''

    return { noteId, title, content, author, likeCount, element: card }
  } catch (e) {
    console.warn(LOG_PREFIX, 'Extraction failed for card, selectors may need updating:', e)
    return null
  }
}

/**
 * Find all note card elements within a root element.
 */
export function findNoteCards(root: Element): HTMLElement[] {
  for (const selector of XHS_SELECTORS.noteCard) {
    try {
      const cards = root.querySelectorAll<HTMLElement>(selector)
      if (cards.length > 0) return Array.from(cards)
    } catch {
      // Invalid selector — skip
    }
  }
  return []
}

/**
 * Find the feed container element in the page.
 */
export function findFeedContainer(): Element | null {
  for (const selector of XHS_SELECTORS.feedContainer) {
    try {
      const el = document.querySelector(selector)
      if (el) {
        console.debug(LOG_PREFIX, 'Feed container found with selector:', selector)
        return el
      }
    } catch {
      // Invalid selector — skip
    }
  }
  return null
}
