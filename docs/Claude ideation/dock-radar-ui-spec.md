# Dock Radar — Complete UI/UX Specification

## Product Overview
Dock Radar is a social listening & BD intelligence tool for FlytBase (a drone autonomy software company). It scans news sources for drone deployment opportunities, scores them with AI, and presents a queue of actionable signals for the BD team.

## Tech Stack
- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui (Radix primitives)
- Inter font (Google Fonts)
- Supabase (Postgres + Edge Functions) backend

---

## Design System

### Colors
| Token | Hex | Usage |
|-------|-----|-------|
| Primary (FlytBase Blue) | #2C7BF2 | Buttons, links, active states, brand |
| Primary Hover | #1B6AE0 | Button hover |
| Primary Light | #EBF2FE | Pill backgrounds, active row highlight |
| Accent Gold | #FFAB49 | Bookmark actions, highlights |
| Background | #FFFFFF | Page background |
| Surface | #F9FAFB | Config bars, pipeline stats bg |
| Border | #E5E7EB | All borders (gray-200) |
| Text Primary | #111827 | Headings, article titles |
| Text Secondary | #374151 | Body text |
| Text Muted | #6B7280 | Labels, hints |
| Text Disabled | #9CA3AF | Disabled states, placeholders |

### Score Badge Colors
| Range | Label | Background | Text |
|-------|-------|-----------|------|
| 90-100 | Hot Lead | #F0FDF4 | #16A34A |
| 70-89 | Strong Signal | #DBEAFE | #2563EB |
| 50-69 | Moderate | #FEFCE8 | #CA8A04 |
| 30-49 | Background | #F3F4F6 | #6B7280 |
| 0-29 | Noise | #F3F4F6 | #9CA3AF |

### Signal Type Badge Colors
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

### Typography
- Font: Inter (400, 500, 600, 700)
- Base: 14px
- Headings: 18px (navbar title), 15px (section titles), 13px (labels)
- Small: 12px (meta text, badges), 11px (hints, config labels, uppercase headers)

### Spacing & Layout
- Max content width: 1280px, centered
- Page padding: 32px horizontal, 24px vertical
- Card border-radius: 12px
- Button border-radius: 6-8px
- Badge border-radius: 4-6px
- Card shadow: none (border only: 1px solid gray-200)

---

## Page Structure

### Global: Navbar (sticky, top: 0)
```
Height: ~53px
Background: white
Border: bottom 1px solid gray-200
Layout: flex, space-between
Left: Logo icon (28x28, blue rounded square with "DR") + "Dock Radar" (18px, blue, bold) + subtitle "Social Listening & BD Intelligence" (12px, gray)
Right: "Phase 1" badge (11px, gray bg) + "FlytBase" text (13px, gray)
```

### Global: Step Tabs (sticky, top: 53px)
```
Height: ~48px
Background: white
Border: bottom 1px solid gray-200
Padding: 0 32px
Layout: flex, gap 0
Tabs: "Collect" | "Score" | "Queue"
Each tab: padding 14px 24px, 14px font, 500 weight
Active: blue text, 2px blue bottom border, filled dot
Inactive: gray-400 text, empty dot
Queue tab: shows count badge (e.g., "8") in blue circle
Score tab: disabled (grayed) until collection completes
Queue tab: always enabled (persistent queue)
```

---

## Step 1: Collect

### Config Bar
```
Background: gray-50
Border: bottom 1px gray-200
Padding: 10px 32px
Layout: flex, items-center, gap 24px
Items:
  - "Max articles" + input (number, value=50, width 50px)
  - Divider (1px gray-200, height 20px)
  - "Title similarity" + readonly badge "0.80"
  - Divider
  - "LLM" + readonly badge "GPT-4o"
```

### Main Content (within card, 12px border-radius, 24px padding)

#### Keywords Section
```
Label: "Keywords" (13px, 500 weight, gray-700)
Input: Pill-based input container
  - Border: 1px gray-300, rounded 8px
  - Padding: 8px 12px
  - Focus: blue border + blue shadow ring
  - Pills: blue-light bg, blue text, 13px, 500 weight, 6px radius
  - Each pill has "x" remove button
  - Placeholder: "Type keyword + Enter..." (gray-400)
Hint below: italic, 11px, gray-400: "Each keyword is searched as an exact phrase"
Full width
```

