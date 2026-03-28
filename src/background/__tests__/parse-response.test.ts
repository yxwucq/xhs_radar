import { describe, it, expect } from 'vitest'
import { parseLineResponse, parseSingleLine } from '../providers/base'
import type { NoteInput } from '@/shared/messaging'

const notes: NoteInput[] = [
  { noteId: 'aaa', title: 'Test 1', content: '', author: 'A', likeCount: '10' },
  { noteId: 'bbb', title: 'Test 2', content: '', author: 'B', likeCount: '20' },
  { noteId: 'ccc', title: 'Test 3', content: '', author: 'C', likeCount: '30' },
]

describe('parseLineResponse (score-based format)', () => {
  it('parses score-based format with tags and reason', () => {
    const raw = '1:85\n2:15 clickbait 标题夸张诱导\n3:70'
    const results = parseLineResponse(raw, notes, 50)

    expect(results).toHaveLength(3)
    expect(results[0]).toMatchObject({ noteId: 'aaa', score: 85, isLowQuality: false })
    expect(results[1]).toMatchObject({ noteId: 'bbb', score: 15, isLowQuality: true, tags: ['clickbait'], reason: '标题夸张诱导' })
    expect(results[2]).toMatchObject({ noteId: 'ccc', score: 70, isLowQuality: false })
  })

  it('uses sensitivity as threshold for isLowQuality', () => {
    const raw = '1:45\n2:55\n3:30'

    const strict = parseLineResponse(raw, notes, 60)
    expect(strict[0].isLowQuality).toBe(true)  // 45 < 60
    expect(strict[1].isLowQuality).toBe(true)  // 55 < 60
    expect(strict[2].isLowQuality).toBe(true)  // 30 < 60

    const relaxed = parseLineResponse(raw, notes, 40)
    expect(relaxed[0].isLowQuality).toBe(false) // 45 >= 40
    expect(relaxed[1].isLowQuality).toBe(false) // 55 >= 40
    expect(relaxed[2].isLowQuality).toBe(true)  // 30 < 40
  })

  it('clamps scores above 100 to 100', () => {
    const raw = '1:150\n2:0\n3:50'
    const results = parseLineResponse(raw, notes, 50)

    expect(results[0].score).toBe(100)
    expect(results[1].score).toBe(0)
    expect(results[2].score).toBe(50)
  })

  it('handles Chinese colon separator', () => {
    const raw = '1：85\n2：20 anxiety 贩卖焦虑\n3：70'
    const results = parseLineResponse(raw, notes, 50)

    expect(results[1].isLowQuality).toBe(true)
    expect(results[1].tags).toEqual(['anxiety'])
  })

  it('high score without tags has empty tags and reason', () => {
    const raw = '1:90\n2:80\n3:75'
    const results = parseLineResponse(raw, notes, 50)

    results.forEach(r => {
      expect(r.isLowQuality).toBe(false)
      expect(r.tags).toEqual([])
    })
  })

  it('filters out invalid tags', () => {
    const raw = '1:20 invalid_tag 某种理由\n2:80\n3:80'
    const results = parseLineResponse(raw, notes, 50)

    expect(results[0].isLowQuality).toBe(true)
    expect(results[0].tags).toEqual([]) // invalid tag filtered out
    expect(results[0].reason).toBe('某种理由')
  })

  it('returns fallback for missing lines', () => {
    const raw = '1:85\n3:20 clickbait 标题党'
    const results = parseLineResponse(raw, notes, 50)

    expect(results[0].isLowQuality).toBe(false)
    expect(results[1].score).toBe(75) // fallback
    expect(results[2].isLowQuality).toBe(true)
  })

  it('returns fallback for completely unparseable response', () => {
    const results = parseLineResponse('random garbage output', notes, 50)
    expect(results).toHaveLength(3)
    results.forEach(r => {
      expect(r.score).toBe(75)
      expect(r.isLowQuality).toBe(false)
    })
  })

  it('truncates reason to 30 characters', () => {
    const raw = `1:10 clickbait ${'很长的理由'.repeat(10)}\n2:80\n3:80`
    const results = parseLineResponse(raw, notes, 50)
    expect(results[0].reason.length).toBeLessThanOrEqual(30)
  })

  it('handles extra whitespace in lines', () => {
    const raw = '  1 : 85  \n  2 :15  clickbait   标题党  \n3:70'
    const results = parseLineResponse(raw, notes, 50)
    expect(results[0].isLowQuality).toBe(false)
    expect(results[1].isLowQuality).toBe(true)
    expect(results[1].tags).toEqual(['clickbait'])
  })
})

describe('parseLineResponse (legacy OK/LOW format)', () => {
  it('still parses legacy format', () => {
    const raw = '1:OK\n2:LOW clickbait 标题夸张诱导\n3:OK'
    const results = parseLineResponse(raw, notes, 50)

    expect(results[0]).toMatchObject({ score: 80, isLowQuality: false })
    expect(results[1]).toMatchObject({ score: 20, isLowQuality: true, tags: ['clickbait'] })
    expect(results[2]).toMatchObject({ score: 80, isLowQuality: false })
  })
})

describe('parseSingleLine', () => {
  it('parses score-based OK line', () => {
    const result = parseSingleLine('1:85', notes, 50)
    expect(result).toMatchObject({ noteId: 'aaa', score: 85, isLowQuality: false })
  })

  it('parses score-based LOW line with tag and reason', () => {
    const result = parseSingleLine('2:15 anxiety 贩卖焦虑', notes, 50)
    expect(result).toMatchObject({ noteId: 'bbb', score: 15, isLowQuality: true, tags: ['anxiety'] })
    expect(result?.reason).toBe('贩卖焦虑')
  })

  it('returns null for invalid line', () => {
    expect(parseSingleLine('garbage', notes, 50)).toBeNull()
    expect(parseSingleLine('', notes, 50)).toBeNull()
  })

  it('returns null for out-of-range index', () => {
    expect(parseSingleLine('99:85', notes, 50)).toBeNull()
  })

  it('handles Chinese colon', () => {
    const result = parseSingleLine('1：20 clickbait 诱导', notes, 50)
    expect(result?.isLowQuality).toBe(true)
  })
})
