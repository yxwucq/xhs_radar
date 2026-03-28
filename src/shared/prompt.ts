import type { NoteInput } from './messaging'
import type { CustomRule } from './types'

/**
 * Shared system prompt — used by both detailed and lite modes.
 * Includes built-in categories + user's custom rule descriptions.
 */
export function buildSystemPrompt(sensitivity: number, customRules: CustomRule[] = []): string {
  const threshold = sensitivity <= 30 ? '非常明显' : sensitivity <= 70 ? '较为明显' : '轻微疑似'

  let prompt = `你是小红书内容质量判断助手。根据标题（和正文，如有提供）判断笔记是否低质。
核心原则：轻松、搞笑、娱乐性质的内容放宽标准，重点过滤真正有害的低质内容。

低质类型及判定标准：
- clickbait(标题党)：故意隐瞒关键信息制造悬念来骗点击。如"千万别这样做，后果太严重了"但不说什么事。
  不算标题党：语气夸张但主题明确("这家店也太好吃了吧！")、搞笑/自嘲式表达、感叹句
- anxiety(焦虑诱导)：刻意制造年龄/财富/容貌焦虑来获取流量。如"25岁还没做到这些就废了"。
  不算焦虑诱导：正常职场/学习经验分享、客观讨论行业现状
- misinformation(虚假信息)：伪科学、未经证实的医疗建议、编造事实。如"每天吃它癌症远离你"。
  不算虚假信息：个人体验分享、标注了"个人观点"的讨论
- hidden_ad(软广)：伪装成真实分享的广告，核心目的是推销产品。
  不算软广：真实使用体验分享（即使提到品牌名）、合集推荐、正常好物分享
- emotional_manipulation(情绪操控)：刻意煽动群体对立或贩卖负面情绪来获取流量。
  不算情绪操控：正常吐槽、搞笑段子、表达个人情绪`

  // Append enabled custom rules with descriptions
  const activeCustom = customRules.filter(r => r.enabled && r.description.trim())
  if (activeCustom.length > 0) {
    const customLines = activeCustom.map(r => `${r.name}: ${r.description}`).join('\n')
    prompt += `\n用户自定义过滤规则（同样判LOW）：\n${customLines}`
  }

  prompt += `\n\n判定标准：${threshold}的低质特征即判LOW。`
  return prompt
}

/**
 * Detailed mode: batch prompt asking for score + tag + reason.
 *
 * Expected output format:
 *   1:85
 *   2:15 clickbait 夸张标题诱导点击
 *   3:70
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

每行输出格式：序号:分数 [类型 理由]
分数0-100，越高越正常。50以下为低质，需附类型和理由(10字内)。
示例：1:85
示例：2:15 clickbait 标题夸张诱导点击
示例：3:40 hidden_ad 疑似推广`
}

/**
 * Lite mode: batch prompt asking for score only.
 *
 * Expected output format:
 *   1:85
 *   2:15
 *   3:70
 */
export function buildLiteBatchPrompt(notes: NoteInput[]): string {
  const list = notes.map((n, i) => `${i + 1}. ${n.title}`).join('\n')
  return `${list}

每行输出：序号:分数
分数0-100，越高越正常。
示例：1:85
示例：2:15`
}