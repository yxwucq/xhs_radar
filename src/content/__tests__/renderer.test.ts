import { describe, it, expect, beforeEach } from 'vitest'
import type { AnalysisResult } from '@/shared/types'
import { applyBlurMark, applyVanishMark, removeMark, clearAllMarks, getRiskLevel } from '../renderer'

/** Create a card matching real XHS structure: section > div (inner content) */
function makeCard(): HTMLElement {
  const card = document.createElement('section')
  card.className = 'note-item'
  card.innerHTML = '<div><a class="cover"><img /></a><div class="footer"><a class="title"><span>Test</span></a></div></div>'
  document.body.appendChild(card)
  return card
}

function getInnerDiv(card: HTMLElement): HTMLElement {
  return card.children[0] as HTMLElement
}

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    noteId: 'test123',
    score: 20,
    isLowQuality: true,
    tags: ['clickbait'],
    reason: '标题党内容',
    ...overrides,
  }
}

describe('getRiskLevel', () => {
  it('returns high for score 0-30', () => {
    expect(getRiskLevel(0)).toBe('high')
    expect(getRiskLevel(15)).toBe('high')
    expect(getRiskLevel(30)).toBe('high')
  })

  it('returns medium for score 31-50', () => {
    expect(getRiskLevel(31)).toBe('medium')
    expect(getRiskLevel(40)).toBe('medium')
    expect(getRiskLevel(50)).toBe('medium')
  })

  it('returns normal for score 51-100', () => {
    expect(getRiskLevel(51)).toBe('normal')
    expect(getRiskLevel(75)).toBe('normal')
    expect(getRiskLevel(100)).toBe('normal')
  })
})

describe('applyBlurMark', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('applies blur to inner content div, not the card itself', () => {
    const card = makeCard()
    applyBlurMark(card, makeResult({ score: 20 }))

    const inner = getInnerDiv(card)
    expect(inner.classList.contains('xhs-radar-blur-high')).toBe(true)
    // Card itself should NOT have blur class
    expect(card.classList.contains('xhs-radar-blur-high')).toBe(false)
    // Card should have marked class for positioning
    expect(card.classList.contains('xhs-radar-marked')).toBe(true)
  })

  it('applies medium blur for score 31-50', () => {
    const card = makeCard()
    applyBlurMark(card, makeResult({ score: 45 }))

    const inner = getInnerDiv(card)
    expect(inner.classList.contains('xhs-radar-blur-medium')).toBe(true)
    expect(inner.classList.contains('xhs-radar-blur-high')).toBe(false)
  })

  it('does nothing for normal-risk score > 50', () => {
    const card = makeCard()
    applyBlurMark(card, makeResult({ score: 75, isLowQuality: false }))

    expect(card.classList.contains('xhs-radar-marked')).toBe(false)
    expect(card.querySelector('[data-xhs-radar-overlay]')).toBeNull()
  })

  it('still marks content that is low-quality under a stricter sensitivity threshold', () => {
    const card = makeCard()
    applyBlurMark(card, makeResult({ score: 75, isLowQuality: true }))

    const inner = getInnerDiv(card)
    expect(card.classList.contains('xhs-radar-marked')).toBe(true)
    expect(inner.classList.contains('xhs-radar-blur-medium')).toBe(true)
  })

  it('adds overlay with badge showing tag labels', () => {
    const card = makeCard()
    applyBlurMark(card, makeResult({ tags: ['clickbait', 'anxiety'] }))

    const badge = card.querySelector('.xhs-radar-badge')
    expect(badge).not.toBeNull()
    expect(badge!.textContent).toContain('标题党')
    expect(badge!.textContent).toContain('焦虑诱导')
  })

  it('shows fallback badge text when no tags', () => {
    const card = makeCard()
    applyBlurMark(card, makeResult({ tags: [] }))

    const badge = card.querySelector('.xhs-radar-badge')
    expect(badge!.textContent).toBe('低质内容')
  })

  it('adds reason text', () => {
    const card = makeCard()
    applyBlurMark(card, makeResult({ reason: '夸张标题' }))

    const reason = card.querySelector('.xhs-radar-reason')
    expect(reason).not.toBeNull()
    expect(reason!.textContent).toBe('夸张标题')
  })

  it('adds a reveal button', () => {
    const card = makeCard()
    applyBlurMark(card, makeResult())

    const btn = card.querySelector('.xhs-radar-reveal-btn')
    expect(btn).not.toBeNull()
    expect(btn!.textContent).toBe('点击查看')
  })

  it('reveal button removes blur and overlay on click', () => {
    const card = makeCard()
    applyBlurMark(card, makeResult())

    const btn = card.querySelector('.xhs-radar-reveal-btn') as HTMLButtonElement
    btn.click()

    const inner = getInnerDiv(card)
    expect(inner.classList.contains('xhs-radar-blur-high')).toBe(false)
    expect(card.classList.contains('xhs-radar-marked')).toBe(false)
    expect(card.querySelector('[data-xhs-radar-overlay]')).toBeNull()
  })

  it('does not double-apply overlay', () => {
    const card = makeCard()
    applyBlurMark(card, makeResult())
    applyBlurMark(card, makeResult())

    const overlays = card.querySelectorAll('[data-xhs-radar-overlay]')
    expect(overlays).toHaveLength(1)
  })

  it('applies correct badge class per risk level', () => {
    const card1 = makeCard()
    applyBlurMark(card1, makeResult({ score: 10 }))
    expect(card1.querySelector('.xhs-radar-badge-high')).not.toBeNull()

    const card2 = makeCard()
    applyBlurMark(card2, makeResult({ score: 45 }))
    expect(card2.querySelector('.xhs-radar-badge-medium')).not.toBeNull()
  })
})

