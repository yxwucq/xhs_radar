import type { AnalysisResult, LowQualityTag, CustomRule } from '@/shared/types'
import type { NoteInput } from '@/shared/messaging'

/**
 * Analyze notes by matching titles against built-in + custom keyword rules.
 * Pure synchronous — no API calls.
 */
export function analyzeByKeywords(
  notes: NoteInput[],
  keywordRules: Record<LowQualityTag, string[]>,
  enabledTags: LowQualityTag[],
  customRules: CustomRule[] = []
): AnalysisResult[] {
  // Build lookup: lowercase keyword → label (tag name or custom rule name)
  const keywordMap = new Map<string, { tag?: LowQualityTag; label: string }>()

  // Built-in rules
  for (const tag of enabledTags) {
    for (const kw of keywordRules[tag] ?? []) {
      keywordMap.set(kw.toLowerCase(), { tag, label: kw })
    }
  }

  // Custom rules
  for (const rule of customRules) {
    if (!rule.enabled) continue
    for (const kw of rule.keywords) {
      keywordMap.set(kw.toLowerCase(), { label: kw })
    }
  }

  return notes.map(note => {
    const title = note.title.toLowerCase()
    const matchedTags = new Set<LowQualityTag>()
    let firstMatch = ''
    let customMatch = ''

    for (const [kw, info] of keywordMap) {
      if (title.includes(kw)) {
        if (info.tag) matchedTags.add(info.tag)
        if (!firstMatch) firstMatch = info.label
        if (!info.tag && !customMatch) customMatch = info.label
      }
    }

    const hasMatch = matchedTags.size > 0 || customMatch

    if (!hasMatch) {
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
      tags: [...matchedTags],
      reason: `关键词: ${firstMatch || customMatch}`,
    }
  })
}
