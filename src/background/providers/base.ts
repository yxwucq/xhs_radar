import type { AnalysisResult, LowQualityTag } from '@/shared/types'
import type { NoteInput } from '@/shared/messaging'

/** Interface all LLM providers must implement */
export interface LLMProvider {
  /** Analyze a batch of notes and return quality assessments */
  analyze(
    notes: NoteInput[],
    sensitivity: number,
    signal?: AbortSignal,
    mode?: 'detailed' | 'lite'
  ): Promise<AnalysisResult[]>
}

const VALID_TAGS = new Set<string>([
  'anxiety', 'clickbait', 'misinformation', 'hidden_ad', 'emotional_manipulation',
])

/**
 * Parse line-based LLM response into AnalysisResult[].
 *
 * Handles both detailed and lite formats:
 *   Lite:     "1:OK"  or  "2:LOW"
 *   Detailed: "1:OK"  or  "2:LOW clickbait 标题夸张诱导点击"
 */
export function parseLineResponse(
  raw: string,
  notes: NoteInput[]
): AnalysisResult[] {
  const lines = raw.trim().split('\n')
  const parsed = new Map<number, { isLow: boolean; tag: string; reason: string }>()

  for (const line of lines) {
    // Match: "2:LOW clickbait 标题夸张" or "2:LOW" or "1:OK"
    const match = line.match(/(\d+)\s*[:：]\s*(LOW|OK)(?:\s+(\S+))?(?:\s+(.+))?/i)
    if (!match) continue

    const index = parseInt(match[1])
    const isLow = match[2].toUpperCase() === 'LOW'
    const tag = match[3] ?? ''
    const reason = match[4]?.trim() ?? ''
    parsed.set(index, { isLow, tag, reason })
  }

  return notes.map((note, i) => {
    const entry = parsed.get(i + 1)
    if (!entry) return fallbackResult(note.noteId)

    if (!entry.isLow) {
      return {
        noteId: note.noteId,
        score: 80,
        isLowQuality: false,
        tags: [],
        reason: '',
      }
    }

    const tags: LowQualityTag[] = VALID_TAGS.has(entry.tag)
      ? [entry.tag as LowQualityTag]
      : []

    return {
      noteId: note.noteId,
      score: 20,
      isLowQuality: true,
      tags,
      reason: entry.reason.slice(0, 30),
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
    reason: '',
  }
}
