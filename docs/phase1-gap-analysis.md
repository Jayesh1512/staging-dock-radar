# Dock Radar Phase 1 — Gap Analysis & Resolutions

> Pre-build analysis covering state architecture, UX flow, type interfaces, component design, and behavior edge cases.
> Each gap includes the problem, recommended solution, and reasoning.
> Last updated: March 15, 2026 — includes all design decisions from extended review sessions.

---

## Category 1: State Architecture

---

### GAP 1 — Source of truth for article status mutations

**Problem:** The Dashboard manages `activeStep`, `currentRun`, and `scoredArticles` but article statuses (new → shared/dismissed/bookmarked) mutate across Steps 2 and 3. There's no defined owner for these mutations, meaning a Step 2 dismissal could fail to suppress the article in Step 3.

**Recommendation:** Dashboard owns a `articleStatuses: Map<string, ArticleStatus>` overlay on top of mock data. Both ScorePanel and QueuePanel read from this map and dispatch mutations up via callbacks. Single source of truth, no cross-panel state drift.

---

### GAP 2 — Min score filter prunes state vs. filters at render

**Problem:** If `minScore` is raised to 70 and articles scoring 50–69 are removed from state, lowering it back to 50 won't restore them — they're gone. The PRD says "re-filters without re-scoring" implying rehydration must work.

**Recommendation:** Dashboard keeps the full scored array in state always. `ScorePanel` receives `minScore` as a prop and filters at render time. Score threshold is a display filter, not a data mutation.

---

### GAP 3 — `expandedId` ownership in QueueTable

**Problem:** "Only one drawer open at a time" requires a single piece of state tracking which row is expanded. If this lives inside `QueueTable`, it's invisible to `QueuePanel` which needs to coordinate the Sent/Bookmarked sections.

**Recommendation:** `expandedId: string | null` lives in `QueuePanel`. Passed down to `QueueTable` as a prop alongside `onToggle`. One owner, no ambiguity.

---

## Category 2: UX Flow

---

### GAP 4 — Initial Queue state: pre-seeded or empty?

**Problem:** The app flow requires Collect → Score → Queue. If enforced strictly, the Queue is empty on first load and the app looks broken in demos. But pre-seeding breaks the stated sequential flow.

**Recommendation:** Queue pre-seeds with all 8 mock articles as `status='new'` on load. Steps 1→2→3 remain functional as "add more articles" flow. This makes the app immediately explorable and demo-ready without compromising the UX concept.

---

### GAP 5 — Past run selector behavior is undefined

**Problem:** The Step 2 config bar has a run selector dropdown. Switching runs could mean: re-trigger scoring, reload scored articles, or do nothing. None of these are specified.

**Recommendation:** Switching runs swaps the displayed scored articles table with that run's pre-baked mock data. No re-scoring animation. Scoring animation only triggers once — when landing on Step 2 for the first time in the session.

---

### GAP 6 — Post-action transitions are unspecified

**Problem:** After "Slack Internally", "Bookmark", or "Dismiss" in the drawer, the UX transition is undefined. Does the drawer close? Does the row disappear? Does a section animate open?

**Recommendation:** Row disappears immediately from the `new` queue, drawer closes with it. Sent/Bookmarked sections update in place without animation. Toast only for Slack send ("Sent to #dock-radar"). No toast for bookmark or single dismiss (low-friction actions). Bulk dismiss shows "X articles dismissed" toast.

---

### GAP 7 — Collect simulation timing is unspecified

**Problem:** Scoring simulation specifies "~3 seconds with incremental progress." Collect has no timing defined, leaving it to developer discretion.

**Recommendation:** 2 seconds flat, single `setTimeout`. No incremental progress bar for collect — just a spinner + "Collecting..." state. Only scoring gets the incremental progress bar, since that's the LLM step users need transparency on.

---

### GAP 8 — Empty states for key scenarios

**Problem:** Three empty states are either missing or underspecified:
- Step 3 queue after all articles are actioned
- Step 2 table after all articles are dismissed
- Collection or scoring failure

**Recommendation:**
- Queue empty: "All caught up — no new signals to review" with a checkmark icon, centered gray.
- Step 2 all dismissed: table stays visible with 0 rows, "All articles dismissed" below filters.
- Failure: toast only — "Collection failed — try again" / "Scoring failed — try again". No retry button in Phase 1. Mock won't fail anyway but hooks need the error path for future backend wiring.

---

## Category 3: Type & Interface Gaps

---

### GAP 9 — `ConfigItem` has no `options` field

