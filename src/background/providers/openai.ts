import type { AnalysisResult } from '@/shared/types'
import type { NoteInput } from '@/shared/messaging'
import { DEFAULT_API_URLS } from '@/shared/constants'
import { buildSystemPrompt, buildBatchPrompt, buildLiteBatchPrompt } from '@/shared/prompt'
import type { LLMProvider } from './base'
import { parseLineResponse } from './base'

export class OpenAIProvider implements LLMProvider {
  private baseUrl: string

  constructor(
    private apiKey: string,
    private model: string = 'gpt-4o-mini',
    customBaseUrl?: string
  ) {
    this.baseUrl = customBaseUrl || DEFAULT_API_URLS.openai
  }

  async analyze(
    notes: NoteInput[],
    sensitivity: number,
    signal?: AbortSignal,
    mode: 'detailed' | 'lite' = 'detailed'
  ): Promise<AnalysisResult[]> {
    const userPrompt = mode === 'lite' ? buildLiteBatchPrompt(notes) : buildBatchPrompt(notes)

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: buildSystemPrompt(sensitivity) },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
      }),
      signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`OpenAI API error ${response.status}: ${body.slice(0, 200)}`)
    }

    const data = await response.json()
    const content: string = data.choices?.[0]?.message?.content ?? ''

    if (!content) {
      throw new Error('OpenAI returned empty content')
    }

    return parseLineResponse(content, notes)
  }
}
