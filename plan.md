# 小红书内容质量雷达（XHS Content Radar）

## Chrome 浏览器插件 - 产品需求文档

---

## 1. 产品概述

一款 Chrome 浏览器插件，运行在小红书网页版（xiaohongshu.com），通过 LLM 对信息流中的笔记内容进行质量识别，在低质内容（焦虑诱导、标题党、虚假信息等）上叠加视觉标记，帮助用户快速识别并跳过垃圾内容。

**核心原则：只读不写。** 插件仅读取页面内容并做视觉标记，不模拟任何用户操作（不自动点赞、不自动 dislike、不自动关注），不与小红书服务端产生任何交互。

---

## 2. 技术架构

```
[小红书网页 DOM] → [Content Script 提取笔记文本/标题] → [Background Script 调用 LLM API] → [Content Script 渲染标记/蒙版]
```

### 2.1 技术栈

- **框架**: Chrome Extension Manifest V3
- **语言**: TypeScript
- **构建工具**: Vite + CRXJS 或 Plasmo
- **样式**: CSS Modules 或 Tailwind（注入页面的样式需做好隔离，避免与小红书原生样式冲突）
- **LLM 接入**: 支持 OpenAI API（gpt-4o-mini）和 Anthropic API（claude-sonnet），用户在设置页自行填入 API Key
- **存储**: chrome.storage.local 存储用户配置和缓存

### 2.2 项目结构