**Problem:** The Step 2 config bar includes a run selector of `type: 'select'` but `ConfigItem` only defines `{ label, value, editable, type, onChange }`. There's nowhere to put the dropdown options, making the run selector un-implementable with the current type.

**Recommendation:** Add `options?: { label: string; value: string }[]` to the `ConfigItem` interface. Only the run selector uses it. All other items ignore it.

---

### GAP 10 — `DroppedArticles` filter criteria is contradictory

**Problem:** The component props say "articles with `drop_reason` OR `is_duplicate=true` OR `status='dismissed'`." But user-dismissed articles should appear in Step 2's Dropped section only — in Step 3 they're hidden everywhere, forever.

**Recommendation:** `DroppedArticles` is a pure display component — no filtering logic inside. The parent (ScorePanel) pre-filters and passes the correct array. Step 3 never renders `DroppedArticles` at all. Clean separation of concerns.

---

### GAP 11 — Source badge colors only defined for Google News

**Problem:** `ArticleDrawer` specifies "yellow for Google News" but LinkedIn and Facebook have no badge color spec. The `ArticleSource` type includes all three. Leaving it undefined means developers will invent inconsistent colors.

**Recommendation:** Define all three in `constants.ts`:

```typescript
export const SOURCE_BADGE_COLORS: Record<ArticleSource, { bg: string; text: string }> = {
  google_news: { bg: '#FEF9C3', text: '#A16207' },
  linkedin:    { bg: '#DBEAFE', text: '#1E40AF' },
  facebook:    { bg: '#EEF2FF', text: '#4338CA' },
};
```

---

### GAP 12 — `SlackMessage` and `run_articles` have no frontend types

**Problem:** Both are defined in the PRD's data model but have no TypeScript interfaces. Frontend doesn't query them in Phase 1, but their absence creates schema drift.

**Recommendation:** Skip both for Phase 1. Add `// Phase 2: add SlackMessage interface` and `// Phase 2: add RunArticle interface` comments in `types.ts`. Don't over-engineer what won't be used.

---

## Category 4: Component Design

---

### GAP 13 — `ArticleDetail.tsx` has no spec despite being in the file tree

**Problem:** It's listed under `queue/` but the `ArticleDrawer` spec covers all content inline with no mention of what `ArticleDetail` does.

**Recommendation:** Use it as the left-column content of the drawer — summary, metadata grid, and persons list. `ArticleDrawer` owns the 2-column shell and the bottom action strip. `ArticleDetail` fills the left column. This is also the only way to keep both files under the 250-line limit.

---

### GAP 14 — 250-line limit will be violated without explicit decomposition

**Problem:** `ArticleDrawer` (2-column layout + persons + entities + source + SlackCompose + ArticleActions) and `QueuePanel` (header + bulk actions + table + 2 collapsible sections) will both blow past 250 lines as specced.

**Recommendation:** Enforce these boundaries explicitly:
- `ArticleDrawer` = shell + right column + bottom strip
- `ArticleDetail` = left column content (summary, metadata, persons)
- `QueuePanel` = orchestrator only, no inline JSX beyond layout wrapper
- Sent/Bookmarked collapsible sections extracted as `CollapsibleSection.tsx` (reusable)

---

### GAP 15 — `use-score.ts` hook interface is undefined

**Problem:** Described as "mock scoring with simulated SSE progress" but no return signature is given. ScorePanel will implement against this hook — inconsistency here causes cascading issues.

**Recommendation:** Define the contract explicitly:

```typescript
// use-score.ts returns:
{
  isScoring: boolean;
  progress: number;      // articles scored so far
  total: number;         // total articles to score
  articles: ArticleWithScore[];
  startScoring: (run: Run) => void;
}
```

Interval fires every 200ms, increments `progress`, resolves with full mock article array at completion. Cleanup via `useRef` abort flag on unmount to prevent setState-on-unmounted-component warnings.

---

## Category 5: Behavior Edge Cases

---

### GAP 16 — `KeywordInput` comma behavior is ambiguous

**Problem:** "Press Enter or comma to add keyword" is underspecified. Typing `"DJI Dock, Zipline"` and pressing Enter — is that one keyword or two?

**Recommendation:** Comma always splits and immediately creates pills for each part. Enter adds the full current buffer as-is without splitting. Trim whitespace on each side. This matches standard tag-input conventions.

---

### GAP 17 — Default selected regions not defined in code

**Problem:** The PRD example shows Middle East & Africa unchecked, but `REGION_GROUPS` in constants has no `default` field. The `RegionSelector` initial state is left to developer guesswork.

