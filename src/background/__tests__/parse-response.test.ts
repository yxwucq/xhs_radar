import { describe, it, expect } from 'vitest'
import { parseLineResponse, parseSingleLine } from '../providers/base'
import type { NoteInput } from '@/shared/messaging'

const notes: NoteInput[] = [
  { noteId: 'aaa', title: 'Test 1', content: '', author: 'A', likeCount: '10' },
  { noteId: 'bbb', title: 'Test 2', content: '', author: 'B', likeCount: '20' },
  { noteId: 'ccc', title: 'Test 3', content: '', author: 'C', likeCount: '30' },
]

describe('parseLineResponse', () => {
  it('parses detailed format: OK and LOW with tag + reason', () => {
    const raw = '1:OK\n2:LOW clickbait 标题夸张诱导\n3:OK'
    const results = parseLineResponse(raw, notes)

    expect(results).toHaveLength(3)
    expect(results[0]).toMatchObject({ noteId: 'aaa', isLowQuality: false, score: 80 })
    expect(results[1]).toMatchObject({ noteId: 'bbb', isLowQuality: true, score: 20, tags: ['clickbait'], reason: '标题夸张诱导' })
    expect(results[2]).toMatchObject({ noteId: 'ccc', isLowQuality: false, score: 80 })
  })

  it('parses lite format: OK and LOW without extras', () => {
    const raw = '1:LOW\n2:OK\n3:LOW'
    const results = parseLineResponse(raw, notes)

    expect(results[0].isLowQuality).toBe(true)
    expect(results[0].tags).toEqual([])
    expect(results[1].isLowQuality).toBe(false)
    expect(results[2].isLowQuality).toBe(true)
  })

  it('handles Chinese colon separator', () => {
    const raw = '1：OK\n2：LOW anxiety 贩卖焦虑\n3：OK'
    const results = parseLineResponse(raw, notes)

    expect(results[1].isLowQuality).toBe(true)
    expect(results[1].tags).toEqual(['anxiety'])
  })

  it('is case-insensitive for LOW/OK', () => {
    const raw = '1:ok\n2:low clickbait test\n3:Ok'
    const results = parseLineResponse(raw, notes)

    expect(results[0].isLowQuality).toBe(false)
    expect(results[1].isLowQuality).toBe(true)
    expect(results[2].isLowQuality).toBe(false)
  })

  it('filters out invalid tags', () => {
    const raw = '1:LOW invalid_tag 某种理由\n2:OK\n3:OK'
    const results = parseLineResponse(raw, notes)

    expect(results[0].isLowQuality).toBe(true)
    expect(results[0].tags).toEqual([]) // invalid tag filtered out
    expect(results[0].reason).toBe('某种理由')
  })

  it('returns fallback for missing lines', () => {
    const raw = '1:OK\n3:LOW clickbait 标题党'
    // note 2 (index 2) is missing from response
    const results = parseLineResponse(raw, notes)

    expect(results[0].isLowQuality).toBe(false)
    expect(results[1].score).toBe(75) // fallback
    expect(results[2].isLowQuality).toBe(true)
  })

  it('returns fallback for completely unparseable response', () => {
    const results = parseLineResponse('random garbage output', notes)
    expect(results).toHaveLength(3)
    results.forEach(r => {
      expect(r.score).toBe(75)
      expect(r.isLowQuality).toBe(false)
    })
  })

  it('truncates reason to 30 characters', () => {
    const raw = `1:LOW clickbait ${'很长的理由'.repeat(10)}\n2:OK\n3:OK`
    const results = parseLineResponse(raw, notes)
    expect(results[0].reason.length).toBeLessThanOrEqual(30)
  })

  it('handles extra whitespace in lines', () => {
    const raw = '  1 : OK  \n  2 :LOW  clickbait   标题党  \n3:OK'
    const results = parseLineResponse(raw, notes)
    expect(results[0].isLowQuality).toBe(false)
    expect(results[1].isLowQuality).toBe(true)
    expect(results[1].tags).toEqual(['clickbait'])
  })
})

describe('parseSingleLine', () => {
  it('parses OK line', () => {
    const result = parseSingleLine('1:OK', notes)
    expect(result).toMatchObject({ noteId: 'aaa', isLowQuality: false, score: 80 })
  })

  it('parses LOW line with tag and reason', () => {
    const result = parseSingleLine('2:LOW anxiety 贩卖焦虑', notes)
    expect(result).toMatchObject({ noteId: 'bbb', isLowQuality: true, score: 20, tags: ['anxiety'] })
    expect(result?.reason).toBe('贩卖焦虑')
  })

  it('returns null for invalid line', () => {
    expect(parseSingleLine('garbage', notes)).toBeNull()
    expect(parseSingleLine('', notes)).toBeNull()
  })

  it('returns null for out-of-range index', () => {
    expect(parseSingleLine('99:OK', notes)).toBeNull()
  })

  it('handles Chinese colon', () => {
    const result = parseSingleLine('1：LOW clickbait 诱导', notes)
    expect(result?.isLowQuality).toBe(true)
  })
})
