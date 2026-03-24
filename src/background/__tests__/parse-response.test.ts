import { describe, it, expect } from 'vitest'
import { parseAnalysisResponse } from '../providers/base'
import type { NoteInput } from '@/shared/messaging'

const notes: NoteInput[] = [
  { noteId: 'aaa', title: 'Test 1', content: '', author: 'A', likeCount: '10' },
  { noteId: 'bbb', title: 'Test 2', content: '', author: 'B', likeCount: '20' },
]

describe('parseAnalysisResponse', () => {
  it('parses a valid JSON array response', () => {
    const raw = JSON.stringify([
      { index: 1, score: 25, is_low_quality: true, tags: ['clickbait'], reason: '标题党' },
      { index: 2, score: 80, is_low_quality: false, tags: [], reason: '正常内容' },
    ])

    const results = parseAnalysisResponse(raw, notes)
    expect(results).toHaveLength(2)
    expect(results[0].noteId).toBe('aaa')
    expect(results[0].score).toBe(25)
    expect(results[0].isLowQuality).toBe(true)
    expect(results[0].tags).toEqual(['clickbait'])
    expect(results[1].noteId).toBe('bbb')
    expect(results[1].score).toBe(80)
    expect(results[1].isLowQuality).toBe(false)
  })

  it('handles markdown code fence wrapping', () => {
    const raw = '```json\n' + JSON.stringify([
      { index: 1, score: 50, is_low_quality: false, tags: [], reason: 'ok' },
      { index: 2, score: 10, is_low_quality: true, tags: ['anxiety'], reason: '焦虑' },
    ]) + '\n```'

    const results = parseAnalysisResponse(raw, notes)
    expect(results).toHaveLength(2)
    expect(results[0].score).toBe(50)
    expect(results[1].score).toBe(10)
    expect(results[1].tags).toEqual(['anxiety'])
  })

  it('clamps scores to 0-100 range', () => {
    const raw = JSON.stringify([
      { index: 1, score: -10, is_low_quality: true, tags: [], reason: 'x' },
      { index: 2, score: 150, is_low_quality: false, tags: [], reason: 'y' },
    ])

    const results = parseAnalysisResponse(raw, notes)
    expect(results[0].score).toBe(0)
    expect(results[1].score).toBe(100)
  })

  it('filters out invalid tags', () => {
    const raw = JSON.stringify([
      { index: 1, score: 30, is_low_quality: true, tags: ['clickbait', 'invalid_tag', 'anxiety'], reason: 'x' },
      { index: 2, score: 70, is_low_quality: false, tags: [], reason: 'y' },
    ])

    const results = parseAnalysisResponse(raw, notes)
    expect(results[0].tags).toEqual(['clickbait', 'anxiety'])
  })

  it('returns fallback results for unparseable JSON', () => {
    const results = parseAnalysisResponse('not json at all', notes)
    expect(results).toHaveLength(2)
    expect(results[0].score).toBe(75)
    expect(results[0].isLowQuality).toBe(false)
    expect(results[0].reason).toContain('分析失败')
  })

  it('returns fallback for missing items in response', () => {
    const raw = JSON.stringify([
      { index: 1, score: 30, is_low_quality: true, tags: ['clickbait'], reason: '标题党' },
      // index 2 is missing
    ])

    const results = parseAnalysisResponse(raw, notes)
    expect(results[0].score).toBe(30)
    expect(results[1].score).toBe(75) // fallback
    expect(results[1].reason).toContain('分析失败')
  })

  it('truncates reason to 30 characters', () => {
    const raw = JSON.stringify([
      { index: 1, score: 20, is_low_quality: true, tags: [], reason: 'a'.repeat(50) },
      { index: 2, score: 80, is_low_quality: false, tags: [], reason: 'ok' },
    ])

    const results = parseAnalysisResponse(raw, notes)
    expect(results[0].reason.length).toBeLessThanOrEqual(30)
  })

  it('derives isLowQuality from score (not from LLM response)', () => {
    const raw = JSON.stringify([
      { index: 1, score: 39, is_low_quality: false, tags: [], reason: 'LLM said ok but score is low' },
      { index: 2, score: 40, is_low_quality: true, tags: [], reason: 'LLM said bad but score is ok' },
    ])

    const results = parseAnalysisResponse(raw, notes)
    // We derive isLowQuality from score < 40, ignoring LLM's is_low_quality
    expect(results[0].isLowQuality).toBe(true)  // score 39 < 40
    expect(results[1].isLowQuality).toBe(false)  // score 40 >= 40
  })
})
