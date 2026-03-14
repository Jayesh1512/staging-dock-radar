# Dock Radar — Product Requirements Document (Phase 1)

**Product**: Dock Radar
**Version**: Phase 1
**Owner**: FlytBase BD Team
**Date**: March 14, 2026

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
| Phase 2 | Content enrichment (people and company details, emails, contacts), LinkedIn source, test enrichment agent | Planned |
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
- **AI**: OpenAI GPT-4o for article scoring
- **Integration**: Slack API (existing bot)
- **Font**: Inter (all weights)

### 3.2 High-Level Flow
```
User inputs keywords + filters
    |
    v
Step 1: COLLECT (no LLM)
  Google News RSS -> Dedup Gate 1 (URL + title) -> Date filter -> Store
    |
    v
Step 2: SCORE (GPT-4o, auto-triggered)
  Batch scoring -> Extract fields -> Dedup Gate 2 (cross-language) -> Store
  User can dismiss articles here to prevent them from reaching queue
    |
    v
Step 3: QUEUE (no LLM, persistent)
  Global inbox of unprocessed signals
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
| llm_model | TEXT | Default: 'gpt-4o' (wired for future use) |
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
| status | TEXT | new/shared/dismissed/bookmarked |
| dismissed_at | TIMESTAMPTZ | When soft-deleted |
| shared_at | TIMESTAMPTZ | When sent to Slack |
| bookmarked_at | TIMESTAMPTZ | When starred |
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

---

## 5. Feature Specifications

### 5.1 Step 1: Collect

**Purpose**: User inputs search parameters and collects articles from Google News.

**User Inputs**:
| Input | Type | Default | Notes |
|-------|------|---------|-------|
| Keywords | Pill input | Required, 1+ | Each keyword searched as exact phrase. Wrapped in quotes for Google News. |
| Date Range | Combo dropdown + text | 30 days | Presets: 7, 14, 30, 60, 90. User can type custom number. |
| Region | Grouped checkbox selector | Global | Hierarchy: Global > Continent > Country. See 5.1.1. |
| Max Articles | Number input | 50 | Configurable in config bar. Set to 5 for testing. |

#### 5.1.1 Region Selector
Grouped hierarchical selector:
```
[x] Global (all editions)
    [x] Americas
        [x] US  [x] Canada  [x] Brazil  [x] Mexico
    [x] Europe
        [x] UK  [x] Germany  [x] France  [x] Italy
    [x] Asia Pacific
        [x] India  [x] Singapore  [x] Japan  [x] Australia  [x] South Korea
    [ ] Middle East & Africa
        [ ] UAE  [ ] Saudi Arabia  [ ] South Africa
