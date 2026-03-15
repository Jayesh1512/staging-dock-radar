# Dock Radar — Product Requirements Document v2 (Phase 1)

**Product**: Dock Radar
**Version**: Phase 1 — PRD v2 (Single Source of Truth)
**Owner**: FlytBase BD Team
**Date**: March 15, 2026

---

## 1. Overview

### 1.1 What is Dock Radar?
Dock Radar is a social listening and BD intelligence tool built for FlytBase. It scans news sources for drone deployment opportunities, AI-scores them for commercial relevance, and presents a queue of actionable signals for the business development team.

### 1.2 Business Objectives
1. **Industry Awareness**: Understand what's happening in the drone industry — which companies, regions, and use cases are active
2. **Top-of-Funnel Intelligence**: Identify companies deploying drones as potential FlytBase customers
3. **Internal Knowledge Sharing**: Surface relevant signals to the BD team via Slack for quick action

### 1.3 Phased Approach
| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** | Google News scan + AI scoring + action queue + Slack sharing | **Building now** |
| Phase 2 | Content enrichment (people/company details, emails, contacts), LinkedIn source, LLM model selector, enrichment agent | Planned |
| Phase 3 | Direct email outreach, Slack approval workflow before sending email | Planned |

Phase 1 is designed with extension points so Phase 2/3 can be added without modifying existing code.

---

## 2. User Persona

**Primary User**: FlytBase BD team member (1-3 people)
- Needs to monitor drone industry news daily/weekly
- Wants to quickly identify commercial opportunities
- Shares relevant signals with internal team via Slack
- Eventually (Phase 2/3) wants to contact companies directly

**Usage Pattern**: Run 1-3 collection scans per week, review queue, share 5-10 articles to Slack, dismiss the rest.

---

## 3. Product Architecture

### 3.1 Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **UI Library**: Tailwind CSS + shadcn/ui (Radix primitives)
- **Backend**: Supabase (PostgreSQL + Edge Functions, Deno runtime)
- **AI**: OpenAI GPT-4o (baked in for Phase 1 — not user-configurable)
- **Integration**: Slack API (existing bot)
- **Font**: Inter (all weights)

### 3.2 High-Level Flow
```
User inputs keywords + filters + sources
    |
    v
Step 1: COLLECT (no LLM)
  Google News RSS -> Date filter -> Dedup Gate 1 (URL + title) -> Store (Shuffled the logic to optimize filter by using date earlier to dedup. Consider this approach for rest of the relevant places as applicable) 
    |
    v
Step 2: SCORE (GPT-4o, auto-triggered)
  Batch scoring -> Extract fields -> Dedup Gate 2 (cross-language) -> Store
  User can dismiss articles here to prevent them from reaching queue
    |
    v
Step 3: QUEUE (no LLM, persistent)
  Global backlog of unprocessed signals, grouped by run batches
  User actions: Slack Internally / Bookmark / Dismiss
```

---

## 4. Data Model

### 4.1 Database Tables

**`runs`** — Tracks each collection invocation
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | e.g., "run_20260315_143022" |
| keywords | TEXT[] | User-entered search phrases |
| sources | TEXT[] | Default: ['google_news'] |
| regions | TEXT[] | Selected Google News editions |
| filter_days | INTEGER | Default: 30 |
| min_score | INTEGER | Default: 50 |
| max_articles | INTEGER | Default: 50 |
| status | TEXT | running / completed / failed |
| articles_fetched | INTEGER | Total from all sources |
| articles_stored | INTEGER | After dedup + date filter |
| dedup_removed | INTEGER | Gate 1 dedup count |
| created_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |

**`articles`** — Global article pool (each article exists once)
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Hash of normalized URL |
| source | TEXT | 'google_news' / 'linkedin' / 'facebook' |
| title | TEXT | Article headline |
| url | TEXT | Original URL |
| normalized_url | TEXT UNIQUE | Stripped of tracking params, lowercased |
| snippet | TEXT | RSS description |
| publisher | TEXT | News outlet name |
| published_at | TIMESTAMPTZ | Publication date |
| created_at | TIMESTAMPTZ | |

**`run_articles`** — Junction: which run found which article
| Column | Type | Notes |
|--------|------|-------|
| run_id | TEXT FK | References runs.id |
| article_id | TEXT FK | References articles.id |
| keyword | TEXT | Which keyword matched this article |
| PK | | (run_id, article_id) |

**`scored_articles`** — AI-scored results (one score per article globally)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| article_id | TEXT FK UNIQUE | One score per article |
| relevance_score | INTEGER | 0-100 |
| company | TEXT | Primary buyer/deployer |
| country | TEXT | Where event happens |
| city | TEXT | Specific city if mentioned |
| use_case | TEXT | e.g., "Power Line Inspection" |
| signal_type | TEXT | DEPLOYMENT/CONTRACT/TENDER/PARTNERSHIP/EXPANSION/FUNDING/REGULATION/OTHER |
| summary | TEXT | 1-2 sentences, always English |
| flytbase_mentioned | BOOLEAN | Is FlytBase in the article? |
| persons | JSONB | [{name, role, organization}] |
| entities | JSONB | [{name, type}] — types: buyer/operator/regulator/partner/si/oem |
| drop_reason | TEXT | Null if relevant |
| is_duplicate | BOOLEAN | Gate 2 cross-language dedup |
| status | TEXT | new/reviewed/dismissed |
| actions_taken | TEXT[] | Actions performed: ['slack', 'bookmarked', 'email'] |
| reviewed_at | TIMESTAMPTZ | When marked as reviewed |
| dismissed_at | TIMESTAMPTZ | When dismissed |
| slack_sent_at | TIMESTAMPTZ | When sent to Slack |
| created_at | TIMESTAMPTZ | |

