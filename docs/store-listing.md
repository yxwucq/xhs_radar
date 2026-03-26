# Chrome Web Store 上架信息

> 提交时复制粘贴到 Chrome Web Store Developer Console 对应字段。

---

## 扩展名称

```
XHS Content Radar - 小红书内容质量雷达
```

## 简短描述（132 字符以内）

```
用 AI 识别小红书信息流中的标题党、软广、焦虑营销等低质量内容，支持模糊或隐藏，净化你的浏览体验。
```

## 详细描述

```
XHS Content Radar 是一款小红书内容质量守护工具，帮助你在浏览小红书时自动识别和过滤低质量内容。

主要功能：
• AI 智能分析 — 利用大语言模型识别标题党、焦虑诱导、虚假信息、软广伪装、情绪操控等低质内容
• 两种过滤模式 — 模糊模式（高斯模糊 + 点击可查看）或隐藏模式（直接移除）
• 关键词预筛 — 内置常见低质内容关键词库，命中即标记，无需调用 API
• 自定义规则 — 创建你自己的过滤规则和关键词
• 灵敏度调节 — 从宽松到严格，按你的偏好调整过滤力度
• 实时统计 — 查看扫描数、标记数、缓存命中、API 调用等数据
• 隐私优先 — 所有配置和缓存存储在本地，API Key 由你自行管理

使用方式：
1. 安装扩展后打开设置页面
2. 填入你的 AI API 配置（支持 OpenAI 兼容接口和 Anthropic）
3. 打开小红书，扩展会自动分析信息流中的笔记卡片
4. 通过弹窗面板随时开关或切换过滤模式

注意：本扩展需要你提供自己的 AI API Key 才能使用 AI 分析功能。关键词过滤功能无需 API Key。

如有问题或建议，欢迎在 GitHub 仓库提交 Issue。
```

## English Description (optional, for international visibility)

```
XHS Content Radar helps you identify and filter low-quality content on Xiaohongshu (Little Red Book).

Features:
• AI-powered analysis — Detect clickbait, anxiety-inducing, misleading, hidden ads, and emotionally manipulative content
• Two filter modes — Blur (with click-to-reveal) or Vanish (hide completely)
• Keyword pre-filter — Built-in keyword matching for instant detection without API calls
• Custom rules — Create your own filter rules and keywords
• Adjustable sensitivity — Fine-tune from lenient to strict
• Privacy-first — All data stored locally, you manage your own API key

Note: Requires your own AI API key (OpenAI-compatible or Anthropic) for AI analysis. Keyword filtering works without an API key.
```

---

## 商店分类

- 主分类：`Productivity` (生产力工具)
- 语言：`Chinese (Simplified)`, `English`

## 隐私政策 URL

```
https://<your-github-username>.github.io/xhs-content-radar/privacy-policy.html
```

> 将 `docs/privacy-policy.html` 部署到 GitHub Pages 后填入实际 URL。

## 截图要求

需要自行截取，建议准备以下截图（1280x800 或 640x400）：

1. **小红书信息流 + 模糊效果** — 展示 Blur 模式下笔记卡片被模糊的效果
2. **Popup 弹窗** — 展示开关、模式切换、统计数据
3. **设置页面** — 展示 API 配置、过滤规则、自定义规则
4. **隐藏模式效果** — 展示 Vanish 模式下低质内容被移除后的干净信息流
