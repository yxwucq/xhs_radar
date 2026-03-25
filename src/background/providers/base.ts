import type { AnalysisResult, LowQualityTag, CustomRule } from '@/shared/types'
import type { NoteInput } from '@/shared/messaging'

/** Options passed to LLM analysis */
export interface AnalyzeOptions {
  mode?: 'detailed' | 'lite'
  customRules?: CustomRule[]
}

/** Callback for streaming — called once per parsed result */
export type OnPartialResult = (result: AnalysisResult) => void

/** Interface all LLM providers must implement */
export interface LLMProvider {
  /** Non-streaming analysis — returns all results at once */
  analyze(
    notes: NoteInput[],
    sensitivity: number,
    signal?: AbortSignal,
    options?: AnalyzeOptions
  ): Promise<AnalysisResult[]>

  /** Optional streaming analysis — calls onResult per parsed line, returns all at end */
  analyzeStream?(
    notes: NoteInput[],
    sensitivity: number,
    signal: AbortSignal,
    options: AnalyzeOptions,
    onResult: OnPartialResult
  ): Promise<AnalysisResult[]>
}

const VALID_TAGS = new Set<string>([
  'anxiety', 'clickbait', 'misinformation', 'hidden_ad', 'emotional_manipulation',
])

/**
 * Parse a single line from LLM response into an AnalysisResult.
 * Returns null if the line doesn't match the expected format.
 *
 *   "1:OK"  →  { noteId, score: 80, isLowQuality: false, ... }
 *   "2:LOW clickbait 标题夸张"  →  { noteId, score: 20, isLowQuality: true, tags: ['clickbait'], ... }
 */
export function parseSingleLine(
  line: string,
  notes: NoteInput[]
): AnalysisResult | null {
  const match = line.match(/(\d+)\s*[:：]\s*(LOW|OK)(?:\s+(\S+))?(?:\s+(.+))?/i)
  if (!match) return null

  const index = parseInt(match[1])
  const note = notes[index - 1]
  if (!note) return null

  const isLow = match[2].toUpperCase() === 'LOW'

  if (!isLow) {
    return {
      noteId: note.noteId,
      score: 80,
      isLowQuality: false,
      tags: [],
      reason: '',
    }
  }

  const tagStr = match[3] ?? ''
  const tags: LowQualityTag[] = VALID_TAGS.has(tagStr)
    ? [tagStr as LowQualityTag]
    : []

  return {
    noteId: note.noteId,
    score: 20,
    isLowQuality: true,
    tags,
    reason: (match[4]?.trim() ?? '').slice(0, 30),
  }
}

/**
 * Parse full line-based LLM response into AnalysisResult[].
 * Uses parseSingleLine internally.
 */
export function parseLineResponse(
  raw: string,
  notes: NoteInput[]
): AnalysisResult[] {
  const lines = raw.trim().split('\n')
  const parsed = new Map<string, AnalysisResult>()

  for (const line of lines) {
    const result = parseSingleLine(line, notes)
    if (result) parsed.set(result.noteId, result)
  }

  return notes.map(note => parsed.get(note.noteId) ?? fallbackResult(note.noteId))
}

/** Fallback result when parsing fails for a specific note */
export function fallbackResult(noteId: string): AnalysisResult {
  return {
    noteId,
    score: 75,
    isLowQuality: false,
    tags: [],
    reason: '',
  }
}
