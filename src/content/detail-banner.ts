import type { AnalysisResult } from '@/shared/types'
import { TAG_LABELS } from '@/shared/constants'

const BANNER_CLASS = 'xhs-radar-detail-banner'

/**
 * Create a loading-state floating badge shown while LLM analysis is in progress.
 */
export function createLoadingBanner(): HTMLElement {
  const badge = document.createElement('div')
  badge.className = `${BANNER_CLASS} xhs-radar-detail-banner-loading`

  const dot = document.createElement('span')
  dot.className = 'xhs-radar-detail-dot'
  badge.appendChild(dot)

  const text = document.createElement('span')
  text.textContent = '分析中...'
  badge.appendChild(text)

  return badge
}

/**
 * Create a result floating badge showing the LLM analysis outcome.
 */
export function createResultBanner(result: AnalysisResult): HTMLElement {
  const badge = document.createElement('div')

  if (result.isLowQuality) {
    badge.className = `${BANNER_CLASS} xhs-radar-detail-banner-low`
    const tagText = result.tags.map(t => TAG_LABELS[t] ?? t).join(' · ') || '低质'
    badge.textContent = `⚠ ${tagText}`
    if (result.reason) {
      badge.title = result.reason
    }
  } else {
    badge.className = `${BANNER_CLASS} xhs-radar-detail-banner-ok`
    badge.textContent = '✓ 正常'
  }

  return badge
}

/**
 * Remove any existing badge from a container.
 */
export function removeBanner(container: Element): void {
  container.querySelectorAll(`.${BANNER_CLASS}`).forEach(el => el.remove())
}
