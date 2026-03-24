# XHS Content Radar — 架构设计与分阶段开发计划

## 1. 架构总览

### 1.1 系统分层

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Extension                      │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   Popup UI  │  │  Options UI  │  │ Content Script │  │
│  │  (React)    │  │  (React)     │  │  (注入页面)     │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                │                   │           │
│         │     chrome.runtime.sendMessage     │           │
│         └────────────┬───────────────────────┘           │
│                      │                                   │
│              ┌───────▼────────┐                          │
│              │   Background   │                          │
│              │ Service Worker │                          │
│              └───────┬────────┘                          │
│                      │                                   │
│              ┌───────▼────────┐                          │
│              │  LLM Gateway   │                          │
│              │ (API 调用层)    │                          │
│              └───────┬────────┘                          │
│                      │                                   │
│              ┌───────▼────────┐                          │
│              │  Storage Layer │                          │
│              │ chrome.storage │                          │
│              └────────────────┘                          │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼ HTTPS
              ┌────────────────┐
              │  OpenAI API /  │
              │ Anthropic API  │
              └────────────────┘
```

### 1.2 技术选型决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 构建工具 | **Vite + @crxjs/vite-plugin** | 成熟稳定，HMR 支持好，社区活跃，对 MV3 支持完善 |
| UI 框架 | **React 18** | Popup/Options 需要交互状态管理，React 生态成熟 |
| 样式方案 | **Tailwind CSS**（Popup/Options）+ **CSS Modules with prefix**（Content Script 注入） | Popup/Options 独立页面用 Tailwind 高效开发；Content Script 注入页面必须样式隔离 |
| 状态管理 | **zustand** | 轻量，无 boilerplate，适合插件这种小型但需要跨组件状态的场景 |
| TypeScript | **Strict mode** | 插件涉及多层消息传递，类型安全至关重要 |

### 1.3 关键数据流

```
[DOM 变更]
    │
    ▼
[MutationObserver] ──→ 检测新笔记卡片
    │
    ▼
[Extractor] ──→ 提取 {noteId, title, content, author}
    │
    ▼
[Cache Check] ──→ 命中? ──→ 直接交给 Renderer
    │ 未命中
    ▼
[Queue] ──→ 积累 5 条 or 2s 超时（取先到者）
    │
    ▼
[chrome.runtime.sendMessage] ──→ Background Service Worker
    │
    ▼
[LLM Gateway] ──→ 并发控制（max 2）──→ API 调用
    │
    ▼
[Response] ──→ 写入 Cache ──→ chrome.runtime.sendMessage 回 Content Script
    │
    ▼
[Renderer] ──→ 根据 score + 当前模式（Blur/Vanish）渲染标记
```

---

## 2. 核心模块设计

### 2.1 消息协议（Message Protocol）

所有跨 context 通信使用统一的类型化消息协议：

```typescript
// 消息类型枚举
type MessageType =
  | 'ANALYZE_NOTES'        // Content → Background: 请求分析
  | 'ANALYZE_RESULT'       // Background → Content: 返回结果
  | 'GET_STATUS'           // Popup → Background: 获取状态
  | 'STATUS_UPDATE'        // Background → Popup: 状态更新
  | 'CONFIG_CHANGED'       // Options → Background → Content: 配置变更
  | 'TOGGLE_ENABLED'       // Popup → Background → Content: 开关切换

// 统一消息结构
interface Message<T = unknown> {
  type: MessageType
  payload: T
  timestamp: number
}
```

### 2.2 LLM Gateway 设计

采用 **Strategy 模式** 封装不同 LLM Provider：

```typescript
// 抽象接口
interface LLMProvider {
  analyze(notes: NoteInput[]): Promise<AnalysisResult[]>
}

// 具体实现
class OpenAIProvider implements LLMProvider { ... }
class AnthropicProvider implements LLMProvider { ... }

// 工厂
function createProvider(config: LLMConfig): LLMProvider
```

并发控制使用简单的信号量机制（max 2 parallel requests），超时 15s 自动 abort。

### 2.3 缓存层设计

```typescript
interface CacheEntry {
  noteId: string
  result: AnalysisResult
  timestamp: number        // 写入时间，用于 24h 过期
  lastAccess: number       // 最后访问时间，用于 LRU
}