#### Form Grid (2 columns, 20px gap)

**Left: Date Range**
```
Label: "Date Range"
Layout: flex row
  - Number input (value=14, width 60px, centered text)
  - "days" label
  - Preset buttons: 7, 14, 30, 60, 90
    - Default style: gray-100 bg, gray-600 text, 12px
    - Active: blue-light bg, blue text
    - Clicking a preset updates the number input
```

**Right: Regions**
```
Label: "Search In (Google News Editions)"
Layout: flex wrap, 8px gap
Chips: padding 6px 14px, 12px font, border 1px gray-300, rounded 8px
  - Default: white bg, gray text
  - Selected: blue-light bg, blue border, blue text, checkmark shown
  - Hover: blue border
Available: US, India, EU, Brazil, UK, Australia, Singapore, Japan
Default selected: US, India, EU
```

#### Collect Button
```
Centered (margin auto)
Background: blue
Color: white
Padding: 12px 32px
Font: 14px, 600 weight
Border-radius: 8px
Icon: search icon (16x16) left of text
Hover: darker blue
Text: "Collect News"
```

#### Pipeline Stats (shown after collection completes)
```
Container: gray-50 bg, 1px gray-200 border, 10px radius, 20px 24px padding
Title: "Collection Pipeline" (13px, 600 weight)
Flow: 4 stages in a row with arrows between
  - Each stage: count (22px, 700 weight, blue) + label below (11px, gray-500)
  - Stages: Fetched (42) -> After Dedup (38) -> Date Filtered (35) -> Stored (35, green)
  - Arrows: gray-300, right arrow character
Progress bar: 6px height, gray-200 bg, blue fill, 3px radius
Summary text: 13px, gray-600, centered: "35 articles ready for scoring - 4 duplicates removed - 3 outside date range"
```

---

## Step 2: Score

### Config Bar
```
Same style as Step 1
Items:
  - "Min score" + input (number, value=50, editable)
  - Divider
  - "Summary similarity" + readonly "0.75"
  - Divider
  - "LLM" + readonly "GPT-4o"
  - Divider
  - "Run" + dropdown select (min-width 320px)
    Options: "Mar 14, 2:30 PM -- DJI Dock, drone inspection" etc.
```

### Scoring Progress (shown while scoring is in progress)
```
Container: gray-50 bg, 1px gray-200 border, 8px radius, 16px 20px padding
Layout: flex, items-center, 16px gap
  - Spinner: 18x18, 2px border, gray-200 bottom/sides, blue top, spinning
  - Progress bar: flex 1, 8px height, gray-200 bg, blue fill
  - Text: "Scoring... 24 / 35 articles" (13px, gray-600)
Hidden once scoring completes.
```

### Scored Articles Table
```
Header row: flex, space-between
  Left: "Scored Articles" (15px, 600) + "(20 relevant)" (gray-500, 400 weight)
  Right: filter dropdowns
    - "All Signals" dropdown
    - "All Countries" dropdown
    - "Sort: Score" dropdown

Table: full width, border-collapse
  TH: 11px, 600 weight, gray-500, uppercase, 0.05em letter-spacing, bottom border
  TD: 12px padding, gray-100 bottom border
  Row hover: gray-50 bg

Columns:
  1. Score (60px) - Score badge component
  2. Article (flex) - Title as link (gray-800, 500 weight, hover blue) + publisher line below (12px, gray-400, includes source badge)
  3. Company (140px) - Text
  4. Country (100px) - Text
  5. Signal (110px) - Signal badge
  6. Use Case (80px) - Text
  7. FB (40px) - FlytBase mentioned flag (blue dot if yes, gray dash if no)
```

