import type { AnalysisResult, LastLLMError, UserConfig } from '@/shared/types'
import type { NoteInput } from '@/shared/messaging'
import type { LLMProvider, AnalyzeOptions, OnPartialResult } from './providers/base'
import { OpenAIProvider } from './providers/openai'
import { AnthropicProvider } from './providers/anthropic'

const LOG_PREFIX = '[XHS Radar Gateway]'
const MAX_CONCURRENT = 2
const TIMEOUT_MS = 15_000
const MAX_RETRIES = 2

export type ErrorListener = (err: LastLLMError | null) => void

function fallbackResults(notes: NoteInput[], reason: string): AnalysisResult[] {
  return notes.map(n => ({
    noteId: n.noteId,
    score: 75,
    isLowQuality: false,
    tags: [],
    reason,
  }))
}

function isRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message
    return msg.includes('429') || msg.includes('500') || msg.includes('502')
      || msg.includes('503') || msg.includes('529')
  }
  return false
}

function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('401') || error.message.includes('403')
  }
  return false
}

export class LLMGateway {
  private activeRequests = 0
  private queue: Array<{
    notes: NoteInput[]
    sensitivity: number
    options: AnalyzeOptions
    onPartialResult?: OnPartialResult
    resolve: (results: AnalysisResult[]) => void
    reject: (error: Error) => void
  }> = []

  private provider: LLMProvider | null = null
  private configHash = ''
  private lastError: LastLLMError | null = null
  private errorListener: ErrorListener | null = null

  setErrorListener(listener: ErrorListener): void {
    this.errorListener = listener
  }

  getLastError(): LastLLMError | null {
    return this.lastError
  }

  private updateLastError(next: LastLLMError | null): void {
    const prevType = this.lastError?.type ?? null
    const nextType = next?.type ?? null
    this.lastError = next
    if (prevType !== nextType) {
      this.errorListener?.(next)
    }
  }

  updateConfig(config: UserConfig): void {
    const hash = `${config.llmProvider}:${config.apiKey}:${config.model}:${config.apiBaseUrl}`
    if (hash === this.configHash) return

    this.configHash = hash
    // Clear sticky errors — user may have entered a new key
    this.updateLastError(null)

    if (!config.apiKey) {
      this.provider = null
      console.warn(LOG_PREFIX, 'No API key configured')
      return
    }

    const baseUrl = config.apiBaseUrl || undefined

    switch (config.llmProvider) {
      case 'openai':
        this.provider = new OpenAIProvider(config.apiKey, config.model, baseUrl)
        break
      case 'anthropic':
        this.provider = new AnthropicProvider(config.apiKey, config.model, baseUrl)
        break
    }

    console.log(LOG_PREFIX, `Provider updated: ${config.llmProvider} / ${config.model}`)
  }

  analyze(
    notes: NoteInput[],
    sensitivity: number,
    options: AnalyzeOptions = {},
    onPartialResult?: OnPartialResult
  ): Promise<AnalysisResult[]> {
    if (!this.provider) {
      return Promise.reject(new Error('LLM provider not configured. Set your API key in settings.'))
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ notes, sensitivity, options, onPartialResult, resolve, reject })
      this.processQueue()
    })
  }

  private processQueue(): void {
    while (this.activeRequests < MAX_CONCURRENT && this.queue.length > 0) {
      const item = this.queue.shift()!
      this.activeRequests++
      this.executeWithRetry(item.notes, item.sensitivity, item.options, item.onPartialResult, 0)
        .then(item.resolve)
        .catch(item.reject)
        .finally(() => {
          this.activeRequests--
          this.processQueue()
        })
    }
  }

  private async executeWithRetry(
    notes: NoteInput[],
    sensitivity: number,
    options: AnalyzeOptions,
    onPartialResult: OnPartialResult | undefined,
    attempt: number
  ): Promise<AnalysisResult[]> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      console.log(LOG_PREFIX, `Analyzing ${notes.length} note(s)${attempt > 0 ? ` (retry ${attempt})` : ''}...`)

      let results: AnalysisResult[]

      // Use streaming if provider supports it and we have a callback (first attempt only)
      if (onPartialResult && attempt === 0 && this.provider!.analyzeStream) {
        results = await this.provider!.analyzeStream(
          notes, sensitivity, controller.signal, options, onPartialResult
        )
      } else {
        results = await this.provider!.analyze(notes, sensitivity, controller.signal, options)
      }

      console.log(LOG_PREFIX, `Analysis complete for ${notes.length} note(s)`)
      this.updateLastError(null)
      return results
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.warn(LOG_PREFIX, `Request timed out after ${TIMEOUT_MS}ms`)
        this.updateLastError({ type: 'timeout', message: `分析超时（${TIMEOUT_MS / 1000}s）`, timestamp: Date.now() })
        return fallbackResults(notes, '分析超时，默认放行')
      }

      if (isAuthError(error)) {
        const msg = (error as Error).message
        console.log(LOG_PREFIX, 'API key invalid or unauthorized:', msg)
        this.updateLastError({ type: 'auth', message: msg.slice(0, 200), timestamp: Date.now() })
        return fallbackResults(notes, 'API Key 无效')
      }

      // Retry without streaming (partial results may have been pushed already)
      if (isRetryable(error) && attempt < MAX_RETRIES) {
        const delay = 1000 * 2 ** attempt
        console.warn(LOG_PREFIX, `Retryable error, waiting ${delay}ms:`, (error as Error).message)
        await new Promise(r => setTimeout(r, delay))
        return this.executeWithRetry(notes, sensitivity, options, undefined, attempt + 1)
      }

      const msg = error instanceof Error ? error.message : String(error)
      console.log(LOG_PREFIX, 'Analysis failed:', error)
      this.updateLastError({
        type: isRetryable(error) ? 'network' : 'unknown',
        message: msg.slice(0, 200),
        timestamp: Date.now(),
      })
      return fallbackResults(notes, '分析失败，默认放行')
    } finally {
      clearTimeout(timeout)
    }
  }
}
