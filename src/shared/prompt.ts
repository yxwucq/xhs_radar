import type { NoteInput } from './messaging'

/**
 * Build the system prompt for LLM content quality analysis.
 * Sensitivity maps to how strict the judgment is (0=lenient, 100=strict).
 */
export function buildSystemPrompt(sensitivity: number): string {
  const threshold = sensitivity <= 30 ? '非常明显' : sensitivity <= 70 ? '较为明显' : '轻微疑似'

  return `你是一个社交媒体内容质量评估助手。请分析小红书笔记标题，判断其是否属于低质内容。

低质内容类型定义：
1. anxiety（焦虑诱导）: 利用年龄焦虑、容貌焦虑、财富焦虑、育儿焦虑等情绪吸引点击
2. clickbait（标题党）: 标题夸张、使用"震惊""必看""不看后悔"等诱导词、悬念式标题
3. misinformation（虚假信息）: 伪科学、未经证实的医疗/健康建议、编造的故事
4. hidden_ad（软广伪装）: 伪装成真实分享的广告内容、虚假种草、品牌植入
5. emotional_manipulation（情绪操控）: 刻意煽动对立、制造矛盾、贩卖负面情绪

判定标准：当内容存在${threshold}的低质特征时判定为低质内容。

注意：
- 仅根据标题文字进行判断，不要猜测标题之外的内容
- 正常的知识分享、生活记录、经验讨论不应被判定为低质
- 返回严格的 JSON 格式，不要添加任何额外文字`
}

/**
 * Build the user prompt for a batch of notes.
 * Returns a prompt asking the LLM to analyze multiple notes at once.
 */
export function buildBatchPrompt(notes: NoteInput[]): string {
  const notesList = notes.map((note, i) => {
    let entry = `[${i + 1}] 标题：${note.title}`
    if (note.author) entry += `\n    作者：${note.author}`
    if (note.content) entry += `\n    内容：${note.content}`
    return entry
  }).join('\n\n')

  return `请分析以下 ${notes.length} 条小红书笔记，对每条返回质量评估。

${notesList}

请以 JSON 数组格式返回，每个元素对应一条笔记：
[
  {
    "index": 1,
    "score": 0-100,
    "is_low_quality": true/false,
    "tags": [],
    "reason": "一句话中文理由（不超过20字）"
  }
]

字段说明：
- index: 笔记序号
- score: 内容质量分（100=最优质，0=最低质）
- is_low_quality: score<40 时为 true
- tags: 命中的低质类型标签数组，可选值：anxiety, clickbait, misinformation, hidden_ad, emotional_manipulation
- reason: 一句话中文解释判定理由`
}
