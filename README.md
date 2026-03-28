# XHS Content Radar

小红书内容质量雷达 — 用 AI 识别信息流中的低质量内容，净化你的浏览体验。

## 功能

- **AI 内容分析** — 接入大语言模型（OpenAI / Anthropic 兼容），自动识别标题党、焦虑诱导、虚假信息、软广伪装、情绪操控
- **质量评分** — LLM 对每条笔记输出 0-100 质量分数，卡片上直接显示，灵敏度设置作为过滤阈值
- **详情深度分析** — 点击笔记卡片后自动提取正文内容，结合标题+正文做二次分析，提升软广和虚假信息识别率
- **两种过滤模式** — 模糊模式（高斯模糊 + 点击查看）/ 隐藏模式（直接移除）
- **关键词预筛** — 内置关键词库，命中即标记，无需 API 调用
- **自定义规则** — 创建自己的过滤规则和关键词
- **灵敏度调节** — 从宽松到严格，按偏好调整
- **隐私优先** — 配置和缓存全部存储在本地，API Key 由用户自行管理

## 技术栈

- Chrome Extension (Manifest V3)
- React 18 + TypeScript (Strict)
- Tailwind CSS
- Vite + CRXJS

## 架构

```
┌─────────────────────────────────────────────┐
│              Chrome Extension               │
│                                             │
│  Popup UI ──┐                               │
│  Options UI ─┼── chrome.runtime.sendMessage  │
│  Content Script ┘         │                 │
│                    Background SW             │
│                    ├── LLM Gateway           │
│                    ├── Cache (LRU, 24h TTL)  │
│                    └── Keyword Analyzer      │
└──────────────────────┬──────────────────────┘
                       │ HTTPS
              OpenAI / Anthropic API
```

**信息流分析：** DOM 变更 → MutationObserver → 提取笔记数据 → 关键词预筛 → 缓存查询 → LLM 批量分析（标题）→ 评分 + 渲染标记

**详情深度分析：** 用户点击卡片 → 检测详情弹窗 → 提取标题 + 正文 → LLM 单条分析 → 悬浮标签 + 回溯标记信息流卡片

## 开发

```bash
# 安装依赖
npm install

# 开发模式（支持 HMR）
npm run dev

# 构建生产包
npm run build

# 运行测试
npm test
```

### 加载扩展

1. `npm run build` 生成 `dist/` 目录
2. Chrome 打开 `chrome://extensions/`，启用"开发者模式"
3. 点击"加载已解压的扩展程序"，选择 `dist/` 目录

## 使用

1. 安装扩展后打开设置页面
2. 选择 API 协议（OpenAI Compatible / Anthropic），填入 API Key
3. 打开小红书，扩展自动分析信息流中的笔记卡片
4. 通过弹窗面板开关或切换过滤模式

> 关键词过滤无需 API Key 即可使用。AI 分析功能需要提供自己的 API Key。

## 项目结构

```
src/
├── background/       # Service Worker：LLM 调用、缓存、关键词分析、统计
├── content/          # Content Script：信息流监听、详情弹窗分析、渲染
├── popup/            # 弹窗 UI：开关、模式切换、统计
├── options/          # 设置页：API 配置、过滤规则
├── onboarding/       # 新手引导向导
├── stats/            # 数据统计页面
└── shared/           # 共享类型、常量、消息协议、Prompt
```

## License

MIT
