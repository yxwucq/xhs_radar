import type { AnalysisResult, LowQualityTag } from '@/shared/types'
import type { NoteInput } from '@/shared/messaging'

/** Raw LLM response item before validation */
interface RawResultItem {
  index: number
  score: number
  is_low_quality: boolean
  tags: string[]
  reason: string
}

/** Interface all LLM providers must implement */
export interface LLMProvider {
  /** Analyze a batch of notes and return quality assessments */
  analyze(
    notes: NoteInput[],
    sensitivity: number,
    signal?: AbortSignal
  ): Promise<AnalysisResult[]>
}

const VALID_TAGS = new Set<string>([
  'anxiety', 'clickbait', 'misinformation', 'hidden_ad', 'emotional_manipulation',
])

/**
 * Parse and validate the LLM JSON response into AnalysisResult[].
 * Handles common LLM response quirks (markdown fences, trailing commas, etc).
 */
export function parseAnalysisResponse(
  raw: string,
  notes: NoteInput[]
): AnalysisResult[] {
  // Extract JSON from LLM response — strip markdown fences, find array
  let cleaned = raw.trim()
  // Strip markdown code fences (any number of backticks)
  cleaned = cleaned.replace(/^`{3,}\w*\s*/, '').replace(/\s*`{3,}\s*$/, '')
  // Extract the JSON array substring as a last resort
  const arrStart = cleaned.indexOf('[')
  const arrEnd = cleaned.lastIndexOf(']')
  if (arrStart !== -1 && arrEnd > arrStart) {
    cleaned = cleaned.slice(arrStart, arrEnd + 1)
  }

  let parsed: RawResultItem[]
  try {
    const value = JSON.parse(cleaned)
    parsed = Array.isArray(value) ? value : [value]
  } catch {
    console.log('[XHS Radar] Failed to parse LLM response:', raw.slice(0, 200))
    return notes.map(n => fallbackResult(n.noteId))
  }

  return notes.map((note, i) => {
    const item = parsed.find(r => r.index === i + 1) ?? parsed[i]
    if (!item || typeof item.score !== 'number') {
      return fallbackResult(note.noteId)
    }

    const score = Math.max(0, Math.min(100, Math.round(item.score)))
    const tags = (item.tags ?? []).filter(t => VALID_TAGS.has(t)) as LowQualityTag[]

    return {
      noteId: note.noteId,
      score,
      isLowQuality: score < 40,
      tags,
      reason: typeof item.reason === 'string' ? item.reason.slice(0, 30) : '',
    }
  })
}

/** Fallback result when parsing fails for a specific note */
function fallbackResult(noteId: string): AnalysisResult {
  return {
    noteId,
    score: 75,
    isLowQuality: false,
    tags: [],
    reason: '分析失败，默认放行',
  }
}
