import type { AnalysisResult, LowQualityTag } from '@/shared/types'
import type { NoteInput } from '@/shared/messaging'

/**
 * Analyze notes by matching titles against keyword list.
 * Pure synchronous function — no API calls.
 */
export function analyzeByKeywords(
  notes: NoteInput[],
  keywords: string[]
): AnalysisResult[] {
  const lowerKeywords = keywords.map(k => k.toLowerCase())

  return notes.map(note => {
    const title = note.title.toLowerCase()
    const matched = lowerKeywords.filter(kw => title.includes(kw))

    if (matched.length === 0) {
      return {
        noteId: note.noteId,
        score: 80,
        isLowQuality: false,
        tags: [] as LowQualityTag[],
        reason: '',
      }
    }

    return {
      noteId: note.noteId,
      score: 20,
      isLowQuality: true,
      tags: ['clickbait'] as LowQualityTag[],
      reason: `关键词: ${matched[0]}`,
    }
  })
}