**`slack_messages`** — Tracks Slack messages sent
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| article_id | TEXT FK | References articles.id |
| scored_id | UUID FK | References scored_articles.id |
| channel_id | TEXT | Slack channel ID |
| message_ts | TEXT | Slack message timestamp |
| message_text | TEXT | Sent message content |
| sent_at | TIMESTAMPTZ | |

### 4.2 Smart Memory Model
- Articles exist once globally (`UNIQUE(normalized_url)`)
- Junction table `run_articles` links runs to articles
- Scores are cached globally — score an article once, reuse across all future runs
- Repeat searches are fast: most articles already exist + already scored
- Each run shows complete results including previously-scored articles

### 4.3 Multi-Run Article Ownership
- An article lives in the **earliest run** that discovered it
- If the same normalized URL is found in Run 2 that already existed from Run 1, it stays in Run 1's batch (`UPSERT ON CONFLICT DO NOTHING`)
- If already acted on (dismissed/bookmarked/sent) in Run 1, it does not resurface in Run 2's batch

---

## 5. Feature Specifications

### 5.1 Step 1: Collect

**Purpose**: User inputs search parameters and collects articles from Google News.

**User Inputs**:
| Input | Type | Default | Notes |
|-------|------|---------|-------|
| Keywords | Pill input | Required, 1+ | Each keyword searched as exact phrase. Wrapped in quotes for Google News. |
| Sources | Source selector | Google News | See 5.1.2. |
| Date Range | Combo dropdown + text | 30 days | Presets: 7, 14, 30, 60, 90. User can type custom number. |
| Region | Grouped checkbox selector | Global (all selected) | Hierarchy: Global > Continent > Country. See 5.1.3. |
| Max Articles | Number input | 50 | Configurable in config bar. Set to 5 for testing. |
| Min Score | Number input | 50 | Configurable in config bar. Immutable after collection starts. |

#### 5.1.1 Keyword Input Behavior
- Comma always splits immediately and creates pills for each part
- Enter adds the full current buffer as a single pill without splitting
- Trim whitespace on each side of every pill

#### 5.1.2 Sources Panel
Positioned below KeywordInput, above the DateFilter/RegionSelector form grid.

Layout: Horizontal row. Label "Sources to scan:" on the left. Three source pills on the right:
- `[✓] Google News` — enabled, checked by default
- `[○] LinkedIn (coming soon)` — disabled, unchecked, grayed, "coming soon" pill
- `[○] Facebook (coming soon)` — disabled, unchecked, grayed, "coming soon" pill

Default selection: Google News only.

#### 5.1.3 Region Selector
Grouped hierarchical selector. **Default: all countries selected (Global checked).**
```
[x] Global (all editions)
    [x] Americas
        [x] US  [x] Canada  [x] Brazil  [x] Mexico
    [x] Europe
        [x] UK  [x] Germany  [x] France  [x] Italy
    [x] Asia Pacific
        [x] India  [x] Singapore  [x] Japan  [x] Australia  [x] South Korea
    [x] Middle East & Africa
        [x] UAE  [x] Saudi Arabia  [x] South Africa
```
- "Global" selects/deselects all
- Continent checkbox auto-selects/deselects all its countries
- Deselecting one country unchecks continent but keeps siblings
- Shows count of selected regions in collapsed state

#### 5.1.4 Config Bar (Step 1)
| Parameter | Value | Editable | Display |
|-----------|-------|----------|---------|
| Max Articles | 50 | Yes (number input) | Input field |
| Title Similarity | 0.80 | No | Read-only badge |
| Min Score | 50 | Yes (number input) | Input field |

**Design principle**: ALL collection parameters become immutable after Step 1 completes. Changing any parameter requires starting a new collection.

**System Actions**:
1. Fetch Google News RSS for each keyword × edition combination
2. Gate 1 Dedup: URL normalization + title Jaccard (0.80 threshold)
3. Date filter: remove articles older than `filter_days`
4. Cap at `max_articles`
5. Store in `articles` table (UPSERT on normalized_url)
6. Create `run_articles` links

**Collection Timing**: 2 seconds flat simulation with spinner + "Collecting..." state. No incremental progress bar for collection — only scoring gets incremental progress.

**Output**:
- Pipeline stats: Fetched → After Dedup → Date Filtered → Stored
- Progress visualization (funnel with counts at each stage)

**On Complete**: Auto-navigate to Step 2, auto-trigger scoring.