```
- "Global" selects/deselects all
- Continent checkbox auto-selects/deselects all its countries
- Deselecting one country unchecks continent but keeps siblings
- Shows count of selected regions in collapsed state

**System Actions**:
1. Fetch Google News RSS for each keyword x edition combination
2. Gate 1 Dedup: URL normalization + title Jaccard (0.80 threshold)
3. Date filter: remove articles older than `filter_days`
4. Cap at `max_articles`
5. Store in `articles` table (UPSERT on normalized_url)
6. Create `run_articles` links

**Output**:
- Pipeline stats: Fetched → After Dedup → Date Filtered → Stored
- Progress visualization (funnel with counts at each stage)

**On Complete**: Auto-navigate to Step 2, auto-trigger scoring.

#### 5.1.2 Config Bar (Step 1)
| Parameter | Value | Editable | Display |
|-----------|-------|----------|---------|
| Max articles | 50 | Yes (number input) | Input field |
| Title similarity | 0.80 | No | Read-only badge |
| LLM | GPT-4o | No | Read-only badge |

---

### 5.2 Step 2: Score

**Purpose**: AI-powered scoring of collected articles. Auto-triggered after collection. Transparency view for user review. User can dismiss articles to prevent them from reaching the queue.

**Auto-Trigger**:
- Scoring starts automatically when Step 2 loads with a new run
- Shows progress bar: "Scoring... 24/35 articles" with spinner

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

**Display**:
| Column | Width | Content |
|--------|-------|---------|
| Score | 60px | Color-coded badge (green 70+, yellow 50-69, gray <50) |
| Article | flex | Title (link) + publisher + date + source badge |
| Company | 140px | Primary buyer/deployer |
| Country | 100px | Where event happens |
| Signal | 110px | Signal type badge (color-coded) |
| Use Case | 80px | Short label |
| FB | 40px | FlytBase mentioned flag |
| Dismiss | 40px | X icon button |

**Dropped Articles Panel**:
- Collapsed by default
- Header: "Dropped by AI (15 articles)" with expand toggle
- Each item shows: title, drop reason (italic), score, source badge
- Cross-language dupes show: "Cross-language duplicate of '[title]' (Gate 2)"
- User-dismissed articles show: "Dismissed by user"

#### 5.2.1 Config Bar (Step 2)
| Parameter | Value | Editable | Display |
|-----------|-------|----------|---------|
| Min score | 50 | Yes (number input) | Input field. Changes re-filter table without re-scoring. |
| Summary similarity | 0.75 | No | Read-only badge |
| LLM | GPT-4o | No | Read-only badge |
| Run selector | Latest run | Yes (dropdown) | Shows timestamp + keywords for each past run |

---

### 5.3 Step 3: Queue (Action Inbox)

**Purpose**: Persistent global inbox of unprocessed signals across all runs. User acts on each article.

**Queue Rules**:
- Shows only articles with `status = 'new'` (unprocessed signals)
- Articles from ANY run flow into the same queue
- Same article from different runs appears ONCE (smart memory)
- Dismissed articles are hidden everywhere, forever
- Articles dismissed in Step 2 never appear in Step 3
- If a new run re-discovers an already-dismissed article, it stays dismissed

**Table Display**:
| Column | Width | Content |
|--------|-------|---------|
| Checkbox | 30px | Row selection for bulk actions |
| Expand | 20px | Triangle toggle for article drawer |
| Article | flex | Title (link) + publisher + date + source badge |
| Company | 140px | Primary buyer/deployer |
| Country | 100px | Where event happens |
| Signal | 110px | Signal type badge |
| Score | 60px | Color-coded badge |

**Expandable Article Drawer** (inline accordion below row):
When user clicks expand toggle, a detail section opens below that row:

Left column (2/3 width):
- **Summary**: 1-2 sentences from LLM, always English
- **Metadata grid**: Company, Location (city + country), Use Case, Signal (badge), Score (badge + label), FlytBase flag
- **People Mentioned**: List of persons with avatar circle (initials), name, role, organization
- Right column (1/3 width):
- **Organizations**: Entity pills with type badge (buyer, operator, regulator, partner, si, oem)
- **Source**: Source badge + Publisher + Published date

Full width below:
- **Slack Compose**: Editable textarea pre-filled with summary. Label: "Message to #dock-radar"
- **Action Buttons**:
  - "Slack Internally" (blue primary button, send icon) → posts to Slack, sets status='shared'
  - "Bookmark" (gold outline button, star icon) → sets status='bookmarked'
  - "Dismiss" (red outline button, x icon) → sets status='dismissed', hidden forever
  - "Open Article" (gray outline button, external link icon) → opens original URL in new tab

**Slack Message Behavior**:
- Pre-filled with English summary from LLM (if article was non-English, summary is already translated)
- User can edit the message before sending
- Posted to `#dock-radar` channel by `dock-radar` bot
- Block Kit formatted with: company header, signal/score/country/use case fields, summary text, article link

**Bulk Actions**:
- "Select All" checkbox in header
- "Bulk Dismiss" button — dismisses all selected rows

**Sections Below Queue**:
- **Sent to Slack** (collapsible): Articles with `status = 'shared'`, sorted by shared_at desc
- **Bookmarked** (collapsible): Articles with `status = 'bookmarked'`, sorted by bookmarked_at desc
- Hidden if empty

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
- Input: `{ runId, minScore, llmProvider }`
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
- Updates scored_articles.status to 'shared'
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
| Range | Background | Text |
|-------|-----------|------|
| 90-100 (Hot) | #F0FDF4 | #16A34A |
| 70-89 (Strong) | #DBEAFE | #2563EB |
| 50-69 (Moderate) | #FEFCE8 | #CA8A04 |
| 30-49 (Background) | #F3F4F6 | #6B7280 |

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

### 8.4 Layout
- **Navbar**: Sticky top, white bg, bottom border
- **Step Tabs**: Sticky below navbar, white bg, horizontal tabs (Collect | Score | Queue)
- **Config Bar**: Below tabs on Step 1 and 2, light gray bg, shows editable + read-only parameters
- **Main Content**: Max 1280px centered, 32px horizontal padding
- Each step fills the viewport below the tabs — no vertical stacking of steps

### 8.5 Component Size Rule
No single component file exceeds 250 lines. Complex panels decomposed into sub-components.

---

## 9. Configurable Parameters

| Parameter | Default | Editable | Step | Purpose |
|-----------|---------|----------|------|---------|
| Max articles per run | 50 | Yes | 1 | Set to 5 for testing |
| Date range (days) | 30 | Yes (combo) | 1 | Dropdown presets + custom input |
| Title similarity threshold | 0.80 | Read-only | 1 | Transparency |
| Min relevance score | 50 | Yes | 2 | Lower for testing, raise for strict |
| Summary similarity (Gate 2) | 0.75 | Read-only | 2 | Transparency |
| LLM model | GPT-4o | Read-only (Phase 1) | 2 | Wired for Phase 2 switching |

