# Dock Radar — Claude Code Context

## What is this?
Dock Radar is a social listening and BD intelligence tool for FlytBase. It scans Google News for drone deployment opportunities, scores them with GPT-4o, and presents an actionable queue for the BD team.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Vite 6
- **Styling**: Tailwind CSS v4 + shadcn/ui (Radix primitives)
- **Backend**: Supabase (PostgreSQL + Edge Functions, Deno runtime)
- **AI**: OpenAI GPT-4o (baked in for Phase 1)
- **Integration**: Slack API (existing bot, #dock-radar channel)
- **Libs**: React Router v6, TanStack React Query, Lucide React, Sonner (toasts)

## Project Structure
```
src/
  components/
    collect/     — Step 1: keyword input, sources, date/region, collection
    score/       — Step 2: scoring progress, scored articles table, dropped
    queue/       — Step 3: batch-grouped queue, article drawer, reviewed inbox
    shared/      — Navbar, StepTabs, ConfigBar, reusable components
    ui/          — shadcn/ui primitives (auto-generated)
  hooks/         — use-collect.ts, use-score.ts
  data/          — Mock data (will be replaced by Supabase queries)
  lib/           — Utility functions (cn, etc.)
  types.ts       — All TypeScript interfaces
  constants.ts   — Score bands, signal colors, regions, defaults
```

## Key Design Decisions
- **Single source of truth**: docs/dock-radar-prd-v2.md
- **250-line component limit**: Decompose complex panels
- **Multi-action model**: Slack/Bookmark keep article in queue; Mark as Reviewed exits to Reviewed tab
- **ArticleStatus**: 'new' | 'reviewed' | 'dismissed' (3 states only)
- **Queue is a global backlog**: new runs ADD articles, never replace
- **Path alias**: `@/` maps to `src/`

## Commands
- `npm run dev` — Start dev server
- `npm run build` — TypeScript check + Vite build
- `npm run lint` — ESLint

## Build Rules
- Always run `npx tsc -b` before committing to catch type errors
- No component file > 250 lines
- Use `@/` imports, never relative `../..` beyond one level
- All design docs in `docs/` — PRD v2 is the definitive reference