**Form State After Collection**: Stays filled. User reuses parameters for next run.

---

### 5.2 Step 2: Score

**Purpose**: AI-powered scoring of collected articles. Auto-triggered after collection. Transparency view for user review. User can dismiss articles to prevent them from reaching the queue.

**Auto-Trigger**:
- Scoring starts automatically when Step 2 loads with a new run
- Shows progress bar: "Scoring... 24/35 articles" with spinner
- Secondary line: "X already cached from previous runs" (makes smart memory visible)

**Scoring Timing**: ~3 seconds simulation, increments every 200ms.

**Scoring via GPT-4o**:
1. Check cache: skip articles already scored (from previous runs)
2. Send uncached articles to GPT-4o in batch
3. Extract per article: relevanceScore, company, country, city, useCase, signalType, summary, flytbaseMentioned, persons[], entities[], dropReason
4. Gate 2 post-scoring dedup: compare company + country + signal_type + summary Jaccard (0.75) on extracted English fields. Higher score survives.
5. Store in `scored_articles` table
6. Stream results via SSE to frontend

**Scoring Criteria**:
| Band | Score | Label | Criteria |
|------|-------|-------|----------|
| Hot Lead | 90-100 | Hot Lead | Named buyer + named person quoted + specific deployment + active signal |
| Strong | 70-89 | Strong Signal | Company identified, deployment happening or planned |
| Moderate | 50-69 | Moderate Signal | Interest shown, details fuzzy, pilot program |
| Background | 30-49 | Background Intel | Industry trend, regulation, no specific buyer |
| Noise | 0-29 | Noise | Opinion, review, OEM marketing, consumer |

**Special Rules**:
- DJI, Skydio, Autel, Parrot, senseFly = OEMs, NOT signals. Extract the BUYER organization.
- `country` = where event happens, NOT where published
- If city mentioned, always infer country
- All output in English regardless of article language
- `flytbaseMentioned` = true if FlytBase appears in article

**User Actions in Step 2**:
- **Dismiss**: Click X button on any row → sets `status = 'dismissed'` → article does NOT flow to Step 3 queue. Moves to Dropped section with reason "Dismissed by user".
- **Filter**: By signal type (dropdown), by country (dropdown)
- **Sort**: By score (desc) or date (desc)
- **View dropped articles**: Expand collapsible "Dropped by AI" section showing filtered articles with reasons and scores

**Min Score Filtering**: Min score filters at RENDER time, not as a state mutation. The full scored array is always kept in state. This allows the user to raise/lower the threshold without losing data.

**Display**:
| Column | Width | Content |
|--------|-------|---------|
| Score | 60px | Color-coded badge (green 70+, yellow 50-69, gray <50) |
| Article | flex | Title (link) + publisher + date + source badge |
| Company | 140px | Primary buyer/deployer |
| Country | 100px | Where event happens |
| Signal | 110px | Signal type badge (color-coded) |
| Use Case | 80px | Short label |
| FlytBase | 56px | "Yes" (green) or "No" (gray) — self-explanatory text, no color dot |
| Dismiss | 40px | X icon button |

**Dropped Articles Panel**:
- `DroppedArticles` is a pure display component — no filtering logic inside
- `ScorePanel` pre-filters the data and passes the correct array
- Step 3 never renders `DroppedArticles`
- Collapsed by default
- Header: "Dropped by AI (15 articles)" with expand toggle
- Each item shows: title, drop reason (italic), score, source badge
- Cross-language dupes show: "Cross-language duplicate of '[title]' (Gate 2)"
- User-dismissed articles show: "Dismissed by user"

#### 5.2.1 Config Bar (Step 2)
| Parameter | Value | Editable | Display |
|-----------|-------|----------|---------|
| Max Articles | (from run) | No | Read-only badge |
| Min Score | (from run) | No | Read-only badge |
| Title Similarity | 0.80 | No | Read-only badge |
| Run Selector | Latest run | Yes (dropdown) | Shows timestamp + keywords for each past run. **Only interactive element.** |

**Run Selector Behavior**: Switching runs swaps the displayed scored articles table with that run's data. No re-scoring animation. Scoring animation only triggers once — when landing on Step 2 after a fresh collection.

---

### 5.3 Step 3: Queue (Action Inbox)

**Purpose**: Persistent global backlog of unprocessed signals across all runs. New collections ADD to the backlog — they do not replace it. User acts on each article.

#### 5.3.1 Queue Rules
- Queue shows ALL articles with `status = 'new'` from ANY run
- Articles from different runs appear grouped by batch (see 5.3.2)
- Same article from different runs appears ONCE in the earliest run's batch (smart memory)
- Dismissed articles are hidden everywhere permanently — no expiry, never resurface even from future runs
- Articles dismissed in Step 2 never appear in Step 3
- If a new run re-discovers an already-dismissed article, it stays dismissed

#### 5.3.2 Batch Sections
Articles are grouped by the run that discovered them, with visual batch dividers.

**Batch divider format**:
```
━━━  [Run keywords]  •  [Date, Time]  •  [N signals]  ━━━━━━━━━━━━━  [□ Select All]  [⊗ Bulk Dismiss]
```

