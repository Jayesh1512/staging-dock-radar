# Dock Radar — Phase 1 UI Component Build Prompt

> Use this prompt in an IDE (Cursor, Windsurf, Lovable, etc.) to generate the complete Phase 1 frontend.
> This prompt covers UI components ONLY. Backend (Supabase Edge Functions) will be built separately.

---

## INSTRUCTIONS

Build a React + TypeScript application called **Dock Radar** — a social listening and BD intelligence tool for FlytBase.

**Tech stack**:
- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui (use `npx shadcn@latest init` then add components as needed)
- React Router v6 for routing
- TanStack React Query for data fetching
- Lucide React for icons
- Sonner for toast notifications
- Inter font from Google Fonts (all weights)
- Supabase JS SDK for backend calls (mocked for now)

**Design**:
- White background SaaS design, clean and professional
- Primary color: FlytBase Blue #2C7BF2
- Accent: Warm Gold #FFAB49
- Font: Inter everywhere
- Borders: 1px solid #E5E7EB (gray-200)
- Cards: 12px border-radius, no shadow (border only)
- Buttons: 6-8px border-radius
- Max content width: 1280px, centered
- Page padding: 32px horizontal, 24px vertical

**IMPORTANT**: Use mock data throughout. Do NOT connect to any real backend. Create a `src/lib/mock-data.ts` file with realistic sample data for all components.

---

## FILE STRUCTURE

```
src/
  main.tsx
  App.tsx
  index.css                    # Tailwind + custom theme variables

  lib/
    utils.ts                   # cn() helper for Tailwind class merging
    types.ts                   # All TypeScript interfaces and types
    constants.ts               # Signal types, colors, labels, region config, defaults
    mock-data.ts               # Mock articles, scored articles, runs for development
    supabase.ts                # Supabase client (placeholder, not connected yet)

  hooks/
    use-collect.ts             # Mock collection mutation
    use-score.ts               # Mock scoring with simulated SSE progress
    use-articles.ts            # Query hooks returning mock data
    use-slack.ts               # Mock Slack send mutation

  components/
    ui/                        # shadcn/ui primitives (install as needed)

    layout/
      Navbar.tsx               # Top navigation bar with FlytBase branding
      StepTabs.tsx             # Horizontal tab navigation (Collect | Score | Queue)
      ConfigBar.tsx            # Configurable parameter bar

    collect/
      CollectPanel.tsx         # Step 1: main panel
      KeywordInput.tsx         # Pill-based keyword input
      DateFilter.tsx           # Combo dropdown + editable number input
      RegionSelector.tsx       # Grouped hierarchical region picker
      CollectionStats.tsx      # Pipeline funnel visualization

    score/
      ScorePanel.tsx           # Step 2: main panel
      ScoredTable.tsx          # Scored articles data table
      ScoreFilters.tsx         # Signal type, country, sort dropdowns
      ScoreBadge.tsx           # Color-coded score badge component
      DroppedArticles.tsx      # Collapsible dropped articles section

    queue/
      QueuePanel.tsx           # Step 3: main panel (action inbox)
      QueueTable.tsx           # Articles table with expand triggers
      ArticleDrawer.tsx        # Expandable inline drawer per row
      ArticleDetail.tsx        # Article detail content inside drawer
      SlackCompose.tsx         # Editable Slack message textarea
      ArticleActions.tsx       # Action buttons (Slack/Bookmark/Dismiss/Open)

  pages/
    Dashboard.tsx              # Main page orchestrating all 3 steps
    NotFound.tsx               # 404 page
```

---

## TYPES (src/lib/types.ts)

```typescript
export type SignalType = 'DEPLOYMENT' | 'CONTRACT' | 'TENDER' | 'PARTNERSHIP' | 'EXPANSION' | 'FUNDING' | 'REGULATION' | 'OTHER';
export type ArticleStatus = 'new' | 'shared' | 'dismissed' | 'bookmarked';
export type ArticleSource = 'google_news' | 'linkedin' | 'facebook';

export interface Run {
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

export interface Article {
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

export interface Person {
  name: string;
  role: string;
  organization: string;
}

export interface Entity {
  name: string;
  type: 'buyer' | 'operator' | 'regulator' | 'partner' | 'si' | 'oem';
}

export interface ScoredArticle {
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

export interface ArticleWithScore {
  article: Article;
  scored: ScoredArticle;
}

export interface PipelineStats {
  totalFetched: number;
  afterDedup: number;
  afterDateFilter: number;
  stored: number;
  dedupRemoved: number;
}

export interface ConfigItem {
  label: string;
  value: string | number;
  editable: boolean;
  type: 'number' | 'text' | 'select';
  onChange?: (value: string | number) => void;
}

export interface RegionGroup {
  name: string;
  countries: { code: string; label: string }[];
}
```

