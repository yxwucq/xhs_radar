import { describe, it, expect, beforeEach } from 'vitest'
import { extractNote, findNoteCards, findFeedContainer } from '../extractor'
import { PROCESSED_ATTR } from '@/shared/constants'
import { EXPLORE_FEED_HTML, EXPECTED_NOTES } from './fixture'

describe('extractor', () => {
  beforeEach(() => {
    document.body.innerHTML = EXPLORE_FEED_HTML
  })

  describe('findFeedContainer', () => {
    it('finds the feed container by id', () => {
      const container = findFeedContainer()
      expect(container).not.toBeNull()
      expect(container!.id).toBe('exploreFeeds')
    })
  })

  describe('findNoteCards', () => {
    it('finds all note cards in the feed', () => {
      const container = findFeedContainer()!
      const cards = findNoteCards(container)
      expect(cards).toHaveLength(3)
    })

    it('returns section.note-item elements', () => {
      const container = findFeedContainer()!
      const cards = findNoteCards(container)
      for (const card of cards) {
        expect(card.tagName).toBe('SECTION')
        expect(card.classList.contains('note-item')).toBe(true)
      }
    })
  })

  describe('extractNote', () => {
    it('extracts noteId, title, author, likeCount from each card', () => {
      const container = findFeedContainer()!
      const cards = findNoteCards(container)

      for (let i = 0; i < cards.length; i++) {
        const note = extractNote(cards[i])
        expect(note).not.toBeNull()
        expect(note!.noteId).toBe(EXPECTED_NOTES[i].noteId)
        expect(note!.title).toBe(EXPECTED_NOTES[i].title)
        expect(note!.author).toBe(EXPECTED_NOTES[i].author)
        expect(note!.likeCount).toBe(EXPECTED_NOTES[i].likeCount)
      }
    })

    it('sets content to empty string (XHS cards have no description)', () => {
      const container = findFeedContainer()!
      const cards = findNoteCards(container)
      const note = extractNote(cards[0])
      expect(note!.content).toBe('')
    })

    it('stores reference to the DOM element', () => {
      const container = findFeedContainer()!
      const cards = findNoteCards(container)
      const note = extractNote(cards[0])
      expect(note!.element).toBe(cards[0])
    })

    it('returns null for a card with no links', () => {
      const div = document.createElement('section')
      div.className = 'note-item'
      div.innerHTML = '<div><span>no links here</span></div>'
      expect(extractNote(div)).toBeNull()
    })

    it('returns null for a card with no title', () => {
      const div = document.createElement('section')
      div.className = 'note-item'
      div.innerHTML = '<div><a href="/explore/69c01db9000000001b021fe0"></a></div>'
      expect(extractNote(div)).toBeNull()
    })
  })

  describe('processed attribute', () => {
    it('cards do not have processed attr initially', () => {
      const container = findFeedContainer()!
      const cards = findNoteCards(container)
      for (const card of cards) {
        expect(card.hasAttribute(PROCESSED_ATTR)).toBe(false)
      }
    })
  })
})
