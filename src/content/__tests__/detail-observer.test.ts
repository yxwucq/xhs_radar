import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { DetailObserver } from '../detail-observer'
import type { AnalysisResult } from '@/shared/types'

describe('DetailObserver', () => {
  const sendMessage = vi.fn(() => Promise.resolve())

  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage,
      },
    })
    sendMessage.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('analyzes a note when the detail overlay appears after the click', async () => {
    const observer = new DetailObserver(() => {})
    observer.start()

    document.body.innerHTML = `
      <section class="note-item">
        <a href="https://www.xiaohongshu.com/explore/aaaaaaaaaaaaaaaaaaaaaaaa">
          <span class="title">Test</span>
        </a>
      </section>
    `

    const link = document.querySelector('a')!
    link.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    await vi.advanceTimersByTimeAsync(900)

    const container = document.createElement('div')
    container.id = 'noteContainer'
    container.innerHTML = `
      <div id="detail-title">Delayed title</div>
      <div id="detail-desc">Delayed body</div>
    `
    document.body.appendChild(container)

    await vi.advanceTimersByTimeAsync(400)

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'ANALYZE_DETAIL',
      payload: {
        noteId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        title: 'Delayed title',
        content: 'Delayed body',
        author: '',
      },
    })

    observer.stop()
  })

  it('forwards late results to the callback even after the user clicks another note', () => {
    const onResult = vi.fn()
    const observer = new DetailObserver(onResult)
    observer.start()

    document.body.innerHTML = `
      <a href="https://www.xiaohongshu.com/explore/aaaaaaaaaaaaaaaaaaaaaaaa">A</a>
      <a href="https://www.xiaohongshu.com/explore/bbbbbbbbbbbbbbbbbbbbbbbb">B</a>
    `

    const [firstLink, secondLink] = Array.from(document.querySelectorAll('a'))
    firstLink.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    secondLink.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    const result: AnalysisResult = {
      noteId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      score: 20,
      isLowQuality: true,
      tags: ['clickbait'],
      reason: '标题党',
    }

    observer.handleResult(result.noteId, result)

    expect(onResult).toHaveBeenCalledWith(result.noteId, result)

    observer.stop()
  })
})
