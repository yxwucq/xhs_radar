# 红薯雷达 (小红书内容质量雷达)

## Project Overview
Chrome Extension (MV3) that uses LLM to identify low-quality content on xiaohongshu.com and applies visual markers (blur/vanish). Read-only — no user action simulation, no server interaction.

**Status: All 6 phases complete (Phase 0-6). Ready for Chrome Web Store.**

## Tech Stack
- **Build**: Vite 5 + @crxjs/vite-plugin 2 (beta)
- **Language**: TypeScript (strict mode)
- **UI**: React 18 (Popup/Options)
- **Styling**: Tailwind CSS (Popup/Options) + CSS with `xhs-radar-` prefix (Content Script)
- **Testing**: Vitest + happy-dom (73 tests)
- **LLM**: OpenAI API + Anthropic API (Strategy pattern)
- **Storage**: chrome.storage.local (config + cache)

## Architecture
```
Feed Analysis (title-based, batch):
  Content Script:
    MutationObserver (detect cards)
      → IntersectionObserver (viewport filter)
      → Extractor (DOM → NoteData)
      → Queue (batch 5 / 2s)
      → chrome.runtime.sendMessage (ANALYZE_NOTES)
  Background:
    → Cache check (LRU, 2000 entries, 24h TTL)
    → LLM Gateway (concurrency max 2, 15s timeout, exponential backoff retry)
    → Cache write → push ANALYZE_RESULT back
  Content Script:
    → Renderer (Blur Mode / Vanish Mode) + score indicator

Detail Analysis (title + body text, single note):
  Content Script:
    Click listener on note links (passive, zero idle overhead)
      → Detect detail overlay (#noteContainer)
      → Extract title (#detail-title) + body (#detail-desc)
      → chrome.runtime.sendMessage (ANALYZE_DETAIL)
  Background:
    → LLM analysis with full content → push DETAIL_RESULT back
  Content Script:
    → Floating badge on overlay + retroactive feed card marking
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
- LLM outputs 0-100 quality score (not binary OK/LOW); user sensitivity setting is the threshold
- Detail overlay detection uses passive click listener — zero idle performance overhead
- System prompt includes per-category boundary guidance to reduce false positives on humorous/lighthearted content

## XHS DOM Structure (confirmed 2026-03)
- Feed container: `#exploreFeeds` / `.feeds-container` / `.search-layout__main`
- Note card: `section.note-item`
- Title: `.footer a.title span`
- Author: `.author-wrapper a.author span.name`
- Note ID: 24-char hex in `/explore/{id}` links
- **No content/description in feed cards** — feed analysis is title-based only
- Detail overlay: `#noteContainer` / `.note-detail-mask`
- Detail title: `#detail-title`
- Detail body: `#detail-desc` (full note content, available when user clicks a card)

## Commands
```bash
npm run dev       # Vite dev with HMR
npm run build     # Production build → dist/
npm test          # Vitest (73 tests)
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