### Dropped Articles Section
```
Container: 1px gray-200 border, 10px radius, margin-top 24px
Header: gray-50 bg, 12px 16px padding, clickable
  Left: triangle icon + "Dropped by AI (15 articles)" (13px, 500 weight, gray-600)
  Right: "Click to expand" (11px, gray-400)
Body (collapsed by default):
  - Border-top: 1px gray-200
  - Each item: flex row, 10px 16px padding, gray-100 bottom border
    - Title (gray-700, flex 1)
    - Reason (gray-400, italic, max-width 300px, right aligned)
    - Score (gray-400, 11px, min-width 50px, right aligned)
  - Cross-language dupes show: "Cross-language duplicate of '[title]' (Gate 2)"
```

---

## Step 3: Queue (Action Inbox)

### Queue Header
```
Layout: flex, space-between
Left: "Signal Queue" (15px, 600) + "(8 new articles to review)" (gray-500)
Right: action buttons
  - "Select All" with checkbox (outline button style)
  - "Bulk Dismiss" (outline button, red/danger variant)
```

### Queue Table
```
Same table style as Step 2 but with:
Columns:
  1. Checkbox (30px) - row selection checkbox
  2. Expand (20px) - triangle toggle, rotates 90deg when open
  3. Article (flex) - title + publisher + source badge
  4. Company (140px)
  5. Country (100px)
  6. Signal (110px) - signal badge
  7. Score (60px) - score badge

Row behavior:
  - Click expand toggle: opens/closes drawer below that row
  - Active row: blue-light background
  - Hover: gray-50 background
```

### Article Drawer (inline accordion below row)
```
Spans full table width (colspan all columns)
Background: gray-50
Border: none (inherits from table)
Padding: 20px 24px

Layout: 2-column grid (2fr 1fr, 24px gap)

LEFT COLUMN:
  Summary:
    - 14px, line-height 1.6, gray-700
    - 1-3 sentences from LLM
    - Margin-bottom 16px

  Meta grid (flex wrap, 16px gap):
    Each item: label (12px, gray-400) + value (gray-700, 500 weight)
    Items: Company, Location (city + country), Use Case, Signal (badge), Score (badge + label), FlytBase (flag)

  People Mentioned:
    Section title: 12px, 600 weight, gray-500, uppercase, 0.05em spacing
    Each person: flex row
      - Avatar circle: 28x28, blue-light bg, blue text, initials, 11px
      - Name: 13px, 500 weight, gray-800
      - Role: 12px, gray-500, format "Role - Organization"

RIGHT COLUMN:
  Organizations:
    Section title: same as above
    Each entity: inline-flex pill
      - White bg, 1px gray-200 border, 6px radius
      - Name (bold) + type label (10px, gray-400, uppercase)
      Types: buyer, operator, regulator, partner, si, oem

  Source:
    Section title: same
    Text: Source badge + Publisher + "Published [date]" (13px, gray-600)

BOTTOM (full width):
  Slack Compose Box:
    Container: white bg, 1px gray-200 border, 8px radius, 12px padding
    Label: chat icon + "Message to #dock-radar" (11px, gray-400)
    Textarea: full width, 1px gray-200 border, 6px radius, 10px padding
      - Pre-filled with summary text
      - Min-height: 60px, resizable
      - Focus: blue border + blue shadow ring

  Action Buttons (flex row, 10px gap, 16px top padding, gray-200 top border):
    1. "Slack Internally" - PRIMARY button (blue bg, white text, send icon)
    2. "Bookmark" - outline button (gold border, brown text, star icon)
    3. "Dismiss" - outline button (red border, red text, x icon)
    4. "Open Article" - outline button (gray border, gray text, external link icon)
```

### Sent Section (below queue table)
```
Collapsible container: 1px gray-200 border, 8px radius, 16px top margin
Header: "Sent to Slack (3 articles)" with triangle toggle (13px, 500 weight, gray-500)
Body (collapsed by default): list of sent articles with timestamp
```

### Saved Section
```
Same as Sent but: "Bookmarked (1 article)"
```

---

## Component Inventory