**Recommendation:** Default = all countries selected (Global checked). Simpler, matches "collect everything" intent for a first run. The PRD example was illustrative, not prescriptive.

---

### GAP 18 — Re-bookmarking / re-actioning behavior

**Problem:** If a bookmarked article somehow appears in a context where the drawer is open, what does the Bookmark button show?

**Recommendation:** Non-issue by design. The drawer only opens in the Queue tab where all visible articles are `status='new'`. The Sent and Bookmarked sections below are read-only rows — no expand trigger, no drawer. Solved architecturally.

---

### GAP 19 — Score band "Noise" (0-29) absent from PRD display spec

**Problem:** `SCORE_BANDS` in constants correctly defines 5 bands including 0–29 "Noise", but PRD Section 8.2 only lists 4. Dropped articles have scores of 8, 12, 15, 22 — they'll hit this undefined band.

**Recommendation:** `ScoreBadge` uses `SCORE_BANDS` from constants as sole source of truth, not the PRD table. Constants already have it correct. No code change needed — documentation gap only.

---

## Net Code Changes Required

Only two actual code changes emerge from this entire analysis. Everything else is behavioral decisions baked into component logic and mock data.

```typescript
// types.ts — add to ConfigItem interface:
options?: { label: string; value: string }[];
// Also add 'toggle' type for Review Gate:
type: 'number' | 'text' | 'select' | 'toggle';

// Also add SlackMessage interface:
export interface SlackMessage {
  id: string;
  article_id: string;
  scored_id: string;
  channel_id: string;
  message_ts: string;
  message_text: string;
  sent_at: string;
}

// constants.ts — add:
export const SOURCE_BADGE_COLORS: Record<ArticleSource, { bg: string; text: string }> = {
  google_news: { bg: '#FEF9C3', text: '#A16207' },
  linkedin:    { bg: '#DBEAFE', text: '#1E40AF' },
  facebook:    { bg: '#EEF2FF', text: '#4338CA' },
};
```

---

## Extended Decisions — Round 2 Review

The following decisions were made in a second design review session and supersede or extend the above.

---

### DECISION 1 — LLM Model parameter removed entirely

**Decision:** Remove "LLM Model" from both Step 1 and Step 2 config bars. GPT-4o is baked in for Phase 1. No user-facing display.

**Reasoning:** Adds no value to the user in Phase 1. Will be re-introduced as a selector in Phase 2 when multi-provider support is built.

---

### DECISION 2 — Min Score moved to Step 1, display-only in Step 2

**Decision:** Min Score is now captured in Step 1 config bar (editable). It appears as a read-only display token in Step 2. It cannot be changed after collection starts.

**Design principle confirmed:** All collection parameters are immutable after Step 1 completes. Changing any parameter requires starting a new collection.

**Full Step 1 config bar:** `Max Articles [editable] | Title Similarity: 0.80 [readonly] | Min Score [editable] | Review Gate [toggle]`

**Full Step 2 config bar:** `Max Articles [readonly] | Min Score [readonly] | Title Similarity: 0.80 [readonly] | Run: [dropdown — only interactive element]`

---

### DECISION 3 — Review Gate toggle in Step 1 config bar

**Decision:** Add a `Review Gate` toggle switch to Step 1 config bar.

- **ON:** After scoring completes, Step 2 shows a "Proceed to Queue (N articles) →" button. User must click it to advance to Step 3. Allows inspection and dismissal of scored articles before they enter the queue.
- **OFF (default):** After scoring completes, Step 3 tab unlocks + toast "Queue ready — N articles". Step 2 is display-only. User navigates manually.

**ConfigItem type change:** Add `'toggle'` to the `type` union.

---

### DECISION 4 — Sources panel in Step 1 CollectPanel

**Decision:** Add a Sources panel to `CollectPanel`, positioned below `KeywordInput` and above the DateFilter/RegionSelector form grid.

**Layout:** Horizontal row. Label "Sources to scan:" on left. Three source pills on right:
- `[✓] Google News` — enabled, checked by default
- `[○] LinkedIn (coming soon)` — disabled, unchecked, grayed, "coming soon" pill
- `[○] Facebook (coming soon)` — disabled, unchecked, grayed, "coming soon" pill

**Default selection:** Google News only.

---

### DECISION 5 — Queue redesigned as batch sections

**Decision:** Queue is no longer a flat single table. Articles are grouped by the run that discovered them, with a visual divider for each batch.