**Testing Mode**: Set max articles to 5, score threshold to 20 for fast cheap test cycles.

---

## 10. Integration: Slack

| Setting | Value |
|---------|-------|
| Channel | #dock-radar |
| Bot name | dock-radar |
| Auth | Existing SLACK_BOT_TOKEN (reused) |
| Button label | "Slack internally" |
| Message | Editable by user before sending |
| Format | Slack Block Kit |
| Translation | Non-English articles sent using English summary |

**Block Kit Structure**:
```
Header: "Signal: [Company Name]"
Fields: Signal Type | Score | Country | Use Case
Section: Summary text
Section: Article link
```

---

## 11. TypeScript Types

```typescript
type SignalType = 'DEPLOYMENT' | 'CONTRACT' | 'TENDER' | 'PARTNERSHIP' | 'EXPANSION' | 'FUNDING' | 'REGULATION' | 'OTHER';
type ArticleStatus = 'new' | 'shared' | 'dismissed' | 'bookmarked';
type ArticleSource = 'google_news' | 'linkedin' | 'facebook';

interface Run {
  id: string;
  keywords: string[];
  sources: ArticleSource[];
  regions: string[];
  filter_days: number;
  llm_model: string;
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
  dismissed_at: string | null;
  shared_at: string | null;
  bookmarked_at: string | null;
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
```

---

## 12. Acceptance Criteria

### Step 1: Collect
- [ ] User can add/remove keyword pills
- [ ] Date range combo works (dropdown presets + custom number)
- [ ] Region selector with Global/Continent/Country hierarchy
- [ ] Collect button triggers Google News RSS fetch
- [ ] Pipeline stats show funnel visualization after completion
- [ ] Config bar shows max articles (editable), title similarity (read-only), LLM (read-only)
- [ ] Auto-navigates to Step 2 on completion

### Step 2: Score
- [ ] Scoring auto-triggers when entering Step 2 with new run
- [ ] Progress bar with spinner shows during scoring
- [ ] Scored articles table displays with all 7 columns + dismiss button
- [ ] Score badges are color-coded by band
- [ ] Signal type badges are color-coded
- [ ] FlytBase mentioned flag shows for relevant articles
- [ ] Filters work: signal type, country, sort by score/date
- [ ] Min score threshold is editable — changes re-filter without re-scoring
- [ ] Dropped articles section is collapsible (collapsed by default)
- [ ] Dropped articles show title, reason, score
- [ ] Cross-language duplicates appear in dropped section with explanation
- [ ] User can dismiss articles from Step 2 (prevents flow to Step 3)
- [ ] Past run selector dropdown shows previous runs

### Step 3: Queue
- [ ] Shows only `new` status articles
- [ ] Articles from all runs appear in one unified queue
- [ ] Same article appears only once regardless of how many runs found it
- [ ] Expand chevron opens article drawer below the row
- [ ] Drawer shows: summary, metadata, persons, entities, source info
- [ ] Editable Slack message field pre-filled with summary
- [ ] "Slack Internally" posts to #dock-radar and updates status
- [ ] "Bookmark" updates status and moves to Saved section
- [ ] "Dismiss" updates status and hides forever
- [ ] "Open Article" opens original URL in new tab
- [ ] Bulk dismiss with multi-select works
- [ ] Sent section shows shared articles (collapsible)
- [ ] Saved section shows bookmarked articles (collapsible)
- [ ] Previously dismissed articles never reappear even from new runs

### Smart Memory
- [ ] Second run with same keywords: most articles already scored (cached)
- [ ] Second run: only new articles get scored by GPT-4o
- [ ] Score is consistent — same article always shows same score

### Slack Integration
- [ ] Message posts to #dock-radar channel
- [ ] Block Kit format with company header, fields, summary, link
- [ ] User can edit message before sending
- [ ] Non-English articles use English summary in Slack message

---

## 13. Future Phase Interfaces

### Phase 2 Extension Points
- `sources/linkedin.ts` — new SourceModule, one import line in collect orchestrator
- `enriched_contacts` table — linked to scored_articles
- `opportunity_packs` table — deep-dive enrichment
- Enrichment edge function using Jina AI + GPT-4o
- LLM selector dropdown enabled in UI
- Competitor detection (DroneSense, etc.) in scoring prompt

### Phase 3 Extension Points
- `send-email` edge function
- `pending_approvals` table
- Slack approval workflow → auto-send email
- Email templates with industry/region awareness

---

## 14. Non-Functional Requirements

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
