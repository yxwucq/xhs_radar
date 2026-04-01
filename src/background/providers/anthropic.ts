import type { AnalysisResult } from '@/shared/types'
import type { NoteInput } from '@/shared/messaging'
import { DEFAULT_API_URLS } from '@/shared/constants'
import { buildSystemPrompt, buildBatchPrompt, buildLiteBatchPrompt } from '@/shared/prompt'
import type { LLMProvider, AnalyzeOptions, OnPartialResult } from './base'
import { parseLineResponse, parseSingleLine, fallbackResult } from './base'

export class AnthropicProvider implements LLMProvider {
  private baseUrl: string

  constructor(
    private apiKey: string,
    private model: string = 'claude-sonnet-4-20250514',
    customBaseUrl?: string
  ) {
    this.baseUrl = customBaseUrl || DEFAULT_API_URLS.anthropic
  }

  private buildRequest(notes: NoteInput[], sensitivity: number, options: AnalyzeOptions, stream: boolean) {
    const { mode = 'detailed', customRules = [], promptHint = '' } = options
    const userPrompt = mode === 'lite' ? buildLiteBatchPrompt(notes) : buildBatchPrompt(notes)
    return {
      model: this.model,
      max_tokens: 1024,
      system: buildSystemPrompt(sensitivity, customRules, promptHint),
      messages: [{ role: 'user', content: userPrompt }],
      ...(stream ? { stream: true } : {}),
    }
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }
  }

  async analyze(
    notes: NoteInput[],
    sensitivity: number,
    signal?: AbortSignal,
    options: AnalyzeOptions = {}
  ): Promise<AnalysisResult[]> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(this.buildRequest(notes, sensitivity, options, false)),
      signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Anthropic API error ${response.status}: ${body.slice(0, 200)}`)
    }

    const text = await response.text()
    let data: any
    try { data = JSON.parse(text) } catch {
      throw new Error(`Anthropic returned non-JSON: ${text.slice(0, 100)}`)
    }
    const content: string = data.content?.[0]?.text ?? ''

    if (!content) {
      throw new Error('Anthropic returned empty content')
    }

    return parseLineResponse(content, notes, sensitivity)
  }

  async analyzeStream(
    notes: NoteInput[],
    sensitivity: number,
    signal: AbortSignal,
    options: AnalyzeOptions,
    onResult: OnPartialResult
  ): Promise<AnalysisResult[]> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(this.buildRequest(notes, sensitivity, options, true)),
      signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Anthropic API error ${response.status}: ${body.slice(0, 200)}`)
    }

    if (!response.body) {
      throw new Error('Anthropic streaming response has no body')
    }

    const emitted = new Map<string, AnalysisResult>()
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let contentBuffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()

          try {
            const json = JSON.parse(payload)
            // Anthropic SSE: content_block_delta has delta.text
            const delta = json.delta?.text ?? ''
            if (!delta) continue

            contentBuffer += delta

            while (contentBuffer.includes('\n')) {
              const newlineIdx = contentBuffer.indexOf('\n')
              const completeLine = contentBuffer.slice(0, newlineIdx)
              contentBuffer = contentBuffer.slice(newlineIdx + 1)

              const result = parseSingleLine(completeLine, notes, sensitivity)
              if (result && !emitted.has(result.noteId)) {
                emitted.set(result.noteId, result)
                onResult(result)
              }
            }
          } catch { /* skip malformed SSE chunk */ }
        }
      }

      if (contentBuffer.trim()) {
        const result = parseSingleLine(contentBuffer.trim(), notes, sensitivity)
        if (result && !emitted.has(result.noteId)) {
          emitted.set(result.noteId, result)
          onResult(result)
        }
      }
    } finally {
      reader.releaseLock()
    }

    return notes.map(n => emitted.get(n.noteId) ?? fallbackResult(n.noteId))
  }
}
