import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AnalysisResult, LastLLMError, UserConfig } from '@/shared/types'
import type { NoteInput } from '@/shared/messaging'

// Mock providers — both classes return the same controllable fake instance.
const mockAnalyze = vi.fn()
const mockAnalyzeStream = vi.fn()

vi.mock('../providers/openai', () => ({
  OpenAIProvider: vi.fn().mockImplementation(() => ({
    analyze: mockAnalyze,
    analyzeStream: mockAnalyzeStream,
  })),
}))
vi.mock('../providers/anthropic', () => ({
  AnthropicProvider: vi.fn().mockImplementation(() => ({
    analyze: mockAnalyze,
    analyzeStream: mockAnalyzeStream,
  })),
}))

const { LLMGateway } = await import('../llm-gateway')
const { DEFAULT_CONFIG } = await import('@/shared/constants')

function makeNotes(...ids: string[]): NoteInput[] {
  return ids.map(id => ({ noteId: id, title: `t-${id}`, content: '', author: '', likeCount: '' }))
}

function configWith(overrides: Partial<UserConfig> = {}): UserConfig {
  return { ...DEFAULT_CONFIG, apiKey: 'test-key', llmProvider: 'openai', model: 'gpt-4o-mini', ...overrides }
}

function okResults(notes: NoteInput[], score = 80): AnalysisResult[] {
  return notes.map(n => ({ noteId: n.noteId, score, isLowQuality: score < 50, tags: [], reason: '' }))
}

describe('LLMGateway', () => {
  beforeEach(() => {
    mockAnalyze.mockReset()
    mockAnalyzeStream.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects when no provider is configured', async () => {
    const gw = new LLMGateway()
    await expect(gw.analyze(makeNotes('n1'), 50)).rejects.toThrow(/not configured/)
  })

  it('returns provider results on the happy path and clears lastError', async () => {
    const gw = new LLMGateway()
    gw.updateConfig(configWith())
    mockAnalyze.mockResolvedValueOnce(okResults(makeNotes('n1')))

    const results = await gw.analyze(makeNotes('n1'), 50)
    expect(results).toHaveLength(1)
    expect(results[0].score).toBe(80)
    expect(gw.getLastError()).toBeNull()
  })

  it('returns auth fallback and sets lastError on 401, no retry', async () => {
    const gw = new LLMGateway()
    gw.updateConfig(configWith())
    mockAnalyze.mockRejectedValueOnce(new Error('OpenAI API error 401: Invalid API key'))

    const results = await gw.analyze(makeNotes('n1'), 50)
    expect(mockAnalyze).toHaveBeenCalledTimes(1) // no retry
    expect(results[0].isLowQuality).toBe(false)
    expect(results[0].reason).toBe('API Key 无效')
    expect(gw.getLastError()?.type).toBe('auth')
  })

  it('retries on 429 and returns success on the second attempt', async () => {
    vi.useFakeTimers()
    const gw = new LLMGateway()
    gw.updateConfig(configWith())
    mockAnalyze
      .mockRejectedValueOnce(new Error('OpenAI API error 429: rate limited'))
      .mockResolvedValueOnce(okResults(makeNotes('n1'), 90))

    const promise = gw.analyze(makeNotes('n1'), 50)
    // First attempt fails, then 1s backoff before retry
    await vi.advanceTimersByTimeAsync(1500)
    const results = await promise

    expect(mockAnalyze).toHaveBeenCalledTimes(2)
    expect(results[0].score).toBe(90)
    expect(gw.getLastError()).toBeNull()
  })

  it('gives up after MAX_RETRIES (3 total attempts) on persistent 5xx', async () => {
    vi.useFakeTimers()
    const gw = new LLMGateway()
    gw.updateConfig(configWith())
    mockAnalyze.mockRejectedValue(new Error('OpenAI API error 503: service unavailable'))

    const promise = gw.analyze(makeNotes('n1'), 50)
    // Backoffs: 1s + 2s = 3s total
    await vi.advanceTimersByTimeAsync(5000)
    const results = await promise

    expect(mockAnalyze).toHaveBeenCalledTimes(3) // initial + 2 retries
    expect(results[0].reason).toBe('分析失败，默认放行')
    expect(gw.getLastError()?.type).toBe('network')
  })

  it('returns timeout fallback when the request is aborted', async () => {
    vi.useFakeTimers()
    const gw = new LLMGateway()
    gw.updateConfig(configWith())
    mockAnalyze.mockImplementation((_n, _s, signal: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    )

    const promise = gw.analyze(makeNotes('n1'), 50)
    await vi.advanceTimersByTimeAsync(16_000) // > 15s TIMEOUT_MS
    const results = await promise

    expect(results[0].reason).toBe('分析超时，默认放行')
    expect(gw.getLastError()?.type).toBe('timeout')
  })

  it('notifies errorListener only when error type changes', async () => {
    const gw = new LLMGateway()
    gw.updateConfig(configWith())
    const events: (LastLLMError | null)[] = []
    gw.setErrorListener(err => events.push(err))

    // Two consecutive auth errors → listener fires once on type change to 'auth'
    mockAnalyze
      .mockRejectedValueOnce(new Error('OpenAI API error 401'))
      .mockRejectedValueOnce(new Error('OpenAI API error 403'))
    await gw.analyze(makeNotes('n1'), 50)
    await gw.analyze(makeNotes('n2'), 50)
    expect(events).toEqual([{ type: 'auth', message: expect.any(String), timestamp: expect.any(Number) }])

    // Then a success → listener fires with null
    mockAnalyze.mockResolvedValueOnce(okResults(makeNotes('n3')))
    await gw.analyze(makeNotes('n3'), 50)
    expect(events).toHaveLength(2)
    expect(events[1]).toBeNull()
  })

  it('clears lastError when provider config changes (new key)', async () => {
    const gw = new LLMGateway()
    gw.updateConfig(configWith({ apiKey: 'bad-key' }))
    mockAnalyze.mockRejectedValueOnce(new Error('OpenAI API error 401'))
    await gw.analyze(makeNotes('n1'), 50)
    expect(gw.getLastError()?.type).toBe('auth')

    gw.updateConfig(configWith({ apiKey: 'new-key' }))
    expect(gw.getLastError()).toBeNull()
  })
})