---

## CONSTANTS (src/lib/constants.ts)

```typescript
export const SIGNAL_TYPES: SignalType[] = ['DEPLOYMENT', 'CONTRACT', 'TENDER', 'PARTNERSHIP', 'EXPANSION', 'FUNDING', 'REGULATION', 'OTHER'];

export const SIGNAL_LABELS: Record<SignalType, string> = {
  DEPLOYMENT: 'Deployment',
  CONTRACT: 'Contract',
  TENDER: 'Tender',
  PARTNERSHIP: 'Partnership',
  EXPANSION: 'Expansion',
  FUNDING: 'Funding',
  REGULATION: 'Regulation',
  OTHER: 'Other',
};

export const SIGNAL_COLORS: Record<SignalType, { bg: string; text: string }> = {
  DEPLOYMENT: { bg: '#DCFCE7', text: '#166534' },
  CONTRACT:   { bg: '#DBEAFE', text: '#1E40AF' },
  TENDER:     { bg: '#F3E8FF', text: '#6B21A8' },
  PARTNERSHIP:{ bg: '#FFF7ED', text: '#C2410C' },
  EXPANSION:  { bg: '#FEF9C3', text: '#A16207' },
  FUNDING:    { bg: '#CFFAFE', text: '#0E7490' },
  REGULATION: { bg: '#FEE2E2', text: '#991B1B' },
  OTHER:      { bg: '#F3F4F6', text: '#4B5563' },
};

export const SCORE_BANDS = [
  { min: 90, max: 100, label: 'Hot Lead',    bg: '#F0FDF4', text: '#16A34A' },
  { min: 70, max: 89,  label: 'Strong',      bg: '#DBEAFE', text: '#2563EB' },
  { min: 50, max: 69,  label: 'Moderate',    bg: '#FEFCE8', text: '#CA8A04' },
  { min: 30, max: 49,  label: 'Background',  bg: '#F3F4F6', text: '#6B7280' },
  { min: 0,  max: 29,  label: 'Noise',       bg: '#F3F4F6', text: '#9CA3AF' },
];

export const REGION_GROUPS: RegionGroup[] = [
  {
    name: 'Americas',
    countries: [
      { code: 'US', label: 'US' },
      { code: 'CA', label: 'Canada' },
      { code: 'BR', label: 'Brazil' },
      { code: 'MX', label: 'Mexico' },
    ],
  },
  {
    name: 'Europe',
    countries: [
      { code: 'GB', label: 'UK' },
      { code: 'DE', label: 'Germany' },
      { code: 'FR', label: 'France' },
      { code: 'IT', label: 'Italy' },
    ],
  },
  {
    name: 'Asia Pacific',
    countries: [
      { code: 'IN', label: 'India' },
      { code: 'SG', label: 'Singapore' },
      { code: 'JP', label: 'Japan' },
      { code: 'AU', label: 'Australia' },
      { code: 'KR', label: 'South Korea' },
    ],
  },
  {
    name: 'Middle East & Africa',
    countries: [
      { code: 'AE', label: 'UAE' },
      { code: 'SA', label: 'Saudi Arabia' },
      { code: 'ZA', label: 'South Africa' },
    ],
  },
];

export const DATE_PRESETS = [7, 14, 30, 60, 90];

export const DEFAULTS = {
  maxArticles: 50,
  filterDays: 30,
  minScore: 50,
  titleSimilarity: 0.80,
  summarySimilarity: 0.75,
  llmModel: 'GPT-4o',
};
```

---

## MOCK DATA (src/lib/mock-data.ts)

Create at least 8 realistic mock scored articles with proper data. Here are the articles to mock:

1. **Port of Santos** — Score: 92, Brazil, DEPLOYMENT, Port Security. 2 persons: Carlos Silva (Port Director), Ana Ferreira (Head of Ops). Entities: Port of Santos (buyer), DroneOps Brazil (operator), Min. of Transport (regulator), DJI (oem).

2. **Enel Green Power** — Score: 90, Italy, CONTRACT, Power Line Inspection. 1 person: Maria Rossi (VP Infrastructure). Entities: Enel Green Power (buyer), SkyInspect EU (partner).