describe('applyVanishMark', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('hides card with xhs-radar-hidden class', () => {
    const card = makeCard()
    applyVanishMark(card, makeResult({ score: 20 }))
    expect(card.classList.contains('xhs-radar-hidden')).toBe(true)
  })

  it('does nothing for normal-risk content', () => {
    const card = makeCard()
    applyVanishMark(card, makeResult({ score: 75, isLowQuality: false }))
    expect(card.classList.contains('xhs-radar-hidden')).toBe(false)
  })

  it('still hides content that is low-quality under a stricter sensitivity threshold', () => {
    const card = makeCard()
    applyVanishMark(card, makeResult({ score: 75, isLowQuality: true }))
    expect(card.classList.contains('xhs-radar-hidden')).toBe(true)
  })
})

describe('removeMark', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('removes blur from inner content and overlay from card', () => {
    const card = makeCard()
    applyBlurMark(card, makeResult())

    removeMark(card)

    const inner = getInnerDiv(card)
    expect(inner.classList.contains('xhs-radar-blur-high')).toBe(false)
    expect(card.classList.contains('xhs-radar-marked')).toBe(false)
    expect(card.querySelector('[data-xhs-radar-overlay]')).toBeNull()
  })

  it('removes vanish class', () => {
    const card = makeCard()
    applyVanishMark(card, makeResult())

    removeMark(card)

    expect(card.classList.contains('xhs-radar-hidden')).toBe(false)
  })
})

describe('clearAllMarks', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('removes marks from all cards on page', () => {
    const card1 = makeCard()
    const card2 = makeCard()
    applyBlurMark(card1, makeResult({ score: 10 }))
    applyBlurMark(card2, makeResult({ score: 40 }))

    clearAllMarks()

    expect(card1.classList.contains('xhs-radar-marked')).toBe(false)
    expect(card2.classList.contains('xhs-radar-marked')).toBe(false)
    expect(document.querySelectorAll('[data-xhs-radar-overlay]')).toHaveLength(0)
  })
})