| Component | Location | Props | Max Lines |
|-----------|----------|-------|-----------|
| Navbar | layout/Navbar.tsx | none | 40 |
| StepTabs | layout/StepTabs.tsx | activeStep, onTabChange, step2Enabled, queueCount | 60 |
| ConfigBar | layout/ConfigBar.tsx | items[] (label, value, editable, readonly) | 80 |
| KeywordInput | collect/KeywordInput.tsx | keywords[], onAdd, onRemove | 80 |
| DateFilter | collect/DateFilter.tsx | days, onChange, presets[] | 60 |
| RegionSelector | collect/RegionSelector.tsx | selected[], onChange, regions[] | 80 |
| CollectPanel | collect/CollectPanel.tsx | onComplete(run) | 200 |
| CollectionStats | collect/CollectionStats.tsx | pipeline stats object | 80 |
| ScorePanel | score/ScorePanel.tsx | run, onComplete(articles) | 200 |
| ScoredTable | score/ScoredTable.tsx | articles[], filters, sort | 150 |
| ScoreFilters | score/ScoreFilters.tsx | onSignalFilter, onCountryFilter, onSort | 60 |
| ScoreBadge | score/ScoreBadge.tsx | score (number) | 20 |
| DroppedArticles | score/DroppedArticles.tsx | droppedArticles[] | 100 |
| QueuePanel | queue/QueuePanel.tsx | none (fetches own data) | 200 |
| QueueTable | queue/QueueTable.tsx | articles[], onAction | 150 |
| ArticleDrawer | queue/ArticleDrawer.tsx | article, scoredData, onAction | 200 |
| ArticleDetail | queue/ArticleDetail.tsx | summary, meta, persons, entities | 150 |
| SlackSendButton | queue/SlackSendButton.tsx | article, onSend | 80 |
| ArticleActions | queue/ArticleActions.tsx | onSlack, onBookmark, onDismiss, onOpen | 40 |
| Dashboard | pages/Dashboard.tsx | none (orchestrates steps) | 100 |

---

## Interaction Patterns

### Step Navigation
- Tabs are clickable. "Collect" always available. "Score" enabled after collection. "Queue" always available.
- After "Collect News" completes: auto-navigate to Score tab.
- Scoring auto-triggers when Score tab loads with new run data.

### Queue Actions
- "Slack Internally": opens editable message (pre-filled), user clicks to send
- "Bookmark": immediately moves to Saved section, no confirmation
- "Dismiss": immediately hides from queue, no confirmation (soft delete)
- "Bulk Dismiss": select multiple rows via checkboxes, click "Bulk Dismiss"
- "Open Article": opens original URL in new browser tab

### Config Changes
- Editable configs update immediately (debounced 300ms)
- Changing "Min score" re-filters the scored table without re-scoring
- Changing "Max articles" affects the next collection run only

### Loading States
- Collect button: shows spinner + "Collecting..." during fetch
- Score tab: shows progress bar + spinner during scoring
- Slack send: button shows spinner + "Sending..." then success checkmark

### Empty States
- Score tab with no run: "Run a collection first to see scored articles"
- Queue with no new articles: "All caught up! No new signals to review."
- Queue sections (Sent/Saved): hidden if empty

---

## Responsive Behavior
- Max-width 1280px, centered
- Below 768px: form grid stacks to single column, table horizontally scrolls
- Drawer grid stacks to single column below 768px

---

## Data Types (TypeScript Reference)

```typescript
interface Run {
  id: string;
  keywords: string[];
  sources: string[];
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
  source: 'google_news' | 'linkedin' | 'facebook';
  title: string;
  url: string;
  normalized_url: string;
  snippet: string | null;
  publisher: string | null;
  published_at: string | null;
  created_at: string;
}

interface ScoredArticle {
  id: string;
  article_id: string;
  relevance_score: number;
  company: string | null;
  country: string | null;
  city: string | null;
  use_case: string | null;
  signal_type: 'DEPLOYMENT' | 'CONTRACT' | 'TENDER' | 'PARTNERSHIP' | 'EXPANSION' | 'FUNDING' | 'REGULATION' | 'OTHER';
  summary: string | null;
  flytbase_mentioned: boolean;
  persons: Person[];
  entities: Entity[];
  drop_reason: string | null;
  is_duplicate: boolean;
  status: 'new' | 'shared' | 'dismissed' | 'bookmarked';
  dismissed_at: string | null;
  shared_at: string | null;
  bookmarked_at: string | null;
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

// Combined view for display
interface ArticleWithScore {
  article: Article;
  scored: ScoredArticle;
}
```