3. **Indian Railways** — Score: 85, India, DEPLOYMENT, Rail Survey. flytbase_mentioned: true. 2 persons: Rajesh Kumar (Director Tech), Priya Sharma (Drone Program Lead). Entities: Indian Railways (buyer), FlytBase (partner), DJI (oem).

4. **Votorantim Mining** — Score: 78, Brazil, DEPLOYMENT, Mining Survey. 1 person: Fernando Costa (Operations Head). Entities: Votorantim (buyer), DroneOps Brazil (operator).

5. **MPA Singapore** — Score: 72, Singapore, TENDER, Maritime Surveillance. Entities: MPA Singapore (buyer).

6. **SE Asian Ports Expansion** — Score: 61, Indonesia, EXPANSION, Port Security. No company, no persons. Generic sector signal.

7. **DGCA India Regulation** — Score: 55, India, REGULATION. No company. Entities: DGCA India (regulator).

8. **Australian Mining Consortium** — Score: 52, Australia, PARTNERSHIP, Mining Survey. 1 person. Entities: BHP (buyer), Fortescue (buyer), AeroDrone AU (si).

Also create 5 mock dropped articles:
- "DJI Releases New Firmware Update for Dock 2" — score 12, OEM marketing
- "Top 5 Drones for Photography in 2026" — score 8, Consumer review
- "Porto de Santos implanta DJI Dock 2..." — score 71, Cross-language duplicate of #1
- "Drone Stock Analysis: DJI vs Skydio" — score 15, Stock analysis
- "Opinion: Why Autonomous Drones Will Change Logistics" — score 22, Opinion piece

Also create 2 mock past runs:
- Run 1: "Mar 14, 2:30 PM — DJI Dock, drone inspection" (current)
- Run 2: "Mar 13, 10:15 AM — DJI Dock"

---

## COMPONENT SPECIFICATIONS

### 1. Navbar (layout/Navbar.tsx)
- Sticky at top (z-index 100), white bg, 1px bottom border gray-200
- Left: Logo icon (28x28 rounded square, blue bg, white "DR" text) + "Dock Radar" (18px, blue, bold) + "Social Listening & BD Intelligence" (12px, gray-500)
- Right: "Phase 1" badge (11px, gray-100 bg, gray-500 text, 10px radius pill) + "FlytBase" text (13px, gray-400)
- Height: ~53px, padding: 12px 32px

### 2. StepTabs (layout/StepTabs.tsx)
Props: `activeStep: 1|2|3, onTabChange: (step) => void, step2Enabled: boolean, queueCount: number`
- Sticky below navbar (top: 53px, z-index 99), white bg, 1px bottom border
- 3 tabs: "Collect" | "Score" | "Queue"
- Each tab: 14px font, 500 weight, 14px 24px padding, flex row with gap 8px
- Tab has a dot indicator (8x8 circle): empty border when inactive, filled when active
- Active tab: blue text, 2px blue bottom border
- Inactive: gray-400 text, transparent border
- Score tab: grayed out + cursor-not-allowed when `step2Enabled=false`
- Queue tab: always enabled, shows blue count badge when `queueCount > 0`

### 3. ConfigBar (layout/ConfigBar.tsx)
Props: `items: ConfigItem[]`
- Light gray bg (gray-50), 1px bottom border, 10px 32px padding
- Flex row, items-center, gap 24px, flex-wrap
- Each item: label (12px, gray-400) + value display
  - Editable number: `<input type="number" />` with border, 50px width, 12px font, centered
  - Read-only: gray-100 bg pill with gray-500 text, 11px font
  - Select: `<select>` with border, 12px font
- Vertical dividers (1px gray-200, 20px height) between items

