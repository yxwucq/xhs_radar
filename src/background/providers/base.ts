import type { AnalysisResult, LowQualityTag, CustomRule } from '@/shared/types'
import type { NoteInput } from '@/shared/messaging'

/** Options passed to LLM analysis */
export interface AnalyzeOptions {
  mode?: 'detailed' | 'lite'
  customRules?: CustomRule[]
  promptHint?: string
  /**
   * When true, OpenAI-compatible providers inject {thinking:{type:"disabled"}}
   * into the request body. Recognized by Kimi K2.6 / DeepSeek V4 etc.
   */
  disableReasoning?: boolean
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
 * Score-based format:
 *   "1:85"                              →  score=85, normal
 *   "2:15 clickbait 标题夸张"            →  score=15, low quality
 *
 * Legacy OK/LOW format (still supported for backwards compat):
 *   "1:OK"                              →  score=80
 *   "2:LOW clickbait 标题夸张"           →  score=20
 */
export function parseSingleLine(
  line: string,
  notes: NoteInput[],
  sensitivity: number = 50
): AnalysisResult | null {
  // Try score-based format: "序号:分数 [类型 理由]"
  const scoreMatch = line.match(/(\d+)\s*[:：]\s*(\d+)(?:\s+(\S+))?(?:\s+(.+))?/)
  if (scoreMatch) {
    const index = parseInt(scoreMatch[1])
    const note = notes[index - 1]
    if (!note) return null

    const score = Math.max(0, Math.min(100, parseInt(scoreMatch[2])))
    const threshold = sensitivity
    const isLowQuality = score < threshold

    const tagStr = scoreMatch[3] ?? ''
    const tags: LowQualityTag[] = VALID_TAGS.has(tagStr)
      ? [tagStr as LowQualityTag]
      : []

    return {
      noteId: note.noteId,
      score,
      isLowQuality,
      tags,
      reason: (scoreMatch[4]?.trim() ?? '').slice(0, 30),
    }
  }

  // Legacy OK/LOW format
  const legacyMatch = line.match(/(\d+)\s*[:：]\s*(LOW|OK)(?:\s+(\S+))?(?:\s+(.+))?/i)
  if (!legacyMatch) return null

  const index = parseInt(legacyMatch[1])
  const note = notes[index - 1]
  if (!note) return null

  const isLow = legacyMatch[2].toUpperCase() === 'LOW'
  const tagStr = legacyMatch[3] ?? ''
  const tags: LowQualityTag[] = isLow && VALID_TAGS.has(tagStr)
    ? [tagStr as LowQualityTag]
    : []

  return {
    noteId: note.noteId,
    score: isLow ? 20 : 80,
    isLowQuality: isLow,
    tags,
    reason: isLow ? (legacyMatch[4]?.trim() ?? '').slice(0, 30) : '',
  }
}

/**
 * Parse full line-based LLM response into AnalysisResult[].
 * Uses parseSingleLine internally.
 */
export function parseLineResponse(
  raw: string,
  notes: NoteInput[],
  sensitivity: number = 50
): AnalysisResult[] {
  const lines = raw.trim().split('\n')
  const parsed = new Map<string, AnalysisResult>()

  for (const line of lines) {
    const result = parseSingleLine(line, notes, sensitivity)
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
