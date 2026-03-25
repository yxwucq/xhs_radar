import type { AnalysisResult } from '@/shared/types'
import type { NoteInput } from '@/shared/messaging'
import { DEFAULT_API_URLS } from '@/shared/constants'
import { buildSystemPrompt, buildBatchPrompt, buildLiteBatchPrompt } from '@/shared/prompt'
import type { LLMProvider, AnalyzeOptions, OnPartialResult } from './base'
import { parseLineResponse, parseSingleLine, fallbackResult } from './base'

export class OpenAIProvider implements LLMProvider {
  private baseUrl: string

  constructor(
    private apiKey: string,
    private model: string = 'gpt-4o-mini',
    customBaseUrl?: string
  ) {
    this.baseUrl = customBaseUrl || DEFAULT_API_URLS.openai
  }

  private buildRequest(notes: NoteInput[], sensitivity: number, options: AnalyzeOptions, stream: boolean) {
    const { mode = 'detailed', customRules = [] } = options
    const userPrompt = mode === 'lite' ? buildLiteBatchPrompt(notes) : buildBatchPrompt(notes)
    return {
      model: this.model,
      messages: [
        { role: 'system', content: buildSystemPrompt(sensitivity, customRules) },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      ...(stream ? { stream: true } : {}),
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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(this.buildRequest(notes, sensitivity, options, false)),
      signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`OpenAI API error ${response.status}: ${body.slice(0, 200)}`)
    }

    const text = await response.text()
    let data: any
    try { data = JSON.parse(text) } catch {
      throw new Error(`OpenAI returned non-JSON: ${text.slice(0, 100)}`)
    }
    const content: string = data.choices?.[0]?.message?.content ?? ''

    if (!content) {
      throw new Error('OpenAI returned empty content')
    }

    return parseLineResponse(content, notes)
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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(this.buildRequest(notes, sensitivity, options, true)),
      signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`OpenAI API error ${response.status}: ${body.slice(0, 200)}`)
    }

    if (!response.body) {
      throw new Error('OpenAI streaming response has no body')
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
          if (payload === '[DONE]') break

          try {
            const json = JSON.parse(payload)
            const delta = json.choices?.[0]?.delta?.content ?? ''
            if (!delta) continue

            contentBuffer += delta

            // Flush complete lines
            while (contentBuffer.includes('\n')) {
              const newlineIdx = contentBuffer.indexOf('\n')
              const completeLine = contentBuffer.slice(0, newlineIdx)
              contentBuffer = contentBuffer.slice(newlineIdx + 1)

              const result = parseSingleLine(completeLine, notes)
              if (result && !emitted.has(result.noteId)) {
                emitted.set(result.noteId, result)
                onResult(result)
              }
            }
          } catch { /* skip malformed SSE chunk */ }
        }
      }

      // Handle last line without trailing newline
      if (contentBuffer.trim()) {
        const result = parseSingleLine(contentBuffer.trim(), notes)
        if (result && !emitted.has(result.noteId)) {
          emitted.set(result.noteId, result)
          onResult(result)
        }
      }
    } finally {
      reader.releaseLock()
    }

    // Return all results, with fallback for any notes not covered
    return notes.map(n => emitted.get(n.noteId) ?? fallbackResult(n.noteId))
  }
}
