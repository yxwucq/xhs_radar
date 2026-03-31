# Chrome Web Store 上架信息

> 提交时复制粘贴到 Chrome Web Store Developer Console 对应字段。

---

## 扩展名称

```
红薯雷达
```

## 简短描述（132 字符以内）

```
用 AI 识别小红书信息流中的标题党、软广、焦虑营销等低质量内容，支持模糊或隐藏，净化你的浏览体验。
```

## 详细描述

```
红薯雷达是一款小红书内容质量守护工具，帮助你在浏览小红书时自动识别和过滤低质量内容。

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
Hongshu Radar helps you identify and filter low-quality content on Xiaohongshu (Little Red Book).

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
https://yxwucq.github.io/xhs_radar/privacy-policy.html
```

> 请确认 GitHub Pages 已部署 `docs/privacy-policy.html`，且该地址可公开访问。

## 审核说明（可粘贴到审核备注）

```text
This extension only works on xiaohongshu.com and analyzes visible note content to help users filter low-quality posts.

The optional host permission is only used for user-configured AI API endpoints. The extension does not automatically access arbitrary websites. A host permission request is shown only after the user manually enters an API endpoint in settings and explicitly triggers authorization/testing for that endpoint.

Data handling:
- Feed analysis may send note titles, author names, and like counts to the user-configured AI API endpoint.
- When the user actively opens a note detail view, detail analysis may additionally send the note body content shown in that overlay.
- API keys, configuration, cache, and statistics are stored locally in chrome.storage.local.
- No developer-operated server is used.
```

## 权限说明（可粘贴到权限理由）

```text
storage: Stores user settings, analysis cache, and local statistics in the browser.

host_permissions (xiaohongshu.com): Runs the extension only on xiaohongshu.com pages so it can read visible note content and apply blur/hide markers in the feed.

optional_host_permissions: Used only for AI API domains explicitly configured by the user. The extension requests permission for a specific API origin only after a user action in settings.
```

## 数据披露说明（可粘贴到 Privacy practices）

```text
The extension processes website content on xiaohongshu.com to analyze note quality.

It may send the following data to a user-configured third-party AI service:
- note titles
- author names
- like counts
- note body content when the user actively opens a note detail view

The extension stores API settings, cache, and statistics locally in the browser. It does not send data to any developer-operated server.
```

## 截图要求

需要自行截取，建议准备以下截图（1280x800 或 640x400）：

1. **信息流过滤效果** — 展示 Blur 模式下笔记卡片被模糊 + 分数显示的效果
2. **详情分析** — 点开笔记后左上角悬浮分析标签
3. **Popup 弹窗** — 展示开关、模式切换、统计数据
4. **设置页面** — 展示 API 配置、灵敏度调节、自定义规则
5. **统计页面** — 趋势图表，展示过滤效果
