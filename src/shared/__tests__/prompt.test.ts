import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, buildBatchPrompt } from '../prompt'
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
    expect(prompt).toContain('anxiety')
    expect(prompt).toContain('clickbait')
    expect(prompt).toContain('misinformation')
    expect(prompt).toContain('hidden_ad')
    expect(prompt).toContain('emotional_manipulation')
  })
})

describe('buildBatchPrompt', () => {
  it('includes all note titles with numbered indices', () => {
    const prompt = buildBatchPrompt(sampleNotes)
    expect(prompt).toContain('[1] 标题：震惊！这个方法让你一夜暴富')
    expect(prompt).toContain('[2] 标题：周末去了趟京都，分享一些照片')
  })

  it('includes author names', () => {
    const prompt = buildBatchPrompt(sampleNotes)
    expect(prompt).toContain('作者：营销号')
    expect(prompt).toContain('作者：旅行者')
  })

  it('includes the note count', () => {
    const prompt = buildBatchPrompt(sampleNotes)
    expect(prompt).toContain('2 条小红书笔记')
  })

  it('requests JSON array format', () => {
    const prompt = buildBatchPrompt(sampleNotes)
    expect(prompt).toContain('"index"')
    expect(prompt).toContain('"score"')
    expect(prompt).toContain('"tags"')
  })
})
