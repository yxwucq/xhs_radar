import type { NoteInput } from './messaging'
import type { CustomRule } from './types'

/**
 * Shared system prompt — used by both detailed and lite modes.
 * Includes built-in categories + user's custom rule descriptions.
 */
export function buildSystemPrompt(sensitivity: number, customRules: CustomRule[] = []): string {
  const threshold = sensitivity <= 30 ? '非常明显' : sensitivity <= 70 ? '较为明显' : '轻微疑似'

  let prompt = `判断小红书笔记标题是否低质。仅根据标题判断，正常知识分享/生活记录/经验讨论不算低质。
低质类型：clickbait(标题党) anxiety(焦虑诱导) misinformation(虚假信息) hidden_ad(软广) emotional_manipulation(情绪操控)`

  // Append enabled custom rules with descriptions
  const activeCustom = customRules.filter(r => r.enabled && r.description.trim())
  if (activeCustom.length > 0) {
    const customLines = activeCustom.map(r => `${r.name}: ${r.description}`).join('\n')
    prompt += `\n用户自定义过滤规则（同样判LOW）：\n${customLines}`
  }

  prompt += `\n判定标准：${threshold}的低质特征即判LOW。`
  return prompt
}

/**
 * Detailed mode: batch prompt asking for tag + reason on LOW items.
 *
 * Expected output format:
 *   1:OK
 *   2:LOW clickbait 夸张标题诱导点击
 *   3:OK
 */
export function buildBatchPrompt(notes: NoteInput[]): string {
  const list = notes.map((n, i) => {
    let line = `${i + 1}. ${n.title}`
    if (n.author) line += ` | ${n.author}`
    if (n.likeCount) line += ` | ${n.likeCount}赞`
    if (n.content) line += `\n   ${n.content}`
    return line
  }).join('\n')

  return `${list}

每行输出格式：
- 正常：序号:OK
- 低质：序号:LOW 类型 理由(10字内)
示例：1:OK
示例：2:LOW clickbait 标题夸张诱导点击`
}

/**
 * Lite mode: batch prompt asking for only LOW/OK per line.
 *
 * Expected output format:
 *   1:OK
 *   2:LOW
 *   3:OK
 */
export function buildLiteBatchPrompt(notes: NoteInput[]): string {
  const list = notes.map((n, i) => `${i + 1}. ${n.title}`).join('\n')
  return `${list}

每行输出：序号:OK 或 序号:LOW`
}
