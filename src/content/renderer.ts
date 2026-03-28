import type { AnalysisResult, RiskLevel } from '@/shared/types'
import { SCORE_THRESHOLDS, TAG_LABELS } from '@/shared/constants'

const OVERLAY_ATTR = 'data-xhs-radar-overlay'
const BLUR_TARGET_ATTR = 'data-xhs-radar-blur-target'
const STATUS_ATTR = 'data-xhs-radar-status'

export type CardStatus = 'pending' | 'pass' | 'fail' | 'error'

/**
 * Show a small status indicator on a card.
 * Displays the numeric score when available, otherwise a symbol.
 */
export function setCardStatus(card: HTMLElement, status: CardStatus, detail?: string, score?: number): void {
  let indicator = card.querySelector(`[${STATUS_ATTR}]`) as HTMLElement | null
  if (!indicator) {
    indicator = document.createElement('div')
    indicator.setAttribute(STATUS_ATTR, 'true')
    indicator.className = 'xhs-radar-status'
    card.appendChild(indicator)
  }

  indicator.className = `xhs-radar-status xhs-radar-status-${status}`
  indicator.setAttribute('title', detail ?? status)

  const symbols: Record<CardStatus, string> = {
    pending: '',
    pass: '\u2713',
    fail: '\u2717',
    error: '!',
  }
  indicator.textContent = symbols[status]
}

/**
 * Determine risk level from score.
 */
export function getRiskLevel(score: number): RiskLevel {
  if (score <= SCORE_THRESHOLDS.highRisk) return 'high'
  if (score <= SCORE_THRESHOLDS.mediumRisk) return 'medium'
  return 'normal'
}

/**
 * Find the inner content wrapper of a card to apply blur to.
 * XHS card structure: section.note-item > div (inner content)
 * We blur this inner div so the overlay (sibling) stays crisp.
 */
function getBlurTarget(card: HTMLElement): HTMLElement | null {
  // First child element is the content wrapper in XHS cards
  const firstChild = card.children[0]
  return firstChild instanceof HTMLElement ? firstChild : null
}

/**
 * Apply blur-mode visual mark to a note card based on analysis result.
 * Blur is applied to the card's inner content, NOT the card itself,
 * so the overlay (badge + button) remains crisp and readable.
 */
export function applyBlurMark(card: HTMLElement, result: AnalysisResult): void {
  const risk = getRiskLevel(result.score)
  if (risk === 'normal') return

  // Don't double-apply
  if (card.querySelector(`[${OVERLAY_ATTR}]`)) return

  // Apply blur to inner content only
  const blurTarget = getBlurTarget(card)
  if (blurTarget) {
    blurTarget.setAttribute(BLUR_TARGET_ATTR, 'true')
    blurTarget.classList.add('xhs-radar-blur-target')
    blurTarget.classList.add(risk === 'high' ? 'xhs-radar-blur-high' : 'xhs-radar-blur-medium')
  }

  // Ensure card has relative positioning for overlay
  card.classList.add('xhs-radar-marked')

  // Build overlay (appended to card, NOT inside blurred content)
  const overlay = document.createElement('div')
  overlay.setAttribute(OVERLAY_ATTR, 'true')
  overlay.className = `xhs-radar-overlay xhs-radar-overlay-${risk}`

  // Tag badge
  const badge = document.createElement('div')
  badge.className = `xhs-radar-badge xhs-radar-badge-${risk}`
  const tagText = result.tags.map(t => TAG_LABELS[t] ?? t).join(' · ') || '低质内容'
  badge.textContent = tagText
  overlay.appendChild(badge)

  // Reason text
  if (result.reason) {
    const reason = document.createElement('div')
    reason.className = 'xhs-radar-reason'
    reason.textContent = result.reason
    overlay.appendChild(reason)
  }

  // Reveal button
  const button = document.createElement('button')
  button.className = 'xhs-radar-reveal-btn'
  button.textContent = '点击查看'
  button.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    removeMark(card)
  })
  overlay.appendChild(button)

  card.appendChild(overlay)
}

/**
 * Remove all radar marks from a card, restoring its original appearance.
 */
export function removeMark(card: HTMLElement): void {
  // Remove blur from inner content
  const blurTarget = card.querySelector(`[${BLUR_TARGET_ATTR}]`) as HTMLElement | null
  if (blurTarget) {
    blurTarget.classList.remove('xhs-radar-blur-target', 'xhs-radar-blur-high', 'xhs-radar-blur-medium')
    blurTarget.removeAttribute(BLUR_TARGET_ATTR)
  }

  card.classList.remove('xhs-radar-marked', 'xhs-radar-hidden')

  const overlay = card.querySelector(`[${OVERLAY_ATTR}]`)
  if (overlay) overlay.remove()
}

/**
 * Apply vanish-mode: hide the card entirely.
 */
export function applyVanishMark(card: HTMLElement, result: AnalysisResult): void {
  const risk = getRiskLevel(result.score)
  if (risk === 'normal') return
  card.classList.add('xhs-radar-hidden')
}

/**
 * Remove all radar marks from all cards on the page.
 */
export function clearAllMarks(): void {
  document.querySelectorAll('.xhs-radar-marked, .xhs-radar-hidden').forEach(el => {
    removeMark(el as HTMLElement)
  })
}