**Rules**:
- Latest run batch appears first
- Within a batch, articles sorted by score descending
- Each batch has its OWN Select All + Bulk Dismiss
- Global Select All is REMOVED from QueuePanel header
- Cross-batch dismissal is done batch by batch (each batch's Bulk Dismiss only affects its own selected rows)

#### 5.3.3 Queue Table Columns
| Column | Width | Content |
|--------|-------|---------|
| Checkbox | 30px | Row selection for batch bulk actions |
| Expand | 20px | Triangle toggle for article drawer |
| Article | flex | Title (link) + publisher + date + source badge |
| Company | 140px | Primary buyer/deployer |
| Country | 100px | Where event happens |
| Signal | 110px | Signal type badge |
| Score | 60px | Color-coded badge |

#### 5.3.4 Expandable Article Drawer
When user clicks expand toggle, a detail section opens below that row. Only one drawer open at a time (`expandedId: string | null` lives in QueuePanel).

**Left column (2/3 width)** — rendered by `ArticleDetail.tsx`:
- **Summary**: 1-2 sentences from LLM, always English
- **Metadata grid**: Company, Location (city + country), Use Case, Signal (badge), Score (badge + label), FlytBase flag
- **People Mentioned**: List of persons with avatar circle (initials), name, role, organization. Each PersonCard includes an empty `DetailLine` slot below the role line (reserved for email/LinkedIn data in Phase 2/3).

**Right column (1/3 width)** — rendered by `ArticleDrawer.tsx`:
- **Organizations**: Entity pills with type badge (buyer, operator, regulator, partner, si, oem)
- **Source**: Source badge + Publisher + Published date

**Full width below** — rendered by `ArticleDrawer.tsx`:
- **Slack Compose**: Editable textarea pre-filled with structured content (see 5.3.6). Label: "Message to #dock-radar"
- **Action Buttons** (left group):
  - "Slack Internally" (blue primary button, send icon) — shows ✓ state after clicking
  - "Bookmark" (gold outline button, star icon) — shows filled ★ after clicking
  - "Open Article" (gray outline button, external link icon)
- **Right side**:
  - "Mark as Reviewed" (green outline button, check icon) — always visible
  - "Dismiss" (red ghost button, x icon)

#### 5.3.5 Article Actions — Multi-Action Model

Actions are non-exclusive. Articles stay in the Active Queue until explicitly marked reviewed or dismissed. Buttons show completion state (checkmark/filled icon) after clicking.

| Action | Effect | Row Behavior | Toast |
|--------|--------|-------------|-------|
| Slack Internally | Adds 'slack' to `actions_taken`. Sets `slack_sent_at`. Posts to #dock-radar. Button turns to ✓ state. | Article stays in queue. Drawer stays open. | "Sent to #dock-radar" |
| Bookmark | Adds 'bookmarked' to `actions_taken`. Button turns to filled ★ state. | Article stays in queue. Drawer stays open. | None |
| Mark as Reviewed | Sets `status='reviewed'`, sets `reviewed_at` timestamp. | Row exits Active Queue immediately. Appears in Reviewed tab. Drawer closes. | None |
| Dismiss | Sets `status='dismissed'`. Permanent. No undo. | Row vanishes immediately everywhere. Drawer closes. | None (single). "X articles dismissed" for bulk. |
| Open Article | Opens original URL in new tab. | No change. | None |

**Key rules:**
- A user CAN Slack AND Bookmark the same article — both actions recorded in `actions_taken[]`
- Dismiss overrides all — once dismissed, always gone
- "Mark as Reviewed" is always visible in the action strip; it is the explicit exit from the queue
- Articles with no actions but marked reviewed appear in the Reviewed tab (Decision B confirmed)

#### 5.3.6 Slack Message Pre-fill Format
```
*[Company]* — [Signal Type] | [Country]
Score: [X]/100 | Use Case: [value]

[Summary text]

[Article URL]
```
- User can edit the message before sending
- Posted to `#dock-radar` channel by `dock-radar` bot
- Non-English articles use the English summary (already translated by LLM)

#### 5.3.7 Reviewed Inbox (Sub-view)

Step 3 has two sub-views toggled by a tab bar within the panel:

**Active Queue** (default) — All articles with `status='new'`, grouped by batch (see 5.3.2)

**Reviewed** — All articles with `status='reviewed'`, flat list sorted by `reviewed_at` desc

**Reviewed tab filter bar**:
```
[All] [Slack icon Slacked] [★ Bookmarked] [Date ▾]
```
- **All**: Shows all reviewed articles
- **Slacked** (Slack icon, not bell): Filters to articles with `'slack' IN actions_taken`
- **Bookmarked**: Filters to articles with `'bookmarked' IN actions_taken`
- **Date**: Sort control (newest first / oldest first)

**Reviewed tab columns**: Title (link) | Company | Country | Signal badge | Score badge | Actions taken (icons) | Reviewed timestamp

**Reviewed tab behavior** (Phase 1):
- Read-only expand: row expands to show summary only (no action strip)
- No bulk actions
- Articles with no actions (marked reviewed without Slack/Bookmark) appear here (Decision B)
- Dismissed articles never appear anywhere in the UI (Decision C)

#### 5.3.8 Empty States
| Scenario | Display |
|----------|---------|
| Step 2 with no run | "Run a collection first to see scored articles here." |
| Step 2 all dismissed | Table shows 0 rows + "All articles dismissed" text below filters. |
| Step 3 empty queue | "All caught up — no new signals to review" with checkmark icon, centered gray. |
| Collection/scoring failure | Toast only: "Collection failed — try again" / "Scoring failed — try again". No retry button in Phase 1. |

---

## 6. Backend Architecture

### 6.1 Edge Functions

**`collect/index.ts`** (~150 lines)
- Input: `{ keywords, sources, regions, filterDays, maxArticles }`
- Calls source modules via registry pattern
- Applies Gate 1 dedup (URL normalization + title Jaccard 0.80)
- Date filters, caps at max_articles
- Stores articles + run_articles
- Returns: run object + pipeline stats

**`score/index.ts`** (~150 lines)
- Input: `{ runId, minScore }`
- Checks cache (already-scored articles)
- Sends uncached articles to GPT-4o with tool-use schema
- Streams results via SSE
- Applies Gate 2 post-scoring dedup (company + country + signal + summary Jaccard 0.75)
- Stores scored_articles
- Returns: SSE stream of scored articles

**`slack-notify/index.ts`** (~80 lines)
- Input: `{ articleId, message, company, country, signalType, relevanceScore, summary, articleUrl, articleTitle }`
- Formats Slack Block Kit message
- Posts to #dock-radar channel via Slack API
- Sets `slack_sent_at` timestamp on scored_articles
- Stores in slack_messages table
- Returns: { success, ts }

### 6.2 Modular Source System
```typescript
interface SourceModule {
  id: string;
  collect(params: { keywords, regions, filterDays, maxArticles }): Promise<CollectResult>;
  dedup?(articles: RawArticle[]): RawArticle[];
  scoringPromptAddendum?(): string;
}
```
- Phase 1: `sources/google-news.ts` (RSS fetching, keyword phrase wrapping, edition mapping)
- Phase 2: Add `sources/linkedin.ts` — one file + one import line, zero changes to orchestrator

### 6.3 Shared Modules
- `_shared/llm.ts` — Multi-provider LLM abstraction (reused from old project)
- `_shared/cors.ts` — CORS headers
- `_shared/supabase.ts` — Supabase client factory

---

## 7. Deduplication Logic

### Gate 1: Collect Step (pre-LLM, deterministic)
| Layer | Method | Catches |
|-------|--------|---------|
| URL Normalization | Strip tracking params (utm_*, fbclid, gclid), remove www/amp, lowercase hostname, remove trailing slashes, extract real URL from Google News redirect wrapper | Same article with different tracking params, AMP variants, www vs non-www |
| Title Similarity | Jaccard on content words (3+ chars, stop words removed), threshold 0.80 | Syndicated wire stories (AP/Reuters on multiple outlets), updated article titles |
| DB Constraint | `UNIQUE(normalized_url)` with `ON CONFLICT DO NOTHING` | Cross-run duplicates |

### Gate 2: Post-Scoring (post-LLM, deterministic)
| Condition | Action |
|-----------|--------|
| Two scored articles have same `company` + `country` + `signal_type` AND summary Jaccard > 0.75 | Mark lower-scored one as `is_duplicate = true` |
| Cross-language articles about same event | Caught by Gate 2 because LLM translates all summaries to English before comparison |
| Same event, different articles (completely different titles/angles) | NOT auto-dropped — user decides |

---

## 8. UI Design Specifications

### 8.1 Design Tokens
| Token | Value |
|-------|-------|
| Font | Inter (400, 500, 600, 700) |
| Primary color | #2C7BF2 (FlytBase Blue) |
| Primary hover | #1B6AE0 |
| Primary light | #EBF2FE |
| Accent color | #FFAB49 (Gold) |
| Background | #FFFFFF |
| Surface (config bars) | #F9FAFB |
| Border | #E5E7EB |
| Text primary | #111827 |
| Text secondary | #374151 |
| Text muted | #6B7280 |
| Text disabled | #9CA3AF |
| Border radius (cards) | 12px |
| Border radius (buttons) | 6-8px |
| Border radius (badges) | 4-6px |
| Max content width | 1280px |
| Page padding | 32px horizontal, 24px vertical |

### 8.2 Score Badge Colors
| Range | Label | Background | Text |
|-------|-------|-----------|------|
| 90-100 | Hot Lead | #F0FDF4 | #16A34A |
| 70-89 | Strong Signal | #DBEAFE | #2563EB |
| 50-69 | Moderate Signal | #FEFCE8 | #CA8A04 |
| 30-49 | Background Intel | #F3F4F6 | #6B7280 |
| 0-29 | Noise | #FEF2F2 | #991B1B |

`ScoreBadge` uses `SCORE_BANDS` from constants as the sole source of truth.

### 8.3 Signal Type Badge Colors
| Signal | Background | Text |
|--------|-----------|------|
| DEPLOYMENT | #DCFCE7 | #166534 |
| CONTRACT | #DBEAFE | #1E40AF |
| TENDER | #F3E8FF | #6B21A8 |
| PARTNERSHIP | #FFF7ED | #C2410C |
| EXPANSION | #FEF9C3 | #A16207 |
| FUNDING | #CFFAFE | #0E7490 |
| REGULATION | #FEE2E2 | #991B1B |
| OTHER | #F3F4F6 | #4B5563 |

### 8.4 Source Badge Colors
```typescript
export const SOURCE_BADGE_COLORS: Record<ArticleSource, { bg: string; text: string }> = {
  google_news: { bg: '#FEF9C3', text: '#A16207' },
  linkedin:    { bg: '#DBEAFE', text: '#1E40AF' },
  facebook:    { bg: '#EEF2FF', text: '#4338CA' },
};
```

### 8.5 Layout
- **Navbar**: Sticky top, white bg, bottom border
- **Step Tabs**: Sticky below navbar, white bg, horizontal tabs (Collect | Score | Queue)
- **Config Bar**: Below tabs on Step 1 and 2, light gray bg, shows editable + read-only parameters
- **Main Content**: Max 1280px centered, 32px horizontal padding
- Each step fills the viewport below the tabs — no vertical stacking of steps

### 8.6 Component Size Rule
No single component file exceeds 250 lines. Complex panels decomposed into sub-components.

---

## 9. State Architecture

### 9.1 Dashboard State Ownership
Dashboard (top-level) owns:
- `activeStep: number` — current tab (1, 2, 3)
- `currentRun: Run | null` — most recent collection run
- `scoredArticles: ArticleWithScore[]` — full scored array (never pruned by min score)
- `articleStatuses: Map<string, ArticleStatus>` — overlay for status mutations (new/reviewed/dismissed) across Steps 2 and 3
- `articleActions: Map<string, string[]>` — overlay for actions_taken mutations (slack/bookmarked) per article

Both `ScorePanel` and `QueuePanel` read from `articleStatuses` and dispatch mutations up via callbacks. Single source of truth, no cross-panel state drift.

### 9.2 Component-Level State
- `expandedId: string | null` — lives in `QueuePanel`, passed down to `QueueTable` as prop
- `minScore` filtering — applied at render time in `ScorePanel`, never mutates the scored array

### 9.3 Step Navigation Rules
| Action | Effect |
|--------|--------|
| Navigate back to Step 1 | Does NOT clear Step 2/3 data |
| Click "Collect News" | Clears `currentRun` and `scoredArticles` (resets Step 2). Queue (Step 3) retains all previous articles. |
| New collection completes | New articles ADD to the global queue backlog |

---

## 10. Component Decomposition

### 10.1 Key Component Boundaries
| Component | Responsibility |
|-----------|---------------|
| `ArticleDetail.tsx` | Left column of drawer: summary, metadata grid, People Mentioned section |
| `ArticleDrawer.tsx` | 2-column shell, right column (entities, source), bottom action strip (SlackCompose, ArticleActions) |
| `QueuePanel.tsx` | Orchestrator only — no inline JSX beyond layout wrapper |
| `ReviewedInbox.tsx` | Reviewed sub-view with filter bar (All / Slacked / Bookmarked / Date) |
| `DroppedArticles.tsx` | Pure display component — parent pre-filters, this only renders |
| `PersonCard.tsx` | Person avatar + name + role + organization. Includes Phase 2 `DetailLine` slot for email/LinkedIn. |

---

## 11. Hooks

### 11.1 `use-collect.ts`
- 2 seconds flat simulation
- No incremental progress — spinner + "Collecting..." state
- Returns run object + pipeline stats on completion

### 11.2 `use-score.ts`
```typescript
// Returns:
{
  isScoring: boolean;
  progress: number;      // articles scored so far
  total: number;         // total articles to score
  articles: ArticleWithScore[];
  startScoring: (run: Run) => void;
}
```
- Interval fires every 200ms, increments `progress`
- ~3 seconds total simulation time
- Shows cached count: "X already cached from previous runs"
- Resolves with full mock article array at completion
- Cleanup via `useRef` abort flag on unmount

---

## 12. Configurable Parameters

| Parameter | Default | Editable | Step | Display | Purpose |
|-----------|---------|----------|------|---------|---------|
| Max articles per run | 50 | Yes | 1 (editable), 2 (readonly) | Input field / badge | Set to 5 for testing |
| Date range (days) | 30 | Yes (combo) | 1 | Dropdown presets + custom input | Filter article age |
| Title similarity threshold | 0.80 | Read-only | 1 and 2 | Badge | Transparency |
| Min relevance score | 50 | Yes | 1 (editable), 2 (readonly) | Input field / badge | Lower for testing, raise for strict |
| Run selector | Latest run | Yes (dropdown) | 2 | Dropdown | Switch between past runs |

**Testing Mode**: Set max articles to 5, min score to 20 for fast cheap test cycles.

**Removed Parameters**:
- LLM Model is NOT displayed in any config bar. GPT-4o is baked in for Phase 1. Will be re-introduced as a selector in Phase 2.
- Review Gate toggle removed entirely from Phase 1. After scoring completes, Step 3 tab unlocks + toast "Queue ready — N articles". No gating mechanism.

---

## 13. Integration: Slack

| Setting | Value |
|---------|-------|
| Channel | #dock-radar |
| Bot name | dock-radar |
| Auth | Existing SLACK_BOT_TOKEN (reused) |
| Button label | "Slack internally" |
| Message | Editable by user before sending |
| Format | Structured plain text (see pre-fill format below) |
| Translation | Non-English articles sent using English summary |

**Slack Message Pre-fill Format**:
```
*[Company]* — [Signal Type] | [Country]
Score: [X]/100 | Use Case: [value]

[Summary text]

[Article URL]
```

---

## 14. TypeScript Types

```typescript
type SignalType = 'DEPLOYMENT' | 'CONTRACT' | 'TENDER' | 'PARTNERSHIP' | 'EXPANSION' | 'FUNDING' | 'REGULATION' | 'OTHER';
type ArticleStatus = 'new' | 'reviewed' | 'dismissed';
type ArticleAction = 'slack' | 'bookmarked' | 'email';
type ArticleSource = 'google_news' | 'linkedin' | 'facebook';

interface Run {
  id: string;
  keywords: string[];
  sources: ArticleSource[];
  regions: string[];
  filter_days: number;
  min_score: number;
  max_articles: number;
  status: 'running' | 'completed' | 'failed';
  articles_fetched: number;
  articles_stored: number;
  dedup_removed: number;
  created_at: string;
  completed_at: string | null;
}

interface Article {
  id: string;
  source: ArticleSource;
  title: string;
  url: string;
  normalized_url: string;
  snippet: string | null;
  publisher: string | null;
  published_at: string | null;
  created_at: string;
}

interface Person {
  name: string;
  role: string;
  organization: string;
}

interface Entity {
  name: string;
  type: 'buyer' | 'operator' | 'regulator' | 'partner' | 'si' | 'oem';
}

interface ScoredArticle {
  id: string;
  article_id: string;
  relevance_score: number;
  company: string | null;
  country: string | null;
  city: string | null;
  use_case: string | null;
  signal_type: SignalType;
  summary: string | null;
  flytbase_mentioned: boolean;
  persons: Person[];
  entities: Entity[];
  drop_reason: string | null;
  is_duplicate: boolean;
  status: ArticleStatus;
  actions_taken: ArticleAction[];
  reviewed_at: string | null;
  dismissed_at: string | null;
  slack_sent_at: string | null;
  created_at: string;
}

interface ArticleWithScore {
  article: Article;
  scored: ScoredArticle;
}

interface PipelineStats {
  totalFetched: number;
  afterDedup: number;
  afterDateFilter: number;
  stored: number;
  dedupRemoved: number;
}

interface ConfigItem {
  label: string;
  value: string | number | boolean;
  editable: boolean;
  type: 'number' | 'text' | 'select';
  options?: { label: string; value: string }[];
  onChange?: (value: string | number | boolean) => void;
}

interface SlackMessage {
  id: string;
  article_id: string;
  scored_id: string;
  channel_id: string;
  message_ts: string;
  message_text: string;
  sent_at: string;
}
```

---

## 15. Acceptance Criteria

### Step 1: Collect
- [ ] User can add/remove keyword pills (comma splits immediately, Enter adds as-is)
- [ ] Sources panel shows Google News enabled + LinkedIn/Facebook disabled with "coming soon"
- [ ] Date range combo works (dropdown presets + custom number)
- [ ] Region selector with Global/Continent/Country hierarchy, all selected by default
- [ ] Collect button triggers Google News RSS fetch
- [ ] Pipeline stats show funnel visualization after completion
- [ ] Config bar shows: Max Articles (editable), Title Similarity (readonly), Min Score (editable)
- [ ] LLM model is NOT displayed anywhere
- [ ] Auto-navigates to Step 2 on completion
- [ ] Form stays filled after collection for parameter reuse

### Step 2: Score
- [ ] Scoring auto-triggers when entering Step 2 with new run
- [ ] Progress bar with spinner shows during scoring (~3s, increments every 200ms)
- [ ] Shows cached article count from previous runs
- [ ] Scored articles table displays with all 7 columns + dismiss button
- [ ] Score badges are color-coded by band (including Noise 0-29)
- [ ] Signal type badges are color-coded
- [ ] FlytBase mentioned flag shows for relevant articles
- [ ] Filters work: signal type, country, sort by score/date
- [ ] Min score threshold displays as read-only (set in Step 1), filters at render time
- [ ] Dropped articles section is collapsible (collapsed by default), rendered by pure display component
- [ ] Dropped articles show title, reason, score
- [ ] Cross-language duplicates appear in dropped section with explanation
- [ ] User can dismiss articles from Step 2 (prevents flow to Step 3)
- [ ] Run selector dropdown shows previous runs (only interactive config element)
- [ ] Config bar shows all parameters as read-only except run selector
- [ ] After scoring completes: Step 3 tab unlocks + toast "Queue ready — N articles"

### Step 3: Queue
- [ ] Queue is a persistent global backlog — new runs add, never replace
- [ ] Articles grouped by run batch with visual dividers
- [ ] Batch divider shows: run keywords, date/time, signal count, Select All, Bulk Dismiss
- [ ] Latest run batch appears first
- [ ] Within batch, articles sorted by score descending
- [ ] Each batch has its own Select All + Bulk Dismiss (no global Select All)
- [ ] Article lives in earliest run that discovered it
- [ ] Same article appears only once regardless of how many runs found it
- [ ] Expand chevron opens article drawer below the row (one at a time)
- [ ] ArticleDetail (left column): summary, metadata, persons with DetailLine slot
- [ ] ArticleDrawer (right column + bottom): entities, source, SlackCompose, actions
- [ ] Editable Slack message pre-filled with structured format
- [ ] "Slack Internally" adds 'slack' to actions_taken, sets slack_sent_at, button shows ✓ state, article stays in queue
- [ ] "Bookmark" adds 'bookmarked' to actions_taken, button shows filled ★ state, article stays in queue
- [ ] "Mark as Reviewed" sets status='reviewed', row exits Active Queue, appears in Reviewed tab
- [ ] "Dismiss" sets status='dismissed', row vanishes permanently everywhere, no undo
- [ ] "Open Article" opens original URL in new tab
- [ ] User can both Slack and Bookmark same article (multi-action model)
- [ ] Dismiss overrides all — once dismissed, gone forever
- [ ] Toast only for: Slack send, bulk dismiss. No toast for: single dismiss, bookmark, mark reviewed
- [ ] Reviewed tab sub-view exists alongside Active Queue sub-view in Step 3
- [ ] Reviewed tab filter bar: All | Slacked (Slack icon) | ★ Bookmarked | Date sort
- [ ] Reviewed tab shows flat list sorted by reviewed_at desc
- [ ] Reviewed tab is read-only expand in Phase 1 (summary only, no action strip)
- [ ] Articles with no actions but marked reviewed still appear in Reviewed tab
- [ ] Reviewed columns: Title (link), Company, Country, Signal badge, Score badge, Actions taken icons, Reviewed timestamp
- [ ] Empty queue: "All caught up — no new signals to review" with checkmark icon
- [ ] Dismissed articles never reappear even from new runs (no expiry)

### Smart Memory
- [ ] Second run with same keywords: most articles already scored (cached)
- [ ] Second run: only new articles get scored by GPT-4o
- [ ] Score is consistent — same article always shows same score

### Slack Integration
- [ ] Message posts to #dock-radar channel
- [ ] Pre-fill format: Company — Signal | Country, Score, Use Case, Summary, URL
- [ ] User can edit message before sending
- [ ] Non-English articles use English summary in Slack message

---

## 16. Future Phase Interfaces

### Phase 2 Extension Points
- `sources/linkedin.ts` — new SourceModule, one import line in collect orchestrator
- `enriched_contacts` table — linked to scored_articles
- `opportunity_packs` table — deep-dive enrichment
- Enrichment edge function using Jina AI + GPT-4o
- LLM selector dropdown re-introduced in UI (currently hidden)
- Competitor detection (DroneSense, etc.) in scoring prompt
- PersonCard `DetailLine` slot populated with email/LinkedIn data
- Email action added to ArticleActions (3rd action alongside Slack/Bookmark)

### Phase 2 Analytics (Parked)
Analytics dashboard showing aggregated intelligence across runs:
- Regional drone news counts (articles by country/continent over time)
- FlytBase presence percentage (% of articles mentioning FlytBase by region)
- Score distributions by region and use-case
- Signal type frequency charts (DEPLOYMENT vs CONTRACT vs FUNDING, etc.)
- Competitor activity heatmap
Implementation: Aggregate queries on scored_articles + runs tables. Read-only. Accessible from top-right nav bar.

### Phase 3 Extension Points
- `send-email` edge function
- `pending_approvals` table
- Slack approval workflow → auto-send email
- Email templates with industry/region awareness
- Dismissed articles audit trail: top-right nav bar view showing all dismissed articles (soft delete — records exist in DB with `status='dismissed'`, shown on-demand in dedicated view)

### App-Level Navigation (Phase 3 consideration)
Top-right nav bar for app-level features (accessible from any step):
- Analytics page (Phase 2)
- Dismissed articles audit view (Phase 3)
- Future: Settings, API keys, team management

---

## 17. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Collection time (50 articles) | < 30 seconds |
| Scoring time (50 articles) | < 60 seconds |
| Slack post latency | < 3 seconds |
| Frontend load time | < 2 seconds |
| Component file size | < 250 lines each |
| Browser support | Chrome, Safari, Firefox (latest) |
| Authentication | None (Phase 1, internal tool) |
| Responsive | Desktop-first, 1280px max. Functional at 768px+ |