```
xhs-content-radar/
├── src/
│   ├── manifest.json          # MV3 配置
│   ├── background/
│   │   └── index.ts           # Service Worker: LLM 调用、消息中转
│   ├── content/
│   │   ├── index.ts           # Content Script 主入口
│   │   ├── observer.ts        # DOM 变更监听（MutationObserver）
│   │   ├── extractor.ts       # 笔记内容提取器
│   │   ├── renderer.ts        # 蒙版/标签渲染器
│   │   └── styles.css         # 注入样式
│   ├── popup/
│   │   ├── index.html         # 弹窗 UI
│   │   ├── App.tsx            # 弹窗主组件
│   │   └── styles.css
│   ├── options/
│   │   ├── index.html         # 设置页
│   │   └── App.tsx            # 设置页主组件
│   ├── shared/
│   │   ├── types.ts           # 类型定义
│   │   ├── constants.ts       # 常量（分类标签、阈值等）
│   │   ├── prompt.ts          # LLM Prompt 模板
│   │   └── cache.ts           # 结果缓存逻辑
│   └── utils/
│       └── llm-client.ts      # LLM API 封装（支持 OpenAI / Anthropic）
├── assets/
│   └── icons/                 # 插件图标 16/48/128
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 3. 功能模块

### 3.1 内容提取模块（extractor.ts）

**职责**: 从小红书网页 DOM 中提取笔记卡片的关键信息。

**提取目标**:
- 笔记标题文本
- 笔记摘要/正文预览文本
- 作者昵称
- 封面图上的文字（如果有 OCR 能力则提取，MVP 阶段可跳过）
- 笔记唯一标识（用于缓存去重，从卡片链接中提取 note ID）

**适配页面**:
- 首页信息流（发现页）: `xiaohongshu.com/explore`
- 搜索结果页: `xiaohongshu.com/search_result/*`

**实现要点**:
- 小红书首页为瀑布流，内容动态加载，必须使用 `MutationObserver` 持续监听新增笔记卡片 DOM 节点
- 为每个已处理的笔记卡片添加 `data-xhs-radar-processed` 属性，避免重复处理
- 提取时对 DOM 选择器做容错处理，小红书可能随时更新 class name，需在 `extractor.ts` 中集中管理选择器，便于后续维护
- 选择器策略：优先使用结构性选择器（如 `section > div > a`）而非 class name，提高稳定性

### 3.2 LLM 分析模块（background/index.ts + prompt.ts）

**职责**: 将提取的笔记内容发送给 LLM，返回内容质量评估结果。

**Prompt 设计**:

```
你是一个社交媒体内容质量评估助手。请分析以下小红书笔记内容，判断其是否属于低质内容。

低质内容类型定义：
1. 焦虑诱导（anxiety）: 利用年龄焦虑、容貌焦虑、财富焦虑、育儿焦虑等情绪吸引点击
2. 标题党（clickbait）: 标题夸张、与实际内容严重不符、使用"震惊""必看""不看后悔"等诱导词
3. 虚假信息（misinformation）: 伪科学、未经证实的医疗建议、编造的故事/经历
4. 软广伪装（hidden_ad）: 伪装成真实分享的广告内容、虚假种草
5. 情绪操控（emotional_manipulation）: 刻意煽动对立、制造矛盾、贩卖负面情绪

请以 JSON 格式返回：
{
  "score": 0-100,         // 内容质量分，100为最优质，0为最低质
  "is_low_quality": bool, // 是否判定为低质内容（score < 40 时为 true）
  "tags": [],             // 命中的低质类型标签数组，如 ["anxiety", "clickbait"]
  "reason": ""            // 一句话中文解释判定理由（不超过30字）
}

待分析笔记：
标题：{title}
内容：{content}
作者：{author}
```

**批量处理**:
- 将当前视口内的多条笔记合并为一个请求（最多 5 条/次），减少 API 调用次数
- 请求格式改为数组，LLM 返回对应数组结果

**调用策略**:
- 使用 `chrome.runtime.sendMessage` 从 Content Script 发送到 Background Service Worker
- Background 负责实际 API 调用，管理并发（最多 2 个并行请求）
- 设置超时 15 秒，超时则跳过标记

### 3.3 缓存模块（cache.ts）

**职责**: 避免对同一篇笔记重复调用 LLM。

- 以 note ID 为 key，将 LLM 返回的评估结果缓存到 `chrome.storage.local`
- 缓存有效期 24 小时
- 缓存上限 2000 条，超出时 LRU 淘汰
- 页面加载时先查缓存，命中则直接渲染标记，不调用 LLM

### 3.4 渲染模块（renderer.ts）

**职责**: 在低质笔记卡片上叠加视觉标记。

**过滤模式（用户可在 Popup 中切换）**:

| 模式 | 效果 | 适用场景 |
|------|------|----------|
| Blur Mode（模糊模式） | 对低质笔记卡片施加 CSS `filter: blur(8px)`，叠加标签和"点击查看"按钮 | 默认模式，用户可主动展开查看 |
| Vanish Mode（消失模式） | 直接隐藏低质笔记卡片 DOM 节点（`display: none`） | 重度用户，追求极致干净的信息流 |

**质量分级（两种模式共用）**:

| 质量分 | 级别 | Blur Mode 效果 | Vanish Mode 效果 |
|--------|------|----------------|------------------|
| 0-30 | 高风险 | blur(12px) + 红色标签 | 隐藏 |
| 31-50 | 中风险 | blur(6px) + 黄色标签 | 隐藏 |
| 51-100 | 正常 | 不做任何处理 | 不做任何处理 |

**Blur Mode UI 元素**:
- 模糊层: 对笔记卡片整体施加 `filter: blur()`，模糊程度按风险级别区分
- 标签: 卡片右上角小标签，显示命中的低质类型（如"焦虑诱导"），字体 12px，圆角背景
- 原因提示: 标签旁以小字显示判定理由（不超过30字）
- "点击查看"按钮: 居中显示在模糊卡片上方，点击后移除该卡片的模糊效果并隐藏按钮，允许用户查看原内容

**样式隔离**:
- 所有注入的 CSS class 统一使用 `xhs-radar-` 前缀
- 使用 Shadow DOM 或高优先级选择器避免样式污染

### 3.5 Popup 弹窗（popup/）

**功能**:
- 显示插件开关（全局启用/禁用）
- 显示当前页面统计：已扫描 X 条笔记，标记 Y 条低质内容
- 快捷入口跳转设置页
- 显示 API 余额/调用次数（本次会话）

**UI 风格**: 简洁卡片式，宽 320px，高度自适应，浅色主题

### 3.6 设置页（options/）

**配置项**:

| 配置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| LLM Provider | 单选 | OpenAI | 选择 OpenAI 或 Anthropic |
| API Key | 密码输入框 | 空 | 用户自行填入 |
| Model | 下拉 | gpt-4o-mini | OpenAI: gpt-4o-mini / gpt-4o; Anthropic: claude-sonnet-4-20250514 |
| 灵敏度 | 滑块 | 50 | 0=宽松（只标记最明显的低质内容）100=严格（疑似即标记），映射为 prompt 中的判定阈值 |
| 启用类型 | 多选 | 全选 | 焦虑诱导 / 标题党 / 虚假信息 / 软广伪装 / 情绪操控，用户可选择只过滤特定类型 |
| 蒙版透明度 | 滑块 | 默认值 | 允许用户调节蒙版遮挡程度 |
| 缓存管理 | 按钮 | - | 清除所有缓存 |

---

## 4. 用户交互流程

```
1. 用户安装插件 → 打开设置页 → 填入 API Key → 选择偏好配置 → 保存
2. 用户访问 xiaohongshu.com/explore
3. Content Script 启动，MutationObserver 开始监听
4. 检测到新笔记卡片进入 DOM
   → 提取标题+内容+作者+noteID
   → 查缓存：命中 → 直接渲染 / 未命中 → 加入待分析队列
5. 待分析队列积累到 5 条或等待 2 秒（取先到者）
   → 批量发送给 Background → Background 调用 LLM API
   → 返回结果 → 写入缓存 → 通知 Content Script 渲染
6. Content Script 根据评估结果在对应笔记卡片上叠加蒙版/标签
7. 用户可点击蒙版上的 × 按钮移除单条标记
8. 用户滚动页面 → 新笔记加载 → 重复步骤 4-6
```

---

## 5. 边界与约束

### 5.1 不做的事情
- **不模拟任何用户操作**（不点赞、不 dislike、不关注、不评论）
- **不抓取或存储小红书数据到外部服务器**（所有数据仅在本地浏览器中）
- **不处理笔记详情页**（仅处理信息流/搜索结果中的卡片预览）
- **不做图片内容识别**（MVP 阶段仅分析文本）

### 5.2 性能约束
- 单次 LLM 调用延迟不应阻塞页面滚动体验
- 所有 LLM 调用异步执行，蒙版渲染在结果返回后才出现（期间笔记正常显示）
- 内存占用控制：缓存上限 2000 条，超出自动清理

### 5.3 错误处理
- API Key 未设置：Popup 显示提示引导用户到设置页
- API 调用失败（网络错误/余额不足/Rate Limit）：静默跳过该批次，不影响浏览，Popup 显示错误计数
- DOM 选择器失效（小红书改版）：日志记录，插件降级为不标记状态，不报错不崩溃

---

## 6. MVP 里程碑

### Phase 1: 基础可用
- [ ] Chrome Extension 脚手架搭建（MV3 + TypeScript + Vite）
- [ ] Content Script：DOM 监听 + 笔记内容提取
- [ ] Background：LLM API 调用（先支持 OpenAI 一家）
- [ ] 蒙版渲染（单级红色蒙版）
- [ ] Popup：开关 + 统计
- [ ] Options：API Key 配置

### Phase 2: 体验优化
- [ ] 批量请求优化（合并多条笔记）
- [ ] 缓存模块
- [ ] 三级标记（红/黄/无）
- [ ] 支持 Anthropic API
- [ ] 灵敏度 + 过滤类型配置
- [ ] 蒙版关闭按钮

### Phase 3: 打磨上线
- [ ] 错误处理与降级策略
- [ ] 搜索结果页适配
- [ ] 性能优化（Intersection Observer 仅处理可视区域）
- [ ] Chrome Web Store 上架准备（图标、截图、描述）
- [ ] README 文档
