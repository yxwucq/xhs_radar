# XHS Content Radar (小红书内容质量雷达)

## Project Overview
Chrome Extension (MV3) that uses LLM to identify low-quality content on xiaohongshu.com and applies visual markers (blur/vanish). Read-only — no user action simulation, no server interaction.

**Status: All 6 phases complete (Phase 0-6). Ready for Chrome Web Store.**

## Tech Stack
- **Build**: Vite 5 + @crxjs/vite-plugin 2 (beta)
- **Language**: TypeScript (strict mode)
- **UI**: React 18 (Popup/Options)
- **Styling**: Tailwind CSS (Popup/Options) + CSS with `xhs-radar-` prefix (Content Script)
- **Testing**: Vitest + happy-dom (61 tests)
- **LLM**: OpenAI API + Anthropic API (Strategy pattern)
- **Storage**: chrome.storage.local (config + cache)

## Architecture
```
Content Script:
  MutationObserver (detect cards)
    → IntersectionObserver (viewport filter)
    → Extractor (DOM → NoteData)
    → Queue (batch 5 / 2s)
    → chrome.runtime.sendMessage

Background Service Worker:
  → Cache check (LRU, 2000 entries, 24h TTL)
  → LLM Gateway (concurrency max 2, 15s timeout, exponential backoff retry)
  → Cache write
  → chrome.runtime.sendMessage back

Content Script:
  → Renderer (Blur Mode / Vanish Mode)
```

## Key Design Decisions
- All cross-context messaging uses typed `Message<T>` protocol (shared/messaging.ts)
- LLM providers use Strategy pattern (base.ts interface + openai.ts / anthropic.ts)
- Cache operations go through Background only (avoid multi-tab conflicts)
- Renderer injects overlay + CSS classes, never modifies original DOM content
- XHS DOM selectors centralized in constants.ts (confirmed against real page snapshots)
- IntersectionObserver with 200px rootMargin — only analyze cards entering viewport
- Gateway: retry on 429/5xx with exponential backoff (max 2 retries), auth errors return fallback
- All extractor/selector operations wrapped in try-catch for graceful degradation

## XHS DOM Structure (confirmed 2026-03)
- Feed container: `#exploreFeeds` / `.feeds-container` / `.search-layout__main`
- Note card: `section.note-item`
- Title: `.footer a.title span`
- Author: `.author-wrapper a.author span.name`
- Note ID: 24-char hex in `/explore/{id}` links
- **No content/description in feed cards** — LLM analysis is title-based only

## Commands
```bash
npm run dev       # Vite dev with HMR
npm run build     # Production build → dist/
npm test          # Vitest (61 tests)
npm run test:watch  # Vitest watch mode
```

## File References
- `plan.md` — Product requirements document (PRD)
- `architecture.md` — Architecture design and phased plan with verification criteria
- `fixtures/` — HTML snapshots from real XHS pages (gitignored, used for tests)

## CSS Isolation Rules
- All injected classes MUST use `xhs-radar-` prefix
- Content Script styles must not affect XHS native layout
- Popup/Options are isolated pages, can use Tailwind freely