### 4. KeywordInput (collect/KeywordInput.tsx)
Props: `keywords: string[], onAdd: (keyword: string) => void, onRemove: (index: number) => void`
- Container: 1px gray-300 border, 8px radius, 8px 12px padding, flex-wrap, min-height 42px
- Focus: blue border + `ring-2 ring-blue-100`
- Each keyword is a pill: blue-light bg (#EBF2FE), blue text, 13px, 500 weight, 4px 10px padding, 6px radius
- Pill has X button (opacity 0.6, hover 1.0) to remove
- Input field for typing (no border, transparent bg, flex-grow)
- Press Enter or comma to add keyword
- Hint below: "Each keyword is searched as an exact phrase (e.g., 'DJI Dock' stays together)" — 11px, gray-400, italic

### 5. DateFilter (collect/DateFilter.tsx)
Props: `days: number, onChange: (days: number) => void`
- Flex row, items-center, gap 8px
- Number input: 60px wide, 8px radius border, centered text, 13px
- "days" label: gray-500, 13px
- Preset buttons row (gap 4px): 7, 14, 30, 60, 90
  - Each: 4px 10px padding, 6px radius, 12px font
  - Default: gray-100 bg, gray-600 text
  - Active (matches current value): blue-light bg, blue text
  - Clicking a preset updates the number input value

### 6. RegionSelector (collect/RegionSelector.tsx)
Props: `selected: string[], onChange: (selected: string[]) => void`
- Use a Popover (shadcn Popover) triggered by a button showing count: "Regions (5 selected)"
- Inside popover (min-width 320px, max-height 400px, scrollable):
  - Top: "Global" checkbox — checking selects ALL, unchecking deselects ALL
  - For each RegionGroup from constants:
    - Continent header row: checkbox + bold group name (13px, 600 weight, gray-700)
    - Checking continent selects all its countries
    - Indented country rows below (padding-left 24px): checkbox + country label (13px, gray-600)
    - Deselecting a country unchecks the continent checkbox but keeps other countries selected
    - Continent checkbox shows indeterminate state when some (not all) countries selected
  - Separator line between groups
- Button shows chip/pill of count: "5 regions" when collapsed

### 7. CollectPanel (collect/CollectPanel.tsx)
Props: `onComplete: (run: Run, stats: PipelineStats) => void`
- Card container: white bg, 1px gray-200 border, 12px radius, 24px padding
- Contains: KeywordInput (full width), then form grid (2 columns, 20px gap) with DateFilter left and RegionSelector right
- Collect button centered below: blue bg, white text, 12px 32px padding, 8px radius, 14px font, 600 weight
  - Icon: Search icon (Lucide `Search`) left of text
  - Text: "Collect News"
  - Hover: darker blue
  - Loading state: spinner icon + "Collecting..." text, disabled
- After collection: show CollectionStats component below button
- On complete: call onComplete callback

### 8. CollectionStats (collect/CollectionStats.tsx)
Props: `stats: PipelineStats`
- Container: gray-50 bg, 1px gray-200 border, 10px radius, 20px 24px padding
- Title: "Collection Pipeline" (13px, 600 weight, gray-700)
- Pipeline flow: 4 stages in a flex row
  - Each stage: large count (22px, 700 weight, blue) + label below (11px, gray-500)
  - Stages: "Fetched" → "After Dedup" → "Date Filtered" → "Stored" (Stored count in green)
  - Arrow characters between stages (gray-300, 18px)
- Progress bar below: 6px height, gray-200 bg, blue fill (width = stored/fetched percentage), 3px radius
- Summary text: centered, 13px, gray-600: "[stored] articles ready for scoring - [dedupRemoved] duplicates removed"

### 9. ScorePanel (score/ScorePanel.tsx)
Props: `run: Run | null, onScoreComplete: (articles: ArticleWithScore[]) => void`
- If no run: show empty state "Run a collection first to see scored articles" (centered, gray-400)
- Scoring progress bar (visible during scoring):
  - Container: gray-50 bg, 1px gray-200 border, 8px radius, 16px 20px padding
  - Flex row: spinner (18x18 animated) + progress bar (flex-1, 8px height) + text "Scoring... X/Y articles"
  - Hidden when scoring completes
- Below: table header row (flex, space-between):
  - Left: "Scored Articles" (15px, 600 weight) + count "(20 relevant)" (gray-500)
  - Right: ScoreFilters component
- Below: ScoredTable component
- Below: DroppedArticles component
- Simulate scoring progress with a timer (increment every 200ms) using mock data

### 10. ScoredTable (score/ScoredTable.tsx)
Props: `articles: ArticleWithScore[], filters: {signal, country, sort}, onDismiss: (articleId: string) => void`
- Full-width table using shadcn Table component
- Header row: Score | Article | Company | Country | Signal | Use Case | FB | (dismiss)
  - TH styling: 11px, 600 weight, gray-500, uppercase, 0.05em letter-spacing
- Data rows:
  - Score: ScoreBadge component (40x28px colored badge)
  - Article: title as link (gray-800, 500 weight, hover blue, truncate with ellipsis), publisher line below (12px, gray-400) with source badge and date
  - Company: text or dash if null
  - Country: text or dash if null
  - Signal: colored badge (inline-block, 3px 8px padding, 4px radius, 11px font, 600 weight). Colors from SIGNAL_COLORS constant.
  - Use Case: text or dash
  - FB: small indicator — blue circle with "FB" text (9px) if flytbase_mentioned, gray dash otherwise
  - Dismiss: X icon button (Lucide `X`, 16px, gray-400, hover red) — clicking calls onDismiss
- Row hover: gray-50 bg
- Apply filters: signal type filters rows, country filters rows, sort reorders rows

### 11. ScoreBadge (score/ScoreBadge.tsx)
Props: `score: number`
- 40px wide, 28px height, 6px radius
- Use SCORE_BANDS to find matching band for the score
- Renders: colored background + bold score number (13px, 700 weight)

### 12. ScoreFilters (score/ScoreFilters.tsx)
Props: `onSignalFilter, onCountryFilter, onSort`
- Flex row, gap 8px
- 3 select dropdowns: "All Signals" (lists all signal types), "All Countries" (dynamic from data), "Sort: Score" / "Sort: Date"
- Select styling: 1px gray-300 border, 6px radius, 6px 12px padding, 12px font

### 13. DroppedArticles (score/DroppedArticles.tsx)
Props: `articles: ArticleWithScore[]` (articles with drop_reason or is_duplicate=true or status='dismissed')
- Container: 1px gray-200 border, 10px radius, margin-top 24px
- Collapsible (collapsed by default)
- Header: gray-50 bg, clickable, 12px 16px padding
  - Left: triangle icon (rotates when open) + "Dropped by AI (X articles)" (13px, 500 weight, gray-600)
  - Right: "Click to expand" (11px, gray-400)
- Body (shown when expanded):
  - Each item: flex row, 10px 16px padding, gray-100 bottom border
    - Title (gray-700, truncate)
    - Drop reason (gray-400, italic, right-aligned, max-width 300px)
    - Score (gray-400, 11px, right-aligned, min-width 50px): "Score: X"
    - Source badge (if applicable)
  - Cross-language dupe: reason shows "Cross-language duplicate of '[title]' (Gate 2)"
  - User-dismissed: reason shows "Dismissed by user"

### 14. QueuePanel (queue/QueuePanel.tsx)
- Fetches articles with `status = 'new'` from mock data
- Header: "Signal Queue" (15px, 600 weight) + count "(X new articles to review)" (gray-500)
- Right side of header: "Select All" checkbox button + "Bulk Dismiss" button (red outline variant)
- Below header: QueueTable
- Below table: collapsible "Sent to Slack (X articles)" section (for `status = 'shared'`)
- Below: collapsible "Bookmarked (X articles)" section (for `status = 'bookmarked'`)
- Hidden sections if count is 0

### 15. QueueTable (queue/QueueTable.tsx)
Props: `articles: ArticleWithScore[], selectedIds: Set<string>, onSelect, onToggleDrawer, onAction`
- Table columns: Checkbox | Expand | Article | Company | Country | Signal | Score
- Checkbox: 16px, accent-color blue
- Expand toggle: triangle character, gray-400, rotates 90deg when open
- When a row is expanded: highlight row with blue-light bg, show ArticleDrawer as next table row (colspan all)
- Only one drawer open at a time (clicking another row closes the current one)

### 16. ArticleDrawer (queue/ArticleDrawer.tsx)
Props: `article: ArticleWithScore, onAction: (action, articleId, message?) => void`
- Full-width table row (colspan all columns), gray-50 bg
- Inside: 20px 24px padding
- 2-column grid (2fr 1fr, 24px gap):

**Left column:**
- Summary text (14px, line-height 1.6, gray-700)
- Metadata grid (flex wrap, 16px gap) — each item: label (12px, gray-400) + value (13px, gray-700, 500 weight)
  - Company, Location (city + country), Use Case, Signal (badge), Score (badge + band label), FlytBase flag
- "People Mentioned" section:
  - Section title: 12px, 600 weight, gray-500, uppercase, 0.05em spacing, 16px top margin
  - Each person: flex row, 6px vertical padding
    - Avatar circle: 28x28, blue-light bg, blue text, initials (11px, 600 weight)
    - Name (13px, 500 weight, gray-800) + role line "Role - Organization" (12px, gray-500)

**Right column:**
- "Organizations" section:
  - Section title: same style
  - Entity pills: inline-flex, white bg, 1px gray-200 border, 6px radius, 4px 10px padding, 12px font
    - Name (bold) + type label (10px, gray-400, uppercase)
- "Source" section:
  - Source badge (yellow for Google News) + Publisher name + "Published [date]" (13px, gray-600)

**Bottom (full width):**
- SlackCompose component
- ArticleActions component
- Separator: 1px gray-200 top border, 16px top padding, 16px top margin

### 17. SlackCompose (queue/SlackCompose.tsx)
Props: `defaultMessage: string, onChange: (message: string) => void`
- Container: white bg, 1px gray-200 border, 8px radius, 12px padding, margin-top 12px
- Label: chat icon (Lucide `MessageSquare`, 14px) + "Message to #dock-radar" (11px, gray-400)
- Textarea: full width, 1px gray-200 border, 6px radius, 10px padding, 13px font, min-height 60px, resizable
  - Focus: blue border + ring-2 ring-blue-100
  - Pre-filled with article summary + source URL

### 18. ArticleActions (queue/ArticleActions.tsx)
Props: `onSlack, onBookmark, onDismiss, onOpenArticle`
- Flex row, gap 10px
- 4 buttons:
  1. "Slack Internally" — blue bg, white text, 8px 18px padding, 6px radius, 13px, 600 weight
     - Icon: Lucide `Send` (14px) left of text
     - On click: calls onSlack
  2. "Bookmark" — 1px gold (#FFAB49) border, brown text (#B45309), white bg
     - Icon: Lucide `Star` (14px)
     - Hover: #FFFBEB bg
  3. "Dismiss" — 1px red (#FCA5A5) border, red text (#EF4444), white bg
     - Icon: Lucide `X` (14px)
     - Hover: #FEF2F2 bg
  4. "Open Article" — 1px gray-300 border, gray-600 text, white bg
     - Icon: Lucide `ExternalLink` (14px)
     - Opens article.url in new tab

### 19. Dashboard (pages/Dashboard.tsx)
- State: `activeStep` (1|2|3), `currentRun` (Run|null), `scoredArticles` (ArticleWithScore[])
- Renders: Navbar + StepTabs + config bar (step-specific) + active step panel
- Step 1 config bar items: max articles (editable), title similarity (readonly 0.80), LLM (readonly GPT-4o)
- Step 2 config bar items: min score (editable), summary similarity (readonly 0.75), LLM (readonly GPT-4o), run selector (dropdown of past runs)
- Step 3: no config bar
- Step 1 completion: set currentRun, switch to step 2
- Step 2 completion: articles auto-flow to queue (update mock data statuses)
- Step 3: manages article status changes (shared/dismissed/bookmarked)

---

## CSS THEME (src/index.css)

Add to Tailwind base:
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --card: 0 0% 100%;
  --card-foreground: 222 47% 11%;
  --primary: 214 88% 56%;
  --primary-foreground: 0 0% 100%;
  --muted: 220 14% 96%;
  --muted-foreground: 220 8% 46%;
  --border: 220 13% 91%;
  --input: 220 13% 91%;
  --ring: 214 88% 56%;
  --radius: 0.5rem;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
```

---

## BEHAVIOR NOTES

1. **Tab navigation**: Clicking a tab switches the visible panel. No URL routing needed between tabs — manage with React state.
2. **Step 2 auto-trigger**: When switching to Step 2 with a currentRun, simulate scoring progress (start at 0, increment to total article count over ~3 seconds, then show results).
3. **Queue persistence**: Mock articles with `status = 'new'` show in queue. Actions update the status in local state. Dismissed articles disappear immediately.
4. **Drawer behavior**: Only one drawer open at a time in the queue table. Clicking expand on another row closes the current one.
5. **Bulk dismiss**: Select multiple checkboxes, click "Bulk Dismiss" to dismiss all selected. Show toast notification "X articles dismissed".
6. **Slack send**: Clicking "Slack Internally" shows toast "Sent to #dock-radar" and updates article status to 'shared'. Move to Sent section.
7. **Responsive**: Desktop-first (1280px max). Tables horizontally scroll below 768px. Form grid stacks to single column below 768px.

---

## WHAT NOT TO BUILD

- No real Supabase connection (mock everything)
- No real Google News fetching
- No real GPT-4o scoring
- No real Slack integration
- No authentication
- No settings page
- No trends/analytics page
- No email functionality

The goal is a pixel-perfect, interactive UI prototype with mock data that demonstrates the full user flow across all 3 steps.
