import type { AnalysisResult } from '@/shared/types'
import type { NoteInput } from '@/shared/messaging'
import { DEFAULT_API_URLS } from '@/shared/constants'
import { buildSystemPrompt, buildBatchPrompt, buildLiteBatchPrompt } from '@/shared/prompt'
import type { LLMProvider, AnalyzeOptions } from './base'
import { parseLineResponse } from './base'

export class AnthropicProvider implements LLMProvider {
  private baseUrl: string

  constructor(
    private apiKey: string,
    private model: string = 'claude-sonnet-4-20250514',
    customBaseUrl?: string
  ) {
    this.baseUrl = customBaseUrl || DEFAULT_API_URLS.anthropic
  }

  async analyze(
    notes: NoteInput[],
    sensitivity: number,
    signal?: AbortSignal,
    options: AnalyzeOptions = {}
  ): Promise<AnalysisResult[]> {
    const { mode = 'detailed', customRules = [] } = options
    const userPrompt = mode === 'lite' ? buildLiteBatchPrompt(notes) : buildBatchPrompt(notes)

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        system: buildSystemPrompt(sensitivity, customRules),
        messages: [
          { role: 'user', content: userPrompt },
        ],
      }),
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

    return parseLineResponse(content, notes)
  }
}
