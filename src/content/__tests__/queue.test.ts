import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NoteData } from '@/shared/types'

// Mock chrome APIs before importing queue
const mockSendMessage = vi.fn((_msg: unknown) => Promise.resolve())

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: mockSendMessage,
    lastError: null,
  },
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    },
    onChanged: { addListener: vi.fn() },
  },
})

// Import after mocking
const { AnalysisQueue } = await import('../queue')

function makeNote(id: string): NoteData {
  return {
    noteId: id,
    title: `Title ${id}`,
    content: '',
    author: `Author ${id}`,
    likeCount: '0',
    element: document.createElement('div'),
  }
}

describe('AnalysisQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockSendMessage.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('first flush triggers at batch size 5', () => {
    const queue = new AnalysisQueue()
    queue.enqueue(Array.from({ length: 5 }, (_, i) => makeNote(String(i))))

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    const msg = mockSendMessage.mock.calls[0][0] as { type: string; payload: { notes: unknown[] } }
    expect(msg.type).toBe('ANALYZE_NOTES')
    expect(msg.payload.notes).toHaveLength(5)
  })

  it('first flush fires after 200ms timeout when batch not full', () => {
    const queue = new AnalysisQueue()
    queue.enqueue([makeNote('a'), makeNote('b')])

    expect(mockSendMessage).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect((mockSendMessage.mock.calls[0][0] as any).payload.notes).toHaveLength(2)
  })

  it('subsequent flushes use normal batch size 20', () => {
    const queue = new AnalysisQueue()

    // First flush: 5 notes
    queue.enqueue(Array.from({ length: 5 }, (_, i) => makeNote(`a${i}`)))
    expect(mockSendMessage).toHaveBeenCalledTimes(1)

    // Now enqueue 10 more — should NOT flush immediately (batch size is now 20)
    queue.enqueue(Array.from({ length: 10 }, (_, i) => makeNote(`b${i}`)))
    expect(mockSendMessage).toHaveBeenCalledTimes(1) // still 1

    // Should flush after 500ms timeout
    vi.advanceTimersByTime(500)
    expect(mockSendMessage).toHaveBeenCalledTimes(2)
    expect((mockSendMessage.mock.calls[1][0] as any).payload.notes).toHaveLength(10)
  })

  it('subsequent flush triggers at batch size 20', () => {
    const queue = new AnalysisQueue()

    // First flush
    queue.enqueue(Array.from({ length: 5 }, (_, i) => makeNote(`a${i}`)))
    expect(mockSendMessage).toHaveBeenCalledTimes(1)

    // Enqueue 20 more — should flush immediately at 20
    queue.enqueue(Array.from({ length: 20 }, (_, i) => makeNote(`b${i}`)))
    expect(mockSendMessage).toHaveBeenCalledTimes(2)
    expect((mockSendMessage.mock.calls[1][0] as any).payload.notes).toHaveLength(20)
  })

  it('does not send duplicate notes after both batch and timer', () => {
    const queue = new AnalysisQueue()
    queue.enqueue([makeNote('a')])

    vi.advanceTimersByTime(200)
    expect(mockSendMessage).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(5000)
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
  })

  it('strips DOM element from sent payload', () => {
    const queue = new AnalysisQueue()
    queue.enqueue(Array.from({ length: 5 }, (_, i) => makeNote(String(i))))

    const msg = mockSendMessage.mock.calls[0][0] as { payload: { notes: Array<Record<string, unknown>> } }
    for (const note of msg.payload.notes) {
      expect(note).not.toHaveProperty('element')
    }
  })

  it('handles overflow from first batch into normal batch', () => {
    const queue = new AnalysisQueue()
    queue.enqueue(Array.from({ length: 8 }, (_, i) => makeNote(String(i))))

    // First batch of 5 fires immediately
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect((mockSendMessage.mock.calls[0][0] as any).payload.notes).toHaveLength(5)

    // Remaining 3 should flush after 500ms (now in normal mode)
    vi.advanceTimersByTime(500)
    expect(mockSendMessage).toHaveBeenCalledTimes(2)
    expect((mockSendMessage.mock.calls[1][0] as any).payload.notes).toHaveLength(3)
  })
})