**Batch divider format:**
```
━━━  [Run keywords]  •  [Date, Time]  •  [N signals]  ━━━━━━━━━━━━━  [□ Select All]  [⊗ Bulk Dismiss]
```

**Rules:**
- Latest run batch appears first
- Within a batch, articles sorted by score descending
- Each batch has its own Select All + Bulk Dismiss
- Global Select All removed from QueuePanel header
- Cross-batch dismissal is done batch by batch (each batch's Bulk Dismiss only affects its own rows)

---

### DECISION 6 — Multi-run article batch ownership

**Decision:** An article lives in the **earliest run** that discovered it. If the same normalized URL is found in Run 2 that already existed from Run 1, it remains in Run 1's batch (UPSERT with ON CONFLICT DO NOTHING). If already acted on in Run 1, it does not resurface in Run 2's batch.

---

### DECISION 7 — Queue is a global backlog, not per-run

**Decision:** The Queue is a persistent global inbox. New collections ADD to the backlog — they do not replace it. Unprocessed articles from Run 1 remain visible alongside new articles from Run 2.

**Queue logic:**
- `Queue` = all `ScoredArticles` WHERE `status='new'` (any run)
- `Sent` = all `ScoredArticles` WHERE `slack_sent_at IS NOT NULL`
- `Bookmarked` = all `ScoredArticles` WHERE `status='bookmarked'`
- `Dismissed` = hidden permanently, never displayed

---

### DECISION 8 — Dismiss is permanent, multiple soft actions allowed

**Decision:**
- `Dismiss` sets `status='dismissed'` immediately. Row vanishes. No undo. No confirmation. Toast: "Dismissed".
- `Slack Internally` sets `slack_sent_at` timestamp. Status may remain `new` or `bookmarked`. Toast: "Sent to #dock-radar".
- `Bookmark` sets `status='bookmarked'`. Row moves to Bookmarked section.
- A user can both Slack AND Bookmark the same article. Dismiss overrides all — once dismissed, always gone.

---

### DECISION 9 — Sent/Bookmarked sections are read-only

**Decision:** Sent and Bookmarked sections below the queue table contain read-only rows. No checkbox, no expand trigger, no article drawer.

**Columns:** Title (link) | Company | Country | Signal badge | Score badge | Timestamp ("Sent 2h ago" / "Bookmarked 1d ago")

---

### DECISION 10 — Dismissed articles never expire

**Decision:** Dismissed articles are permanently suppressed. No expiry date. If the same article resurfaces in a future run, it stays dismissed.

**Rationale:** Simplicity and consistency. If a user needs to reconsider, this is a manual override use case for Phase 2.

---

### DECISION 11 — Scoring shows cached article count

**Decision:** The scoring progress bar in Step 2 shows a secondary line: "X already cached from previous runs". This makes the "smart memory" system visible and builds user trust.

---

### DECISION 12 — ArticleDetail.tsx is left-column content of ArticleDrawer

**Decision:** `ArticleDetail.tsx` renders: summary text, metadata grid, People Mentioned section. `ArticleDrawer.tsx` owns the 2-column shell, right column (entities, source), and bottom action strip (SlackCompose, ArticleActions).

**Phase 2 extensibility:** Each PersonCard includes an empty `DetailLine` slot below the role line, reserved for email/LinkedIn data in Phase 2/3.

---

### DECISION 13 — Slack message pre-fill format

**Decision:** Textarea pre-fills with structured content:
```
*[Company]* — [Signal Type] | [Country]
Score: [X]/100 | Use Case: [value]

[Summary text]

[Article URL]
```

---

### DECISION 14 — Step navigation: new collection clears downstream state

**Decision:** Navigating back to Step 1 does NOT clear Step 2/3 data. But clicking "Collect News" with new parameters triggers a new run — this clears `currentRun` and `scoredArticles` state in Dashboard, resetting Step 2 to empty. The Queue (Step 3) retains all previous articles (global backlog — they're not cleared).

---

### DECISION 15 — Remaining gap resolutions (config and layout)

| Gap | Resolution |
|-----|------------|
| Review Gate OFF behavior | Step 3 tab unlocks + toast "Queue ready — N articles". No auto-navigation. |
| Sources panel position | Below KeywordInput, above DateFilter/RegionSelector grid in CollectPanel. |
| Cross-batch bulk dismiss | Each batch's Bulk Dismiss only affects its own selected rows. |
| Step 1 form state after collection | Stays filled. User reuses parameters for next run. |
| Step 2 dismissal with Review Gate OFF | Dismissal sets status='dismissed' immediately. Article won't appear in queue regardless of Review Gate. |