// 缓存操作全部经过 Background Service Worker
// Content Script 不直接访问 chrome.storage
// 理由：避免多 tab 并发读写冲突，Background 做统一调度
```

### 2.4 Content Script 渲染策略

**关键设计：渲染与原始 DOM 解耦**

```
[笔记卡片 DOM]
    │
    ├── 原始内容（不修改）
    │
    └── [注入的 wrapper div.xhs-radar-overlay]  ← 绝对定位覆盖
         ├── blur 效果通过 CSS filter 作用于原始卡片
         ├── 标签 badge
         ├── 理由文字
         └── "点击查看" 按钮
```

- Blur Mode：给原始卡片添加 `xhs-radar-blurred` class（施加 `filter: blur()`），覆盖层显示标签和按钮
- Vanish Mode：给原始卡片添加 `xhs-radar-hidden` class（`display: none`）
- 点击"查看"：移除 class + 覆盖层，标记为用户已确认

---

## 3. 项目结构（最终态）

```
xhs-content-radar/
├── src/
│   ├── manifest.json
│   │
│   ├── background/
│   │   ├── index.ts              # Service Worker 入口，消息路由
│   │   ├── llm-gateway.ts        # LLM 调用调度（并发控制、超时、重试）
│   │   ├── providers/
│   │   │   ├── base.ts           # LLMProvider 接口
│   │   │   ├── openai.ts         # OpenAI 实现
│   │   │   └── anthropic.ts      # Anthropic 实现
│   │   ├── cache.ts              # 缓存读写（chrome.storage 操作）
│   │   └── stats.ts              # 运行统计（已扫描/已标记/错误数）
│   │
│   ├── content/
│   │   ├── index.ts              # Content Script 入口
│   │   ├── observer.ts           # MutationObserver 管理
│   │   ├── extractor.ts          # DOM → NoteData 提取
│   │   ├── queue.ts              # 待分析队列（批量 + 防抖）
│   │   ├── renderer.ts           # 渲染标记/蒙版
│   │   └── styles.css            # 注入样式（xhs-radar- 前缀）
│   │
│   ├── popup/
│   │   ├── index.html
│   │   ├── main.tsx              # React 入口
│   │   ├── App.tsx               # 主组件
│   │   └── components/           # 子组件
│   │
│   ├── options/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── components/
│   │
│   └── shared/
│       ├── types.ts              # 全局类型定义
│       ├── constants.ts          # 常量
│       ├── prompt.ts             # Prompt 模板
│       └── messaging.ts          # 类型安全的消息收发封装
│
├── assets/
│   └── icons/                    # 16/48/128 图标
│
├── public/                       # 静态资源（如果需要）
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── package.json
└── .gitignore
```

---

## 4. 分阶段开发计划

### Phase 0: 工程脚手架（验证点：插件可加载）

**目标**：从零搭建可运行的 Chrome Extension 骨架，确保开发环境通畅。

**交付物**：
- [x] `package.json` + 依赖安装
- [ ] Vite + CRXJS 构建配置
- [ ] TypeScript 配置（strict mode）
- [ ] Tailwind CSS 配置
- [ ] `manifest.json`（MV3，声明 permissions、content_scripts、background）
- [ ] 空的 Background Service Worker（`console.log('background ready')`）
- [ ] 空的 Content Script（`console.log('content script injected')`）
- [ ] 空的 Popup 页面（显示 "XHS Radar"）
- [ ] 空的 Options 页面（显示 "Settings"）

**验证标准**：
```
1. npm run build 成功产出 dist/
2. Chrome 加载 dist/ 为未打包扩展，无报错
3. 访问 xiaohongshu.com，DevTools Console 看到 content script 日志
4. 点击插件图标，Popup 正常显示
5. 右键插件 → 选项，Options 页面正常显示
6. Background Service Worker 在 chrome://extensions 中状态正常
```

---

### Phase 1: 内容提取管线（验证点：能从页面抓到笔记数据）

**目标**：实现从小红书页面自动检测并提取笔记卡片信息的完整管线。

**交付物**：
- [ ] `shared/types.ts` — 定义 `NoteData`、`AnalysisResult` 等核心类型
- [ ] `shared/constants.ts` — 选择器常量、低质类型枚举
- [ ] `content/observer.ts` — MutationObserver 监听 DOM 变更
- [ ] `content/extractor.ts` — 从笔记卡片 DOM 提取 `NoteData`
- [ ] `content/index.ts` — 串联 observer + extractor，已处理卡片打标 `data-xhs-radar-processed`

**关键技术点**：
- 需要实际访问 xiaohongshu.com/explore，通过 DevTools 分析真实 DOM 结构
- 选择器策略：优先结构性选择器，class name 作为 fallback
- MutationObserver 配置：`childList: true, subtree: true`，监听笔记容器节点

**验证标准**：
```
1. 访问 xiaohongshu.com/explore
2. Console 输出每个检测到的笔记卡片的 NoteData（title, content, author, noteId）
3. 滚动页面加载更多内容，新笔记持续被检测和提取
4. 同一张卡片不会被重复处理（检查 data-xhs-radar-processed 属性）
5. 切换到搜索结果页，提取同样生效（或至少不报错）
```

---

### Phase 2: LLM 分析通路（验证点：发出去、拿得回）

**目标**：打通 Content Script → Background → LLM API → 返回结果 的完整链路。

**交付物**：
- [ ] `shared/messaging.ts` — 类型安全的消息收发工具
- [ ] `shared/prompt.ts` — Prompt 模板（支持单条和批量）
- [ ] `background/providers/base.ts` — LLMProvider 接口定义
- [ ] `background/providers/openai.ts` — OpenAI API 调用实现
- [ ] `background/llm-gateway.ts` — 并发控制（信号量 max 2）、超时 15s、错误处理
- [ ] `background/index.ts` — 消息路由，接收 ANALYZE_NOTES，调用 gateway，返回结果
- [ ] `content/queue.ts` — 批量队列（5 条 or 2s 触发）
- [ ] Options 页面：最小可用版本（仅 API Key 输入 + Provider 选择 + 保存）

**关键技术点**：
- Background Service Worker 中不能使用 DOM API
- `fetch` 在 Service Worker 中可用，用于调 LLM API
- API Key 存储在 `chrome.storage.local`，Background 启动时读取
- 批量 Prompt 设计：多条笔记合并为一个请求，要求 LLM 返回数组

**验证标准**：
```
1. Options 页面填入 OpenAI API Key 并保存
2. 访问小红书，笔记被提取后自动进入队列
3. 队列触发后，Background 发出 LLM API 请求（Network tab 可见）
4. API 返回结果，Console 打印每条笔记的 score/tags/reason
5. API Key 未设置时，不发送请求，Console 输出提示
6. 网络错误时，不崩溃，Console 输出错误日志
7. 并发控制生效：快速滚动时最多只有 2 个 pending 请求
```

---

### Phase 3: 视觉渲染（验证点：低质内容被标记）

**目标**：将 LLM 分析结果渲染为视觉标记，实现 Blur Mode 核心体验。

**交付物**：
- [ ] `content/styles.css` — 完整的注入样式（blur、badge、button、动画）
- [ ] `content/renderer.ts` — Blur Mode 渲染实现
  - 根据 score 分级（0-30 高风险 blur 12px，31-50 中风险 blur 6px）
  - 右上角标签（类型 + 颜色）
  - 理由文字
  - "点击查看" 按钮 → 点击移除模糊
- [ ] 更新 `content/index.ts` — 串联完整管线：observer → extractor → queue → analyze → render

**关键技术点**：
- 样式隔离：所有 class 使用 `xhs-radar-` 前缀，CSS 选择器权重要足够高
- `filter: blur()` 作用在笔记卡片本身，overlay 层绝对定位在卡片上方
- "点击查看" 按钮需要 `pointer-events: auto`，其余 overlay 区域 `pointer-events: none`
- 渲染时要考虑卡片尺寸可能不同（瀑布流布局）

**验证标准**：
```
1. 访问小红书，等待几秒后低质笔记卡片被模糊处理
2. 高风险内容（0-30）模糊程度明显高于中风险（31-50）
3. 右上角标签正确显示低质类型（中文），颜色区分红/黄
4. 标签旁显示一句话理由
5. 点击"点击查看"按钮，模糊效果消除，卡片恢复正常
6. 正常内容（51-100）不受任何影响
7. 注入样式不影响小红书原生页面布局和交互
```

---

### Phase 4: 缓存 + Popup（验证点：重复访问不重复计费）

**目标**：实现缓存层避免重复调用 API，Popup 展示运行状态。

**交付物**：
- [ ] `background/cache.ts` — 缓存 CRUD（基于 chrome.storage.local）
  - 以 noteId 为 key
  - 24h 过期
  - LRU 淘汰（上限 2000 条）
- [ ] `background/stats.ts` — 统计数据（已扫描、已标记、缓存命中、API 调用次数、错误数）
- [ ] 更新 `background/index.ts` — 分析前查缓存，命中直接返回
- [ ] Popup UI 完整实现：
  - 全局开关
  - 模式切换（Blur / Vanish）
  - 统计面板
  - 跳转设置页按钮

**关键技术点**：
- `chrome.storage.local` 有 10MB 限制，2000 条缓存绰绰有余
- LRU 淘汰：每次读取更新 `lastAccess`，淘汰时按 `lastAccess` 排序
- 统计数据用 `chrome.storage.session`（会话级），不持久化
- Popup 每次打开时从 Background 拉取最新状态

**验证标准**：
```
1. 首次浏览，笔记被分析并缓存（Console 日志确认）
2. 刷新页面，相同笔记直接命中缓存（无 API 调用，Console 日志确认）
3. Popup 显示正确的统计数字（扫描数、标记数、缓存命中率）
4. Popup 开关可以启用/禁用插件（禁用后不再分析新笔记）
5. Popup 模式切换：Blur ↔ Vanish，切换后已标记卡片立即更新渲染
6. 24 小时后缓存自动失效（可通过修改时间戳测试）
```

---

### Phase 5: Vanish Mode + Options 完善（验证点：完整的用户配置体验）

**目标**：实现 Vanish 模式，完善 Options 设置页全部配置项。

**交付物**：
- [ ] `content/renderer.ts` — 增加 Vanish Mode 渲染逻辑
- [ ] `background/providers/anthropic.ts` — Anthropic API 实现
- [ ] Options 页面完整实现：
  - LLM Provider 选择（OpenAI / Anthropic）
  - API Key 输入（密码框，带验证按钮）
  - Model 选择（根据 Provider 联动）
  - 灵敏度滑块（映射到 Prompt 阈值）
  - 启用类型多选（焦虑诱导 / 标题党 / 虚假信息 / 软广伪装 / 情绪操控）
  - 清除缓存按钮
- [ ] 配置变更实时生效（Options 保存 → Background 通知 → Content Script 更新）

**验证标准**：
```
1. Vanish Mode：低质笔记直接从视觉上消失，页面布局自动填充
2. Blur ↔ Vanish 切换，已标记卡片渲染方式即时切换
3. 切换到 Anthropic Provider + 填入 Key，分析正常工作
4. 调节灵敏度：低灵敏度时只有最明显的低质内容被标记，高灵敏度标记更多
5. 取消勾选某个类型后，该类型的低质内容不再被标记
6. 清除缓存后，已分析的笔记在刷新页面后重新调用 API
```

---

### Phase 6: 健壮性 + 上线准备（验证点：可发布到 Chrome Web Store）

**目标**：错误处理、降级策略、性能优化、上架准备。

**交付物**：
- [ ] 错误处理体系：
  - API Key 未设置 → Popup 引导
  - API 调用失败 → 静默跳过 + 错误计数
  - DOM 选择器失效 → 降级为不标记状态
  - Rate Limit → 指数退避重试
- [ ] 性能优化：
  - Intersection Observer 仅处理可视区域内的卡片
  - 长列表场景下的内存控制
- [ ] 搜索结果页 `xiaohongshu.com/search_result/*` 适配
- [ ] 插件图标（16/48/128）
- [ ] Chrome Web Store 资料（描述、截图、隐私政策）

**验证标准**：
```
1. 拔掉网线/禁用网络 → 插件不崩溃，恢复网络后自动恢复工作
2. 填入错误的 API Key → 友好提示，不死循环重试
3. 快速滚动加载 100+ 条笔记 → 页面不卡顿，内存稳定
4. 搜索结果页笔记正常提取和标记
5. npm run build 产出的 dist/ 可直接作为 Chrome Web Store 提交包
```

---

## 5. 依赖清单

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.28",
    "@types/chrome": "^0.0.287",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

---

## 6. 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| 小红书 DOM 结构变更 | 提取器失效 | 选择器集中管理在 constants.ts，结构性选择器优先，定期维护 |
| LLM 返回格式不稳定 | 解析失败 | JSON 解析加 try-catch + fallback，Prompt 中强调格式要求 |
| CRXJS 对 MV3 兼容问题 | 构建失败 | 使用 beta 稳定版本，必要时降级为手动配置 |
| API 费用失控 | 用户超额 | 批量请求减少调用、缓存避免重复、Popup 显示调用次数 |
| Content Script 样式污染 | 页面布局错乱 | 严格前缀隔离，CI 中检查 CSS 无裸类名 |
