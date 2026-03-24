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

  it('flushes immediately when batch size (5) is reached', () => {
    const queue = new AnalysisQueue()
    const notes = Array.from({ length: 5 }, (_, i) => makeNote(String(i)))

    queue.enqueue(notes)

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    const msg = mockSendMessage.mock.calls[0][0] as { type: string; payload: { notes: unknown[] } }
    expect(msg.type).toBe('ANALYZE_NOTES')
    expect(msg.payload.notes).toHaveLength(5)
  })

  it('flushes after 2s timeout when batch not full', () => {
    const queue = new AnalysisQueue()
    queue.enqueue([makeNote('a'), makeNote('b')])

    expect(mockSendMessage).not.toHaveBeenCalled()

    vi.advanceTimersByTime(2000)

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    const msg = mockSendMessage.mock.calls[0][0] as { type: string; payload: { notes: unknown[] } }
    expect(msg.payload.notes).toHaveLength(2)
  })

  it('does not send duplicate notes after both batch and timer', () => {
    const queue = new AnalysisQueue()
    queue.enqueue([makeNote('a')])

    vi.advanceTimersByTime(2000)
    expect(mockSendMessage).toHaveBeenCalledTimes(1)

    // No more flushes should happen
    vi.advanceTimersByTime(5000)
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
  })

  it('strips DOM element from sent payload (not serializable)', () => {
    const queue = new AnalysisQueue()
    queue.enqueue(Array.from({ length: 5 }, (_, i) => makeNote(String(i))))

    const msg = mockSendMessage.mock.calls[0][0] as { payload: { notes: Array<Record<string, unknown>> } }
    for (const note of msg.payload.notes) {
      expect(note).not.toHaveProperty('element')
    }
  })

  it('handles overflow beyond batch size by scheduling next flush', () => {
    const queue = new AnalysisQueue()
    const notes = Array.from({ length: 7 }, (_, i) => makeNote(String(i)))

    queue.enqueue(notes)

    // First batch of 5 fires immediately
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect((mockSendMessage.mock.calls[0][0] as { payload: { notes: unknown[] } }).payload.notes).toHaveLength(5)

    // Remaining 2 should flush after timeout
    vi.advanceTimersByTime(2000)
    expect(mockSendMessage).toHaveBeenCalledTimes(2)
    expect((mockSendMessage.mock.calls[1][0] as { payload: { notes: unknown[] } }).payload.notes).toHaveLength(2)
  })
})
