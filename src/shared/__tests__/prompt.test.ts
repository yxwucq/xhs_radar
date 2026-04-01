import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, buildBatchPrompt, buildLiteBatchPrompt } from '../prompt'
import type { NoteInput } from '../messaging'

const sampleNotes: NoteInput[] = [
  { noteId: 'aaa', title: '震惊！这个方法让你一夜暴富', content: '', author: '营销号', likeCount: '999' },
  { noteId: 'bbb', title: '周末去了趟京都，分享一些照片', content: '', author: '旅行者', likeCount: '50' },
]

describe('buildSystemPrompt', () => {
  it('includes sensitivity wording for low sensitivity', () => {
    const prompt = buildSystemPrompt(20)
    expect(prompt).toContain('非常明显')
  })

  it('includes sensitivity wording for medium sensitivity', () => {
    const prompt = buildSystemPrompt(50)
    expect(prompt).toContain('较为明显')
  })

  it('includes sensitivity wording for high sensitivity', () => {
    const prompt = buildSystemPrompt(80)
    expect(prompt).toContain('轻微疑似')
  })

  it('includes all 5 low-quality categories', () => {
    const prompt = buildSystemPrompt(50)
    expect(prompt).toContain('clickbait')
    expect(prompt).toContain('anxiety')
    expect(prompt).toContain('misinformation')
    expect(prompt).toContain('hidden_ad')
    expect(prompt).toContain('emotional_manipulation')
  })

  it('includes boundary guidance to reduce false positives', () => {
    const prompt = buildSystemPrompt(50)
    expect(prompt).toContain('不算标题党')
    expect(prompt).toContain('放宽标准')
  })

  it('includes scenario prompt hint when provided', () => {
    const prompt = buildSystemPrompt(50, [], '优先过滤分散注意力的内容')
    expect(prompt).toContain('当前情景补充原则')
    expect(prompt).toContain('优先过滤分散注意力的内容')
  })
})

describe('buildBatchPrompt (detailed)', () => {
  it('includes numbered titles', () => {
    const prompt = buildBatchPrompt(sampleNotes)
    expect(prompt).toContain('1. 震惊！这个方法让你一夜暴富')
    expect(prompt).toContain('2. 周末去了趟京都，分享一些照片')
  })

  it('requests score-based format with tag and reason', () => {
    const prompt = buildBatchPrompt(sampleNotes)
    expect(prompt).toContain('序号:分数')
    expect(prompt).toContain('0-100')
  })
})

describe('buildLiteBatchPrompt', () => {
  it('includes numbered titles', () => {
    const prompt = buildLiteBatchPrompt(sampleNotes)
    expect(prompt).toContain('1. 震惊！这个方法让你一夜暴富')
    expect(prompt).toContain('2. 周末去了趟京都，分享一些照片')
  })

  it('requests score-only format', () => {
    const prompt = buildLiteBatchPrompt(sampleNotes)
    expect(prompt).toContain('序号:分数')
    expect(prompt).toContain('0-100')
    // Should NOT ask for tags or reason
    expect(prompt).not.toContain('类型')
    expect(prompt).not.toContain('理由')
  })

  it('is shorter than detailed prompt', () => {
    const detailed = buildBatchPrompt(sampleNotes)
    const lite = buildLiteBatchPrompt(sampleNotes)
    expect(lite.length).toBeLessThan(detailed.length)
  })
})
