# Dock Radar Phase 1 — Test Cases

> Comprehensive test cases for the 3-step flow: Collect, Score, Queue.
> Covers all critical scenarios including duplicates, re-runs, scoring, queue persistence, multi-action model (Slack/Bookmark stay in queue; Mark as Reviewed exits to Reviewed Inbox), and Reviewed Inbox sub-view.
> Last updated: March 15, 2026 — Updated: comma-always-splits (TC-102), removed TC-103/TC-113/TC-220/TC-705, backend scope tags on TC-401–409 and TC-606–609, multi-action model updates across TC-300/TC-900 series, new TC-730–TC-734 (Reviewed Inbox), TC-703 updated to empty-on-fresh-load.

---

## Priority Guide

| Priority | Meaning |
|----------|---------|
| **P0** | Flow-breaking. Must pass for the app to be usable. |
| **P1** | Important functionality. App works without it but experience is degraded. |
| **P2** | Polish and edge cases. Nice-to-have for Phase 1. |

---

## Category 1: Step 1 — Collection (TC-100 Series)

---

### TC-101 — Basic keyword entry (add/remove pills)

**Scenario:** User adds keywords as pills and removes them.

**Pre-conditions:** App loaded, Step 1 active, keyword input empty.

**Steps:**
1. Type "DJI Dock" in the keyword input.
2. Press Enter.
3. Observe a pill labeled "DJI Dock" appears.
4. Type "drone deployment" and press Enter.
5. Observe a second pill appears.
6. Click the X on the "DJI Dock" pill.

**Expected Result:** Two pills appear after steps 2 and 4. After step 6, only "drone deployment" pill remains. Input field clears after each pill creation.

**Priority:** P0

---

### TC-102 — Comma splitting creates multiple pills

**Scenario:** Typing a comma-separated string creates separate pills for each segment.

**Pre-conditions:** App loaded, Step 1 active, keyword input empty.

**Steps:**
1. Type "DJI Dock, Zipline" in the keyword input (include the comma).
2. Observe behavior as soon as the comma is typed.

**Expected Result:** Comma ALWAYS splits immediately on keypress — no exceptions. The 'DJI Dock' and 'Zipline' pills are created the moment the comma is typed. No pill ever contains a comma character.

**Priority:** P1

---


### TC-104 — Empty keyword validation

**Scenario:** Cannot start collection with zero keywords.

**Pre-conditions:** App loaded, Step 1 active, no keyword pills added.

**Steps:**
1. Leave keyword input empty (no pills).
2. Click "Collect News" button.

**Expected Result:** Collection does not start. The keyword input shows a validation error or the Collect button is disabled. No spinner, no navigation.

**Priority:** P0

---

### TC-105 — Date filter presets

**Scenario:** Clicking a date preset updates the date input field.

**Pre-conditions:** App loaded, Step 1 active.

**Steps:**
1. Observe default date range is 30 days.
2. Click the "7" preset button.
3. Observe the date input updates to 7.
4. Click the "90" preset button.
5. Observe the date input updates to 90.

**Expected Result:** Each preset button click updates the date input to the corresponding value (7, 14, 30, 60, or 90). The clicked preset appears visually highlighted/selected.

**Priority:** P1

---

### TC-106 — Custom date value

**Scenario:** Typing a custom number in the date input works and deselects presets.

**Pre-conditions:** App loaded, Step 1 active, "30" preset currently selected.

**Steps:**
1. Clear the date input field.
2. Type "45".

**Expected Result:** Date input shows 45. No preset button is highlighted (since 45 is not a preset value). The custom value will be used as `filter_days` during collection.

**Priority:** P1

---

### TC-107 — Region selector: Global checkbox

**Scenario:** Global checkbox selects and deselects all regions.

**Pre-conditions:** App loaded, Step 1 active, all regions selected by default.

**Steps:**
1. Observe "Global" checkbox is checked and all countries are checked.
2. Uncheck "Global".
3. Observe all continent and country checkboxes become unchecked.
4. Check "Global" again.
5. Observe all continent and country checkboxes become checked.

**Expected Result:** Global acts as a master toggle — checking it selects all, unchecking it deselects all.

**Priority:** P0

---

### TC-108 — Region selector: Continent checkbox

**Scenario:** Continent checkbox selects/deselects all its child countries.

**Pre-conditions:** App loaded, Step 1 active, Global unchecked, no regions selected.

**Steps:**
1. Check "Americas" continent checkbox.
2. Observe US, Canada, Brazil, Mexico all become checked.
3. Uncheck "Americas".
4. Observe US, Canada, Brazil, Mexico all become unchecked.

**Expected Result:** Continent checkbox controls all its child countries. Checking Americas selects all 4 countries; unchecking deselects all 4.

**Priority:** P1

---

### TC-109 — Region selector: Deselecting one country unchecks continent

**Scenario:** Deselecting a single country unchecks its parent continent but keeps sibling countries checked.

**Pre-conditions:** "Americas" fully checked (US, Canada, Brazil, Mexico all checked).

**Steps:**
1. Uncheck "Brazil".
2. Observe Americas continent checkbox state.
3. Observe US, Canada, Mexico remain checked.

**Expected Result:** Americas continent checkbox becomes unchecked (or indeterminate). US, Canada, and Mexico remain checked. Brazil is unchecked.

**Priority:** P1

---

### TC-110 — Region selector: Indeterminate state

**Scenario:** Continent shows indeterminate state when partially selected.

**Pre-conditions:** "Americas" fully checked.

**Steps:**
1. Uncheck "Brazil".
2. Observe Americas checkbox visual state.

**Expected Result:** Americas checkbox displays an indeterminate state (dash or partial fill, not a full checkmark and not empty). This visually communicates "some but not all children are selected."

**Priority:** P2

---

### TC-111 — Sources panel

**Scenario:** Google News enabled, LinkedIn/Facebook disabled with "coming soon".

**Pre-conditions:** App loaded, Step 1 active.

**Steps:**
1. Observe the Sources panel below the keyword input.
2. Note Google News pill state.
3. Note LinkedIn pill state.
4. Note Facebook pill state.
5. Try clicking LinkedIn pill.

**Expected Result:** Google News shows as enabled and checked by default. LinkedIn shows as disabled with "coming soon" label, grayed out. Facebook shows as disabled with "coming soon" label, grayed out. Clicking disabled pills has no effect.

**Priority:** P1

---

### TC-112 — Config bar parameters in Step 1

**Scenario:** Config bar shows correct editability per parameter.

**Pre-conditions:** App loaded, Step 1 active.

**Steps:**
1. Locate "Max Articles" in config bar — change value to 10.
2. Locate "Title Similarity" — attempt to change it.
3. Locate "Min Score" — change value to 40.
4. Locate "Review Gate" toggle.

**Expected Result:** Max Articles is editable (number input), accepts the new value 10. Title Similarity shows "0.80" as a read-only badge, cannot be edited. Min Score is editable (number input), accepts 40. Review Gate is a toggle switch.

**Priority:** P0

---


### TC-114 — Collect button loading state

**Scenario:** Collect button shows spinner during 2-second simulation.

**Pre-conditions:** At least one keyword pill added.

**Steps:**
1. Click "Collect News" button.
2. Observe button state during collection.
3. Wait for collection to complete (~2 seconds).

**Expected Result:** Button shows a spinner icon and text changes to "Collecting..." (or similar loading state). Button is disabled during collection to prevent double-clicks. After ~2 seconds, collection completes.

**Priority:** P0

---

### TC-115 — Collection stats funnel

**Scenario:** Pipeline stats show the dedup funnel after collection.

**Pre-conditions:** Collection just completed.

**Steps:**
1. Observe the pipeline stats visualization.

**Expected Result:** Funnel shows four stages with counts: Fetched (total from RSS) → After Dedup (Gate 1 removed) → Date Filtered → Stored (final count in DB). Each stage shows a number. The numbers decrease or stay equal as you go down the funnel.

**Priority:** P1

---

### TC-116 — Auto-navigation to Step 2 after collection

**Scenario:** App auto-navigates to Step 2 (Score) after collection completes.

**Pre-conditions:** Collection in progress.

**Steps:**
1. Wait for collection to complete.
2. Observe which step is active.

**Expected Result:** After the 2-second collection simulation completes, the app automatically switches to Step 2 (Score tab). The Score tab becomes active and scoring begins.

**Priority:** P0

---

### TC-117 — Form state preserved after collection

**Scenario:** Step 1 form retains user inputs after collection and navigation.

**Pre-conditions:** Collection completed, app auto-navigated to Step 2.

**Steps:**
1. Click the Step 1 (Collect) tab to go back.
2. Observe keyword pills.
3. Observe date range value.
4. Observe region selections.

**Expected Result:** All previously entered keywords remain as pills. Date range retains the selected value. Region checkboxes retain their selections. The form is ready for a re-run with same or modified parameters.

**Priority:** P1

---

## Category 2: Step 2 — Scoring (TC-200 Series)

---

### TC-201 — Auto-trigger scoring on new run

**Scenario:** Scoring starts automatically when Step 2 loads after a new collection.

**Pre-conditions:** Collection just completed, app auto-navigated to Step 2.

**Steps:**
1. Observe Step 2 immediately after auto-navigation.

**Expected Result:** Scoring progress bar appears automatically. No user action required to start scoring. Progress counter begins incrementing.

**Priority:** P0

---

### TC-202 — Scoring progress bar animation

**Scenario:** Progress bar increments with article count.

**Pre-conditions:** Scoring in progress on Step 2.

**Steps:**
1. Observe the progress bar during scoring.
2. Note the counter text.

**Expected Result:** Progress bar fills incrementally. Counter shows "Scoring X/Y articles" where X increments every ~200ms. The total Y matches the number of articles to be scored.

**Priority:** P1

---

### TC-203 — Cached articles indicator

**Scenario:** Shows count of previously cached articles during scoring.

**Pre-conditions:** A previous run has already scored some articles. A new run discovers some of the same articles plus new ones.

**Steps:**
1. Start a new collection with overlapping keywords.
2. Navigate to Step 2 (auto-navigated).
3. Observe the scoring progress area.

**Expected Result:** A secondary line shows "X already cached from previous runs" (where X is the count of articles that were already scored in a prior run and did not need re-scoring). This makes the smart memory system visible.

**Priority:** P1

---

### TC-204 — Scoring completion

**Scenario:** Progress bar disappears and table appears after scoring completes.

**Pre-conditions:** Scoring in progress.

**Steps:**
1. Wait for scoring to complete.
2. Observe the transition.

**Expected Result:** Progress bar disappears. Scored articles table renders with all columns: Score, Article, Company, Country, Signal, Use Case, FB, Dismiss. Articles are populated with scored data.

**Priority:** P0

---

### TC-205 — Config bar all readonly in Step 2

**Scenario:** All config bar parameters in Step 2 are read-only except the run selector.

**Pre-conditions:** Step 2 active with scored articles.

**Steps:**
1. Attempt to edit Max Articles in Step 2 config bar.
2. Attempt to edit Min Score in Step 2 config bar.
3. Attempt to edit Title Similarity in Step 2 config bar.
4. Use the Run selector dropdown.

**Expected Result:** Max Articles, Min Score, and Title Similarity are all displayed as read-only values — they cannot be changed in Step 2. Only the Run selector dropdown is interactive.

**Priority:** P1

---

### TC-206 — Run selector dropdown

**Scenario:** Run selector shows past runs and switching swaps table data.

**Pre-conditions:** At least 2 runs completed. Step 2 active.

**Steps:**
1. Open the Run selector dropdown.
2. Observe the list of runs (each showing timestamp + keywords).
3. Select a different (older) run.
4. Observe the scored articles table.

**Expected Result:** Dropdown lists all past runs with their timestamps and keywords. Selecting a different run swaps the scored articles table to show that run's articles. The data reflects the selected run's results.

**Priority:** P1

---

### TC-207 — Run selector does NOT re-trigger scoring

**Scenario:** Switching runs via dropdown does not replay the scoring animation.

**Pre-conditions:** At least 2 runs completed. Step 2 active showing latest run.

**Steps:**
1. Switch to an older run via the Run selector.
2. Observe whether scoring animation plays.

**Expected Result:** No scoring progress bar appears. No spinner. The table swaps instantly to the selected run's pre-baked data. Scoring animation only plays once — when first landing on Step 2 after a new collection.

**Priority:** P1

---

### TC-208 — Score badge color bands

**Scenario:** Score badges render with correct colors per band.

**Pre-conditions:** Step 2 active with scored articles spanning multiple score bands.

**Steps:**
1. Find an article with score 92 (e.g., Port of Santos). Observe badge color.
2. Find an article with score 85 (e.g., Indian Railways). Observe badge color.
3. Find an article with score 55. Observe badge color.
4. Find an article with score 35. Observe badge color.
5. Find an article with score 12. Observe badge color.

**Expected Result:**
- Score 92: Green badge (bg #F0FDF4, text #16A34A) — "Hot Lead"
- Score 85: Blue badge (bg #DBEAFE, text #2563EB) — "Strong Signal"
- Score 55: Yellow badge (bg #FEFCE8, text #CA8A04) — "Moderate Signal"
- Score 35: Gray badge (bg #F3F4F6, text #6B7280) — "Background Intel"
- Score 12: Gray badge (lighter) — "Noise"

**Priority:** P1

---

### TC-209 — Signal type badge colors

**Scenario:** Signal type badges render with correct colors per type.

**Pre-conditions:** Step 2 active with articles of various signal types.

**Steps:**
1. Find a DEPLOYMENT signal. Observe badge color.
2. Find a CONTRACT signal. Observe badge color.
3. Find a TENDER signal. Observe badge color.
4. Find a PARTNERSHIP signal. Observe badge color.

**Expected Result:**
- DEPLOYMENT: green (bg #DCFCE7, text #166534)
- CONTRACT: blue (bg #DBEAFE, text #1E40AF)
- TENDER: purple (bg #F3E8FF, text #6B21A8)
- PARTNERSHIP: orange (bg #FFF7ED, text #C2410C)

**Priority:** P1

---

### TC-210 — FlytBase mentioned badge

**Scenario:** FB badge shows for articles where `flytbase_mentioned=true`.

**Pre-conditions:** Step 2 active. Mock data includes Indian Railways article with `flytbase_mentioned=true`.

**Steps:**
1. Find the Indian Railways article (score 85).
2. Observe the FB column.
3. Find an article where `flytbase_mentioned=false`.
4. Observe the FB column.

**Expected Result:** Indian Railways row shows a visible FlytBase badge/flag in the FB column. Articles without FlytBase mention show nothing (or an empty cell) in the FB column.

**Priority:** P1

---

### TC-211 — Filter by signal type

**Scenario:** Signal type dropdown filters the scored articles table.

**Pre-conditions:** Step 2 active with articles of multiple signal types.

**Steps:**
1. Open the Signal Type filter dropdown.
2. Select "DEPLOYMENT".
3. Observe the table.

**Expected Result:** Table shows only articles with signal_type = DEPLOYMENT. All other signal types are hidden. Row count reflects the filtered subset.

**Priority:** P1

---

### TC-212 — Filter by country

**Scenario:** Country dropdown filters the scored articles table.

**Pre-conditions:** Step 2 active with articles from multiple countries.

**Steps:**
1. Open the Country filter dropdown.
2. Select "Brazil".
3. Observe the table.

**Expected Result:** Table shows only articles where country = Brazil (e.g., Port of Santos article). All other countries hidden.

**Priority:** P1

---

### TC-213 — Sort by score descending

**Scenario:** Sorting by score reorders rows from highest to lowest.

**Pre-conditions:** Step 2 active with scored articles.

**Steps:**
1. Click the Score column header to sort.
2. Observe row order.

**Expected Result:** Articles reorder with highest score first (e.g., Port of Santos at 92 at the top) and lowest scores at the bottom.

**Priority:** P1

---

### TC-214 — Sort by date descending

**Scenario:** Sorting by date reorders rows from newest to oldest.

**Pre-conditions:** Step 2 active with scored articles.

**Steps:**
1. Click the Date column header (or date sort option) to sort.
2. Observe row order.

**Expected Result:** Articles reorder with most recently published articles first.

**Priority:** P1

---

### TC-215 — Dismiss article in Step 2

**Scenario:** Clicking X on a scored article row dismisses it.

**Pre-conditions:** Step 2 active with scored articles. Note the article count.

**Steps:**
1. Click the X (dismiss) button on a specific article row.
2. Observe the table.
3. Expand the Dropped section.

**Expected Result:** The row disappears from the scored articles table. The Dropped section now includes this article with reason "Dismissed by user". Article count in the main table decreases by 1.

**Priority:** P0

---

### TC-216 — Dismissed article does NOT appear in Step 3

**Scenario:** An article dismissed in Step 2 never appears in the Step 3 queue.

**Pre-conditions:** Article dismissed in Step 2 (from TC-215).

**Steps:**
1. Navigate to Step 3 (Queue).
2. Search for the dismissed article in the queue.

**Expected Result:** The dismissed article is not present in the Active Queue. It does not appear in the Reviewed tab either. It is permanently removed from the user's workflow — it will not resurface in any view.

**Priority:** P0

---

### TC-217 — Dropped articles section: collapsed by default

**Scenario:** Dropped articles panel starts collapsed.

**Pre-conditions:** Step 2 active with some articles dropped by AI or dismissed.

**Steps:**
1. Observe the Dropped articles section on initial Step 2 load.
2. Click the expand toggle.

**Expected Result:** Section is collapsed by default, showing only a header like "Dropped by AI (X articles)". Clicking the toggle expands the section to reveal the list of dropped articles.

**Priority:** P1

---

### TC-218 — Dropped articles content

**Scenario:** Dropped articles show title, reason, and score.

**Pre-conditions:** Dropped section expanded. Contains AI-dropped and user-dismissed articles.

**Steps:**
1. Observe each item in the Dropped section.

**Expected Result:** Each dropped article displays: title text, drop reason in italic (e.g., "Consumer product review" or "Dismissed by user"), score value, and source badge. Information is sufficient to understand why the article was dropped.

**Priority:** P1

---

### TC-219 — Cross-language duplicate in dropped section

**Scenario:** Cross-language duplicate shows specific Gate 2 explanation.

**Pre-conditions:** Mock data includes a cross-language duplicate (e.g., Portuguese article about same event as English article).

**Steps:**
1. Expand the Dropped section in Step 2.
2. Find the cross-language duplicate entry.

**Expected Result:** The entry shows drop reason as: "Cross-language duplicate of '[original title]' (Gate 2)". This explains both what happened and which gate caught it.

**Priority:** P2

---

### TC-221 — Step 3 tab unlocks + toast after scoring completes

**Scenario:** After scoring completes, Step 3 tab unlocks automatically and a toast appears.

**Pre-conditions:** Scoring completed in Step 2.

**Steps:**
1. Observe Step 2 after scoring completes.
2. Observe Step 3 tab state.
3. Check for a toast notification.

**Expected Result:** Step 3 tab becomes enabled/clickable automatically once scoring finishes. A toast appears: "Queue ready — N articles". User can navigate to Step 3 manually by clicking the tab. No "Proceed to Queue" button is required.

**Priority:** P1

---

### TC-222 — Min Score reflects Step 1 value

**Scenario:** Min Score in Step 2 shows the value set in Step 1 and cannot be edited.

**Pre-conditions:** User set Min Score to 40 in Step 1 config bar before collecting.

**Steps:**
1. Navigate to Step 2 after collection.
2. Observe Min Score in Step 2 config bar.
3. Attempt to change it.

**Expected Result:** Min Score displays "40" (the value set in Step 1). It is read-only and cannot be edited in Step 2.

**Priority:** P1

---

## Category 3: Step 3 — Queue (TC-300 Series)

---

### TC-301 — Queue shows only status='new' articles

**Scenario:** Queue table only displays unprocessed articles.

**Pre-conditions:** Step 3 active. Some articles have been shared, bookmarked, or dismissed in prior interactions.

**Steps:**
1. Observe the main queue table.
2. Verify no shared, bookmarked, or dismissed articles appear in it.

**Expected Result:** Only articles with status='new' appear in the Active Queue. Slacked and Bookmarked articles remain in the Active Queue (with button states showing actions taken) until "Mark as Reviewed" or "Dismiss" is clicked. Reviewed articles appear in the Reviewed tab. Dismissed articles appear nowhere.

**Priority:** P0

---

### TC-302 — Queue grouped by run batches

**Scenario:** Articles are grouped by the run that discovered them, latest run first.

**Pre-conditions:** At least 2 runs completed. Step 3 active with articles from both runs.

**Steps:**
1. Observe the queue layout.
2. Identify batch dividers.
3. Note the order of batches.

**Expected Result:** Articles are visually grouped under batch dividers. The most recent run's batch appears at the top. Older run batches appear below. Each batch is visually distinct with a divider.

**Priority:** P0

---

### TC-303 — Batch divider content

**Scenario:** Batch divider shows run metadata.

**Pre-conditions:** Step 3 active with at least one batch.

**Steps:**
1. Observe the batch divider header.

**Expected Result:** Divider shows: the run's keywords, the date/time of the run, and the signal count (number of status='new' articles in that batch). Format resembles: `[keywords] • [Date, Time] • [N signals]`.

**Priority:** P1

---

### TC-304 — Per-batch Select All

**Scenario:** Select All checkbox in a batch header selects only that batch's articles.

**Pre-conditions:** Step 3 active with 2+ batches, each containing multiple articles.

**Steps:**
1. Click "Select All" checkbox on the first batch.
2. Observe checkboxes in the first batch.
3. Observe checkboxes in the second batch.

**Expected Result:** All articles in the first batch become checked. Articles in the second batch remain unchecked. There is no global Select All — only per-batch.

**Priority:** P1

---

### TC-305 — Per-batch Bulk Dismiss

**Scenario:** Bulk Dismiss in a batch only affects that batch's selected articles.

**Pre-conditions:** First batch: 3 articles selected. Second batch: 2 articles not selected.

**Steps:**
1. Click "Bulk Dismiss" on the first batch.
2. Observe both batches.

**Expected Result:** The 3 selected articles from the first batch are dismissed and vanish. The second batch's articles remain untouched. A toast shows "3 articles dismissed".

**Priority:** P1

---

### TC-306 — Bulk dismiss toast

**Scenario:** Bulk dismiss shows a count toast.

**Pre-conditions:** Multiple articles selected in a batch.

**Steps:**
1. Select 5 articles in a batch.
2. Click "Bulk Dismiss".

**Expected Result:** Toast notification appears: "5 articles dismissed". All 5 articles vanish from the queue.

**Priority:** P2

---

### TC-307 — Expand article drawer

**Scenario:** Clicking expand toggle opens the article drawer below the row.

**Pre-conditions:** Step 3 active with queue articles.

**Steps:**
1. Click the expand toggle (triangle/chevron) on an article row.
2. Observe the area below the row.

**Expected Result:** An inline drawer/accordion expands below the clicked row. The drawer shows article details: summary, metadata, persons, entities, source info, Slack compose area, and action buttons.

**Priority:** P0

---

### TC-308 — Only one drawer open at a time

**Scenario:** Opening a new drawer closes the previously open one.

**Pre-conditions:** Step 3 active. One article drawer is currently open.

**Steps:**
1. With one drawer open, click the expand toggle on a different article row.
2. Observe the first drawer.
3. Observe the second drawer.

**Expected Result:** The first drawer closes. The second drawer opens. Only one drawer is visible at any time.

**Priority:** P1

---

### TC-309 — Drawer content sections

**Scenario:** Drawer displays all required content sections.

**Pre-conditions:** Article drawer expanded for an article with full data (e.g., Port of Santos, score 92).

**Steps:**
1. Observe the left column (2/3 width).
2. Observe the right column (1/3 width).
3. Observe the bottom strip.

**Expected Result:**
- Left column: Summary text (1-2 sentences in English), metadata grid (Company, Location, Use Case, Signal badge, Score badge + label, FlytBase flag), People Mentioned section.
- Right column: Organizations section with entity pills, Source section with source badge + publisher + date.
- Bottom: Slack compose textarea and action buttons.

**Priority:** P0

---

### TC-310 — Drawer persons display

**Scenario:** People Mentioned section shows correctly formatted person cards.

**Pre-conditions:** Article drawer expanded for an article with persons data.

**Steps:**
1. Observe the People Mentioned section.

**Expected Result:** Each person shows: an avatar circle with initials (e.g., "JD" for John Doe), full name, role, and organization. Cards are visually distinct and readable.

**Priority:** P1

---

### TC-311 — Drawer entities display

**Scenario:** Organizations section shows entity pills with type badges.

**Pre-conditions:** Article drawer expanded for an article with entities data.

**Steps:**
1. Observe the Organizations section in the right column.

**Expected Result:** Each entity renders as a pill showing the entity name and a type badge (buyer, operator, regulator, partner, si, oem). Badge types are visually differentiated.

**Priority:** P1

---

### TC-312 — Slack compose pre-fill format

**Scenario:** Slack textarea pre-fills with structured message.

**Pre-conditions:** Article drawer expanded for Port of Santos article (score 92, DEPLOYMENT, Brazil).

**Steps:**
1. Observe the Slack compose textarea content.

**Expected Result:** Textarea is pre-filled with structured content following the format:
```
*[Port Authority of Santos]* — DEPLOYMENT | Brazil
Score: 92/100 | Use Case: [value]

[Summary text in English]

[Article URL]
```

**Priority:** P0

---

### TC-313 — Slack compose editable

**Scenario:** User can edit the pre-filled Slack message before sending.

**Pre-conditions:** Article drawer expanded, Slack compose textarea visible.

**Steps:**
1. Click into the Slack compose textarea.
2. Edit the text (add a note, change wording).
3. Observe the textarea accepts edits.

**Expected Result:** The textarea is fully editable. User can add, remove, or modify any part of the pre-filled message. Changes persist until the message is sent or the drawer is closed.

**Priority:** P0

---

### TC-314 — Slack Internally button

**Scenario:** Clicking "Slack Internally" sends the message, shows toast, and article STAYS in queue.

**Pre-conditions:** Article drawer expanded with Slack compose filled.

**Steps:**
1. Click "Slack Internally" button.
2. Observe the queue table.
3. Observe the toast.
4. Observe the button state.

**Expected Result:** A toast appears: "Sent to #dock-radar". The article REMAINS in the queue — it does NOT move to a Sent section. The Slack button shows a ✓ state indicating it has been sent. The drawer stays open. Article only exits the queue when "Mark as Reviewed" or "Dismiss" is clicked.

**Priority:** P0

---

### TC-315 — Bookmark button

**Scenario:** Clicking Bookmark marks the article and it STAYS in queue.

**Pre-conditions:** Article drawer expanded for a queue article.

**Steps:**
1. Click "Bookmark" button (gold/star icon).
2. Observe the queue table.
3. Observe the button state.

**Expected Result:** The article REMAINS in the queue — it does NOT move to a Bookmarked section. The Bookmark button shows a filled ★ state indicating it has been bookmarked. No toast. Article only exits the queue when "Mark as Reviewed" or "Dismiss" is clicked.

**Priority:** P0

---

### TC-316 — Dismiss button in drawer

**Scenario:** Clicking Dismiss removes the article permanently and closes the drawer.

**Pre-conditions:** Article drawer expanded for a queue article.

**Steps:**
1. Click "Dismiss" button (red X icon).
2. Observe the queue table.
3. Observe the drawer.

**Expected Result:** The article row vanishes immediately from the queue. The drawer closes. The article does not appear in Sent, Bookmarked, or anywhere else. It is permanently gone.

**Priority:** P0

---

### TC-317 — Open Article button

**Scenario:** Open Article opens the original URL in a new browser tab.

**Pre-conditions:** Article drawer expanded.

**Steps:**
1. Click "Open Article" button (external link icon).
2. Observe browser behavior.

**Expected Result:** A new browser tab opens with the article's original URL. The current app tab remains open and unaffected. The drawer stays open.

**Priority:** P1

---

### TC-318 — Multi-action: Slack AND Bookmark

**Scenario:** User can both Slack and Bookmark the same article.

**Pre-conditions:** Article drawer expanded for a queue article.

**Steps:**
1. Click "Slack Internally" button.
2. Observe article status.
3. (If the article remains accessible) Click "Bookmark" as well.

**Expected Result:** The article can have both actions applied independently. After Slack, article stays in queue with ✓ button state. After Bookmark, article stays in queue with filled ★ button state. Both buttons show their active states simultaneously. Article remains in Active Queue throughout — it only exits when "Mark as Reviewed" or "Dismiss" is clicked. The system fully supports multi-action on a single article.

**Priority:** P1

---

### TC-319 — Dismiss overrides all other actions

**Scenario:** Dismissing an article that was previously slacked or bookmarked permanently removes it.

**Pre-conditions:** An article has been Slacked (appears in Sent section) or Bookmarked.

**Steps:**
1. If the article is still actionable, dismiss it.
2. Observe all sections.

**Expected Result:** Once dismissed, the article disappears from the Active Queue permanently. Dismiss is the ultimate override — it removes the article even if Slack or Bookmark actions had been applied. The article never reappears, even in future runs.

**Priority:** P1

---

### TC-320 — Reviewed tab: shows articles after Mark as Reviewed

**Scenario:** Reviewed tab (sub-view of Step 3) shows articles that have been marked as reviewed.

**Pre-conditions:** At least one article has been marked as reviewed via "Mark as Reviewed" button.

**Steps:**
1. Navigate to the Reviewed sub-view tab in Step 3.
2. Observe the list of reviewed articles.
3. Check that previously slacked/bookmarked articles marked as reviewed appear here.

**Expected Result:** Reviewed tab shows a flat list of articles with status='reviewed', sorted by reviewed_at desc. Each row shows title, company, country, signal badge, score badge, actions taken icons (Slack ✓ and/or ★), and timestamp. A filter bar allows filtering by Slacked, Bookmarked, or All.

**Priority:** P1

---

### TC-321 — Reviewed tab: Bookmarked filter shows bookmarked articles

**Scenario:** Bookmarked filter in the Reviewed tab shows only articles with bookmark action taken.

**Pre-conditions:** Several articles in Reviewed tab, at least one with Bookmark action taken before marking as reviewed.

**Steps:**
1. Navigate to Reviewed tab in Step 3.
2. Click the Bookmarked filter (star icon).
3. Observe filtered results.

**Expected Result:** Only articles with 'bookmarked' in actions_taken are shown. Articles that were marked reviewed without bookmarking are hidden. The filter accurately reflects the bookmark state.

**Priority:** P1

---

### TC-322 — Reviewed tab row columns

**Scenario:** Rows in the Reviewed tab show the correct columns including actions taken.

**Pre-conditions:** Reviewed tab open with at least one reviewed article.

**Steps:**
1. Observe the columns displayed for a row in the Reviewed tab.

**Expected Result:** Each row shows: Title (as a link), Company, Country, Signal type badge, Score badge, Actions Taken column (showing Slack ✓ icon and/or ★ icon for actions applied before review), and Timestamp (e.g., "Reviewed 2h ago").

**Priority:** P2

---

### TC-323 — Reviewed tab empty state

**Scenario:** Reviewed tab shows appropriate empty state when no articles have been reviewed yet.

**Pre-conditions:** No articles have been marked as reviewed yet (fresh state).

**Steps:**
1. Navigate to Step 3.
2. Click the Reviewed sub-view tab.

**Expected Result:** Reviewed tab is always accessible (tab is always visible), but shows an empty state message when no articles have been reviewed. Empty state communicates that reviewed articles will appear here once actioned.

**Priority:** P1

---

### TC-324 — Empty queue state

**Scenario:** Queue shows appropriate empty state when all articles are processed.

**Pre-conditions:** All queue articles have been dismissed, sent, or bookmarked. Zero articles with status='new'.

**Steps:**
1. Observe the queue area.

**Expected Result:** Queue displays: "All caught up — no new signals to review" with a checkmark icon, centered and gray. No batch dividers visible. Sent/Bookmarked sections still visible if they contain articles.

**Priority:** P1

---

## Category 4: Duplicate Handling & Smart Memory (TC-400 Series)

---

### TC-401 — Gate 1 URL dedup: tracking params stripped

**Scenario:** Same URL with different UTM tracking parameters is treated as the same article.

**Pre-conditions:** Collection run. Two articles have URLs:
- `https://example.com/article?utm_source=google&utm_medium=rss`
- `https://example.com/article?utm_source=twitter&utm_campaign=share`

**Steps:**
1. Both URLs are encountered during collection.
2. Observe dedup result.

**Expected Result:** URL normalization strips all utm_*, fbclid, gclid params. Both URLs normalize to `https://example.com/article`. Only one article is stored. Dedup count increases by 1.

**Priority:** P0

**Scope:** Backend — Phase 1 backend build. Not a frontend UI test.

---

### TC-402 — Gate 1 URL dedup: www vs non-www

**Scenario:** www and non-www variants treated as same article.

**Pre-conditions:** Two articles with URLs:
- `https://www.example.com/drone-news`
- `https://example.com/drone-news`

**Steps:**
1. Both URLs encountered during collection.

**Expected Result:** URL normalization removes "www." prefix. Both normalize to the same URL. Only one article stored.

**Priority:** P0

**Scope:** Backend — Phase 1 backend build. Not a frontend UI test.

---

### TC-403 — Gate 1 URL dedup: AMP variant

**Scenario:** AMP URL variant treated as same article.

**Pre-conditions:** Two articles:
- `https://example.com/article`
- `https://amp.example.com/article` or `https://example.com/amp/article`

**Steps:**
1. Both URLs encountered during collection.

**Expected Result:** URL normalization handles AMP variants. Both resolve to the same base article. Only one is stored.

**Priority:** P1

**Scope:** Backend — Phase 1 backend build. Not a frontend UI test.

---

### TC-404 — Gate 1 title dedup: Jaccard > 0.80

**Scenario:** Two articles with very similar titles (Jaccard > 0.80) are treated as duplicates.

**Pre-conditions:** Two articles from different publishers with titles:
- "Port of Santos Deploys DJI Dock 2 for Container Yard Inspection"
- "Port of Santos Deploys DJI Dock 2 for Container Yard Monitoring"

**Steps:**
1. Both articles encountered during collection.
2. Title Jaccard similarity calculated on content words (3+ chars, stop words removed).

**Expected Result:** Jaccard similarity exceeds 0.80 threshold. One article is kept, the other is deduplicated. Only the first-encountered (or higher-priority) version is stored.

**Priority:** P0

**Scope:** Backend — Phase 1 backend build. Not a frontend UI test.

---

### TC-405 — Gate 1 title dedup: Jaccard < 0.80

**Scenario:** Two articles with somewhat similar but distinct titles are treated as separate.

**Pre-conditions:** Two articles with titles:
- "Port of Santos Deploys DJI Dock 2 for Container Yard Inspection"
- "Brazilian Ports Investing in Drone Technology for Security"

**Steps:**
1. Both articles encountered during collection.
2. Title Jaccard similarity calculated.

**Expected Result:** Jaccard similarity is below 0.80 threshold. Both articles are stored as separate entries. No dedup occurs.

**Priority:** P1

**Scope:** Backend — Phase 1 backend build. Not a frontend UI test.

---

### TC-406 — Gate 2 post-scoring dedup: same event, different articles

**Scenario:** Two different articles about the same event are caught by Gate 2 after scoring.

**Pre-conditions:** Two articles scored with:
- Article A: company="Port of Santos", country="Brazil", signal_type="DEPLOYMENT", summary Jaccard > 0.75 with Article B
- Article B: same company, country, signal_type, similar summary

**Steps:**
1. Both articles pass Gate 1 (different URLs, different titles).
2. Both are scored by GPT-4o.
3. Gate 2 compares extracted fields.

**Expected Result:** Gate 2 detects: same company + country + signal_type AND summary Jaccard > 0.75. The lower-scored article is marked as `is_duplicate=true` and appears in the Dropped section with reason explaining the duplication.

**Priority:** P0

**Scope:** Backend — Phase 1 backend build. Not a frontend UI test.

---

### TC-407 — Gate 2 cross-language duplicate

**Scenario:** Portuguese article about the same event as an English article, caught by Gate 2.

**Pre-conditions:** Two articles:
- English: "Port of Santos Launches Drone Program for Container Inspection"
- Portuguese: "Porto de Santos Lanca Programa de Drones para Inspecao de Containers"

**Steps:**
1. Both pass Gate 1 (different URLs, different titles, different languages).
2. GPT-4o scores both and translates summaries to English.
3. Gate 2 compares extracted English fields.

**Expected Result:** Both articles produce similar extracted fields (same company, country, signal_type) and their English summaries have Jaccard > 0.75. Gate 2 marks the lower-scored one as a cross-language duplicate. Dropped section shows: "Cross-language duplicate of '[title]' (Gate 2)".

**Priority:** P0

**Scope:** Backend — Phase 1 backend build. Not a frontend UI test.

---

### TC-408 — Gate 2: Higher score survives

**Scenario:** When two articles are Gate 2 duplicates, the higher-scored one is kept.

**Pre-conditions:** Two duplicate articles:
- Article A: score 92
- Article B: score 78 (same event)

**Steps:**
1. Gate 2 identifies them as duplicates.

**Expected Result:** Article A (score 92) survives and appears in the scored table. Article B (score 78) is marked as `is_duplicate=true` and moves to the Dropped section. The higher score always wins.

**Priority:** P0

**Scope:** Backend — Phase 1 backend build. Not a frontend UI test.

---

### TC-409 — DB constraint: UNIQUE(normalized_url)

**Scenario:** Database prevents duplicate article insertion at the constraint level.

**Pre-conditions:** An article with `normalized_url = "https://example.com/article"` already exists in the database.

**Steps:**
1. A new collection discovers the same URL.
2. System attempts to insert.

**Expected Result:** UPSERT with `ON CONFLICT DO NOTHING` handles it gracefully. No error is thrown. The existing article remains unchanged. The run_articles junction links the new run to the existing article.

**Priority:** P0

**Scope:** Backend — Phase 1 backend build. Not a frontend UI test.

---

### TC-410 — Cross-run dedup: same article in two runs

**Scenario:** Run 2 discovers the same article that Run 1 already found.

**Pre-conditions:** Run 1 completed with article "Port of Santos" stored. Run 2 uses overlapping keywords.

**Steps:**
1. Run 2 collects articles.
2. "Port of Santos" is discovered again.

**Expected Result:** The article exists once in the global article pool (not duplicated). Run 2's run_articles junction links to the same article record. The article is not re-inserted; the existing record is reused.

**Priority:** P0

---

### TC-411 — Cross-run score reuse

**Scenario:** Previously scored article reuses its score in a new run without re-scoring.

**Pre-conditions:** Run 1 scored "Port of Santos" with score 92. Run 2 discovers the same article.

**Steps:**
1. Run 2 enters Step 2 scoring.
2. Observe scoring behavior for the "Port of Santos" article.

**Expected Result:** "Port of Santos" is NOT sent to GPT-4o again. Its cached score of 92 is reused. The progress bar shows it as "already cached." The article appears in Run 2's scored table with the same score of 92.

**Priority:** P0

---

### TC-412 — Cross-run dismissed stays dismissed

**Scenario:** An article dismissed in Run 1 stays dismissed if Run 2 re-discovers it.

**Pre-conditions:** Article X dismissed in Run 1 (status='dismissed'). Run 2 discovers the same article.

**Steps:**
1. Run 2 collects articles (Article X found again).
2. Navigate to Step 3 (Queue).

**Expected Result:** Article X does NOT appear in the queue. Its dismissed status persists across runs. It is not re-queued, not re-scored, not resurfaced. The dismissal is permanent.

**Priority:** P0

---

### TC-413 — Cross-run status persistence: Slacked article

**Scenario:** Article sent to Slack in Run 1 shows in Sent section, not re-queued in Run 2.

**Pre-conditions:** Article Y was Slacked in Run 1 (status includes shared_at timestamp). Run 2 discovers the same article.

**Steps:**
1. Run 2 collects articles.
2. Navigate to Step 3 (Queue).
3. Check the Sent section.

**Expected Result:** Article Y does NOT appear in the Active Queue as a new article. It appears in the Reviewed tab (since it was actioned in Run 1). It is not re-queued for action.

**Priority:** P0

---

### TC-414 — Scoring cache visibility

**Scenario:** Progress bar shows cached article count during re-run scoring.

**Pre-conditions:** Run 1 scored 8 articles. Run 2 discovers 5 of the same articles + 3 new ones.

**Steps:**
1. Run 2 enters Step 2.
2. Observe the scoring progress area.

**Expected Result:** Progress bar shows scoring of 3 new articles (the ones not cached). A secondary indicator shows "5 already cached from previous runs". Total displayed is 8 articles (5 cached + 3 newly scored).

**Priority:** P1

---

## Category 5: Multi-Run Queue Behavior (TC-500 Series)

---

### TC-501 — Scenario A: Fresh articles after completed queue

**Scenario:** User completes queue (all articles actioned), runs again. New articles appear fresh.

**Pre-conditions:** All articles from Run 1 have been dismissed/shared/bookmarked. Queue shows "All caught up."

**Steps:**
1. Go to Step 1, add keywords, click Collect.
2. Scoring completes.
3. Navigate to Step 3.

**Expected Result:** Queue shows new articles from Run 2 in a fresh batch. No leftover articles from Run 1 in the queue (they were all actioned). The "All caught up" message is replaced by the new batch.

**Priority:** P0

---

### TC-502 — Scenario B: Unprocessed articles carry over

**Scenario:** User leaves 10 unprocessed from Run 1, runs Run 2. Queue shows combined total.

**Pre-conditions:** Run 1 completed with 10 articles still status='new'. Run 2 discovers 5 new unique articles.

**Steps:**
1. Run 2 collection and scoring complete.
2. Navigate to Step 3.

**Expected Result:** Queue shows 15 total articles: 5 from Run 2's batch (newest, at top) and 10 from Run 1's batch (below). Both batches have their own dividers with respective run metadata.

**Priority:** P0

---

### TC-503 — Scenario C: Same article in two runs appears once

**Scenario:** Same article found in both Run 1 and Run 2 appears only once in the queue.

**Pre-conditions:** "Port of Santos" article found in Run 1 (status='new'). Run 2 also discovers it.

**Steps:**
1. Run 2 completes.
2. Navigate to Step 3.

**Expected Result:** "Port of Santos" appears exactly ONCE in the queue, under Run 1's batch (the earliest run that discovered it). It does NOT appear again under Run 2's batch. No duplication.

**Priority:** P0

---

### TC-504 — Scenario D: Dismissed article from earlier run

**Scenario:** Dismissed article from Run 1 resurfaces in Run 2 but stays dismissed.

**Pre-conditions:** Article Z dismissed in Run 1. Run 2 uses keywords that would match Article Z.

**Steps:**
1. Run 2 collects articles.
2. Navigate to Step 3.
3. Search for Article Z in the queue.

**Expected Result:** Article Z is NOT in the queue, NOT in any batch, NOT visible anywhere. Its dismissed status from Run 1 is permanent and survives re-discovery in Run 2.

**Priority:** P0

---

### TC-505 — Batch ordering: newest first

**Scenario:** Latest run's batch appears above older run's batch.

**Pre-conditions:** Run 1 (March 14) and Run 2 (March 15) both have unprocessed articles.

**Steps:**
1. Navigate to Step 3.
2. Observe batch order.

**Expected Result:** Run 2 (March 15) batch divider appears at the top of the queue. Run 1 (March 14) batch divider appears below it. Newest run first.

**Priority:** P1

---

### TC-506 — Within-batch ordering: score descending

**Scenario:** Articles within a batch are sorted by score, highest first.

**Pre-conditions:** A batch contains articles with scores: 92, 78, 65, 55.

**Steps:**
1. Observe article order within a single batch.

**Expected Result:** Articles appear in order: 92, 78, 65, 55 (descending score). Highest-scored signals are at the top within each batch.

**Priority:** P1

---

### TC-507 — Batch signal count: only status='new'

**Scenario:** Batch divider signal count only counts unprocessed articles.

**Pre-conditions:** A batch originally had 8 articles. 3 have been dismissed, 2 sent to Slack.

**Steps:**
1. Observe the batch divider.

**Expected Result:** Batch divider shows "3 signals" (only the 3 remaining status='new' articles). Dismissed and reviewed articles are not counted in the signal count. Note: slacked/bookmarked articles that have NOT been marked as reviewed still count as 'new' and appear in the batch.

**Priority:** P1

---

### TC-508 — Batch header disappears when all articles actioned

**Scenario:** When all articles in a batch are acted on, the batch header disappears.

**Pre-conditions:** A batch has 2 remaining articles.

**Steps:**
1. Dismiss the first article.
2. Click "Mark as Reviewed" on the second article.
3. Observe the batch area.

**Expected Result:** With zero status='new' articles remaining in the batch, the batch divider/header disappears entirely. No empty batch sections are shown. Note: merely Slacking or Bookmarking without marking as reviewed does NOT cause the batch to disappear.

**Priority:** P2

---

### TC-509 — Re-run does NOT clear existing queue

**Scenario:** Going to Step 1 and collecting does not wipe the existing queue.

**Pre-conditions:** Queue has 5 unprocessed articles from Run 1.

**Steps:**
1. Navigate to Step 1.
2. Modify keywords.
3. Click Collect (Run 2 starts).
4. Scoring completes.
5. Navigate to Step 3.

**Expected Result:** Queue still has the 5 articles from Run 1 (unchanged), plus any new articles from Run 2 in a new batch above. The existing queue is a persistent global backlog — new collections ADD to it, never replace it.

**Priority:** P0

---

### TC-510 — New collection resets Step 2

**Scenario:** A new collection clears Step 2's current run state.

**Pre-conditions:** Step 2 shows scored articles from Run 1. User starts a new collection.

**Steps:**
1. Navigate to Step 1, click Collect (Run 2).
2. Auto-navigate to Step 2.
3. Observe Step 2 state.

**Expected Result:** Step 2 clears its previous display (Run 1 data is gone from current view). Scoring animation plays for Run 2's new articles. The Run selector dropdown still allows switching back to Run 1, but the default view is Run 2.

**Priority:** P1

---

### TC-511 — Global article pool: same score everywhere

**Scenario:** An article's score is consistent across all runs and views.

**Pre-conditions:** "Port of Santos" scored 92 in Run 1. Run 2 also discovers it.

**Steps:**
1. View "Port of Santos" in Run 1's Step 2 table.
2. Switch to Run 2's Step 2 table.
3. View it in Step 3 queue.

**Expected Result:** Score is 92 everywhere. The article has ONE score globally. It does not get re-scored or show a different score in different contexts.

**Priority:** P0

---

## Category 6: Scoring Edge Cases (TC-600 Series)

---

### TC-601 — Score 92: "Hot Lead" green badge

**Scenario:** Article with score 92 renders as Hot Lead.

**Pre-conditions:** Port of Santos article, score 92, in scored table.

**Steps:**
1. Observe the score badge for this article.

**Expected Result:** Badge displays "92" with green styling (bg #F0FDF4, text #16A34A). Label is "Hot Lead".

**Priority:** P1

---

### TC-602 — Score 70: "Strong Signal" blue badge

**Scenario:** Article with score 70 renders as Strong Signal.

**Pre-conditions:** An article with score exactly 70.

**Steps:**
1. Observe the score badge.

**Expected Result:** Badge displays "70" with blue styling (bg #DBEAFE, text #2563EB). Label is "Strong Signal".

**Priority:** P1

---

### TC-603 — Score 50: "Moderate Signal" yellow badge

**Scenario:** Article with score 50 renders as Moderate Signal.

**Pre-conditions:** An article with score exactly 50.

**Steps:**
1. Observe the score badge.

**Expected Result:** Badge displays "50" with yellow styling (bg #FEFCE8, text #CA8A04). Label is "Moderate Signal".

**Priority:** P1

---

### TC-604 — Score 35: "Background Intel" gray badge

**Scenario:** Article with score 35 renders as Background Intel.

**Pre-conditions:** An article with score 35.

**Steps:**
1. Observe the score badge.

**Expected Result:** Badge displays "35" with gray styling (bg #F3F4F6, text #6B7280). Label is "Background Intel".

**Priority:** P1

---

### TC-605 — Score 12: "Noise" gray badge

**Scenario:** Article with score 12 renders as Noise.

**Pre-conditions:** An article with score 12 (in Dropped section).

**Steps:**
1. Expand the Dropped section.
2. Find the article with score 12.
3. Observe the score badge.

**Expected Result:** Badge displays "12" with a lighter gray styling. Label is "Noise". This band (0-29) is defined in SCORE_BANDS constants, not in the PRD table, and must be rendered correctly.

**Priority:** P2

---

### TC-606 — OEM detection: buyer extraction

**Scenario:** OEM companies (DJI, Skydio, Autel) are identified as equipment providers, not signals. The buyer organization is extracted.

**Pre-conditions:** Article titled "Port of Santos Deploys DJI Dock 2 for Container Inspection".

**Steps:**
1. Observe the scored output for this article.

**Expected Result:** `company` field shows "Port of Santos" (the buyer/deployer), NOT "DJI". DJI is recognized as an OEM and categorized accordingly in entities. The signal is about the buyer's deployment, not the OEM's product.

**Priority:** P0

**Scope:** Backend — Phase 1 backend build. Not a frontend UI test.

---

### TC-607 — Country = where event happens, not publication

**Scenario:** Country field reflects event location, not article origin.

**Pre-conditions:** Article published by a US news outlet about a drone deployment in Brazil.

**Steps:**
1. Observe the country field in the scored output.

**Expected Result:** Country shows "Brazil" (where the deployment happens), NOT "United States" (where the article was published).

**Priority:** P0

**Scope:** Backend — Phase 1 backend build. Not a frontend UI test.

---

### TC-608 — City implies country

**Scenario:** If a city is mentioned, the country is inferred.

**Pre-conditions:** Article mentions "Santos" as the city with no explicit country reference.

**Steps:**
1. Observe the city and country fields.

**Expected Result:** `city` = "Santos", `country` = "Brazil". The system infers the country from the city name. Both fields are populated.

**Priority:** P1

**Scope:** Backend — Phase 1 backend build. Not a frontend UI test.

---

### TC-609 — All output in English

**Scenario:** Non-English articles produce English summaries and field values.

**Pre-conditions:** A Portuguese article about drone deployment in Brazil.

**Steps:**
1. Observe the scored article's summary, company, use_case fields.

**Expected Result:** All extracted text fields are in English, regardless of the article's original language. Summary is a coherent English sentence. Company name may remain in original language if it's a proper noun, but descriptive fields are English.

**Priority:** P0

**Scope:** Backend — Phase 1 backend build. Not a frontend UI test.

---

### TC-610 — FlytBase detection

**Scenario:** `flytbase_mentioned=true` when FlytBase appears in article text.

**Pre-conditions:** Indian Railways article (score 85) mentions FlytBase in its text.

**Steps:**
1. Observe the `flytbase_mentioned` field for this article.

**Expected Result:** `flytbase_mentioned = true`. The FB badge is visible in Step 2 table and in the article drawer metadata in Step 3.

**Priority:** P1

---

### TC-611 — Min score filter sends below-threshold to Dropped

**Scenario:** Articles scoring below the min score go to Dropped section, not the scored table.

**Pre-conditions:** Min score set to 50 in Step 1. Scoring produces articles with scores 92, 85, 65, 42, 35, 12.

**Steps:**
1. Observe the scored articles table in Step 2.
2. Observe the Dropped section.

**Expected Result:** Scored table shows articles with scores >= 50 (92, 85, 65). Dropped section includes articles with scores < 50 (42, 35, 12) along with their drop reasons. The min score acts as a display filter.

**Priority:** P0

---

### TC-612 — Min score does NOT re-score

**Scenario:** Min score is a display filter only, not a re-scoring trigger.

**Pre-conditions:** Step 2 showing scored articles. Min score was 50. (In Step 2, min score is read-only per Decision 2, but the filtering behavior still applies.)

**Steps:**
1. Observe that articles below min score are in Dropped, not re-scored.

**Expected Result:** No additional GPT-4o calls are made when the min score filter is applied. All articles retain their original scores. The filter simply controls which articles appear in the main table vs. the Dropped section.

**Priority:** P1

---

### TC-613 — Scoring unmount safety

**Scenario:** Navigating away during scoring does not cause React setState warnings.

**Pre-conditions:** Scoring in progress (progress bar animating).

**Steps:**
1. While scoring is running, click Step 1 tab to navigate away.
2. Open browser developer console.
3. Check for React warnings.

**Expected Result:** No "setState on unmounted component" warnings in the console. The scoring interval/timer is properly cleaned up via useRef abort flag when the component unmounts.

**Priority:** P2

---

## Category 7: Step Navigation & State (TC-700 Series)

---

### TC-701 — Tab switching: no data loss

**Scenario:** Switching between tabs preserves all data.

**Pre-conditions:** Step 1 has keywords entered. Step 2 has scored articles. Step 3 has queue articles.

**Steps:**
1. Click Step 3 tab, observe queue.
2. Click Step 1 tab, observe keywords still there.
3. Click Step 2 tab, observe scored articles still there.
4. Click Step 3 tab, observe queue still there.

**Expected Result:** All data persists across tab switches. No state is lost when navigating between steps. Keywords, scored articles, and queue articles are all preserved.

**Priority:** P0

---

### TC-702 — Step 2 disabled before collection

**Scenario:** Score tab is grayed out when no collection has run.

**Pre-conditions:** Fresh app load, no collection has been performed.

**Steps:**
1. Observe the Score tab.
2. Try clicking it.

**Expected Result:** Score tab is visually grayed out/disabled. Clicking it does nothing or shows no content. User must complete Step 1 collection first.

**Priority:** P0

---

### TC-703 — Queue tab always enabled, empty on fresh load

**Scenario:** Queue tab is accessible at any time but shows empty state on fresh load.

**Pre-conditions:** Fresh app load, no collection performed.

**Steps:**
1. Click the Queue tab.

**Expected Result:** Queue tab is always enabled and clickable. Queue is EMPTY on fresh load. Empty state shows: 'All caught up — no new signals to review' with checkmark icon. Articles only appear after a collection + scoring run completes.

**Priority:** P0

---

### TC-704 — Auto-navigation: Step 1 to Step 2

**Scenario:** After collection completes, app automatically navigates to Step 2.

**Pre-conditions:** Step 1 active, collection started.

**Steps:**
1. Wait for collection to complete (~2 seconds).
2. Observe active tab.

**Expected Result:** The active tab switches to Step 2 (Score). Scoring begins automatically. User does not need to manually click the Score tab.

**Priority:** P0

---


### TC-706 — Review Gate OFF: Step 3 unlocks with toast

**Scenario:** With Review Gate OFF, Step 3 tab unlocks after scoring and a toast appears.

**Pre-conditions:** Review Gate OFF (default). Scoring completed.

**Steps:**
1. Observe Step 3 tab after scoring completes.
2. Observe toast notifications.

**Expected Result:** Step 3 tab becomes enabled. A toast appears: "Queue ready — N articles". No auto-navigation occurs — user navigates manually. No "Proceed to Queue" button exists.

**Priority:** P1

---

### TC-707 — Back to Step 1: form state preserved

**Scenario:** Navigating back to Step 1 keeps the form filled.

**Pre-conditions:** Collection completed, currently on Step 2 or Step 3.

**Steps:**
1. Click Step 1 (Collect) tab.
2. Observe keyword pills, date range, region selections.

**Expected Result:** All form inputs retain their values from the previous collection. Keywords are still as pills, date range shows the selected value, regions remain checked/unchecked as set. User can modify and re-run without re-entering everything.

**Priority:** P1

---

### TC-708 — Re-collect: resets Step 2, preserves Step 3

**Scenario:** Starting a new collection resets Step 2 but keeps the Step 3 queue intact.

**Pre-conditions:** Run 1 completed. Step 2 shows Run 1 scored articles. Queue has Run 1 articles.

**Steps:**
1. Go to Step 1, modify keywords, click Collect.
2. Observe Step 2 after auto-navigation.
3. After scoring, navigate to Step 3.

**Expected Result:** Step 2 resets: shows scoring animation for Run 2, no leftover Run 1 data in current view (though Run selector can switch back). Step 3 queue retains all Run 1 articles AND adds Run 2 articles. Queue is a global backlog — never cleared by new runs.

**Priority:** P0

---

### TC-709 — Config bar changes per step

**Scenario:** Config bar shows different parameters on each step.

**Pre-conditions:** App loaded.

**Steps:**
1. Observe config bar on Step 1.
2. Navigate to Step 2, observe config bar.
3. Navigate to Step 3, observe config bar.

**Expected Result:**
- Step 1: Max Articles (editable), Title Similarity: 0.80 (readonly), Min Score (editable), Review Gate (toggle)
- Step 2: Max Articles (readonly), Min Score (readonly), Title Similarity: 0.80 (readonly), Run selector (dropdown — only interactive element)
- Step 3: No config bar (or no parameters displayed)

**Priority:** P1

---

### TC-730 — Active Queue and Reviewed sub-views exist in Step 3

**Scenario:** Step 3 has two sub-views: Active Queue (default) and Reviewed.

**Pre-conditions:** Step 3 loaded with some articles in queue.

**Steps:**
1. Observe Step 3 panel.
2. Check that "Active Queue" is selected by default.
3. Click "Reviewed" sub-view tab.

**Expected Result:** Step 3 has two sub-view tabs: "Active Queue" and "Reviewed". Active Queue shows batch-grouped articles with status='new'. Reviewed tab shows a flat list with filter bar.

**Priority:** P0

---

### TC-731 — Mark as Reviewed moves article from Active Queue to Reviewed tab

**Scenario:** Clicking "Mark as Reviewed" on an article exits it from the Active Queue.

**Pre-conditions:** Step 3 open, article drawer open on a 'new' article.

**Steps:**
1. Open article drawer.
2. Click "Mark as Reviewed" button (green check button).
3. Observe Active Queue.
4. Navigate to Reviewed tab.

**Expected Result:** Article immediately disappears from Active Queue. No toast. Drawer closes. Article appears in Reviewed tab sorted by reviewed_at desc.

**Priority:** P0

---

### TC-732 — Slack + Bookmark are independent, article stays in queue

**Scenario:** Clicking Slack and Bookmark does NOT remove article from Active Queue.

**Pre-conditions:** Step 3 open, article drawer open.

**Steps:**
1. Click "Slack Internally".
2. Observe article row in queue.
3. Click "Bookmark".
4. Observe article row.

**Expected Result:** After Slack: toast "Sent to #dock-radar", button shows ✓ state, article REMAINS in queue. After Bookmark: button shows filled ★ state, article REMAINS in queue. Article only exits queue when "Mark as Reviewed" or "Dismiss" is clicked.

**Priority:** P0

---

### TC-733 — Reviewed tab filter bar works

**Scenario:** Reviewed tab filter bar filters reviewed articles by action taken.

**Pre-conditions:** Several articles in Reviewed tab — some slacked, some bookmarked, some with no actions.

**Steps:**
1. Navigate to Reviewed tab.
2. Click "Slacked" filter (Slack icon).
3. Observe results.
4. Click "Bookmarked" filter (star icon).
5. Observe results.
6. Click "All" filter.

**Expected Result:** Slacked filter shows only articles with 'slack' in actions_taken. Bookmarked filter shows only articles with 'bookmarked' in actions_taken. All shows all reviewed articles including those with no actions.

**Priority:** P1

---

### TC-734 — Articles marked reviewed with no prior actions appear in Reviewed tab

**Scenario:** An article marked reviewed without Slack or Bookmark still appears in Reviewed tab.

**Pre-conditions:** Step 3 open, article drawer open, no prior actions taken on the article.

**Steps:**
1. Open article drawer without clicking Slack or Bookmark.
2. Click "Mark as Reviewed".
3. Navigate to Reviewed tab.
4. Check the "All" filter.

**Expected Result:** Article appears in Reviewed tab under "All" filter. It does not appear under Slacked or Bookmarked filters. It has no action icons displayed in the actions column.

**Priority:** P1

---

## Category 8: UI/UX Polish (TC-800 Series)

---

### TC-801 — Navbar elements

**Scenario:** Navbar displays correct branding elements.

**Pre-conditions:** App loaded.

**Steps:**
1. Observe the top navbar.

**Expected Result:** Navbar contains: logo, title ("Dock Radar" or similar), subtitle, a "Phase 1" badge, and FlytBase text/branding. Navbar is sticky at the top with white background and bottom border.

**Priority:** P2

---

### TC-802 — Responsive: table horizontal scroll

**Scenario:** Tables scroll horizontally on narrow viewports.

**Pre-conditions:** Browser window resized to below 768px width.

**Steps:**
1. View Step 2 scored articles table.
2. Observe horizontal overflow behavior.

**Expected Result:** Table is scrollable horizontally. All columns are accessible via scrolling. No content is clipped or hidden without a scroll mechanism.

**Priority:** P2

---

### TC-803 — Responsive: form grid stacking

**Scenario:** Step 1 form grid stacks to single column on narrow viewports.

**Pre-conditions:** Browser window resized to below 768px width.

**Steps:**
1. View Step 1 form (date filter, region selector).
2. Observe layout.

**Expected Result:** Form elements stack vertically in a single column instead of side-by-side grid. All form elements remain usable and visible.

**Priority:** P2

---

### TC-804 — Toast notifications

**Scenario:** Toasts appear in correct position and auto-dismiss.

**Pre-conditions:** Any action that triggers a toast (e.g., Slack send).

**Steps:**
1. Trigger a toast (e.g., send to Slack).
2. Observe toast position.
3. Wait for auto-dismiss.

**Expected Result:** Toast appears via Sonner library, positioned consistently (typically top-right or bottom-right). Toast auto-dismisses after a few seconds without user action.

**Priority:** P2

---

### TC-805 — Keyboard input: Enter does not submit form

**Scenario:** Pressing Enter in the keyword input adds a pill, does not submit the Step 1 form.

**Pre-conditions:** Step 1 active, keyword input focused, text entered.

**Steps:**
1. Type "DJI Dock" in keyword input.
2. Press Enter.

**Expected Result:** A pill is created for "DJI Dock". The form is NOT submitted. No collection starts. The Collect button must be clicked separately to start collection.

**Priority:** P0

---

### TC-806 — Drawer close on row dismiss

**Scenario:** If an expanded row is dismissed, the drawer closes.

**Pre-conditions:** Article drawer is open for a specific article in Step 3.

**Steps:**
1. Click "Dismiss" in the open drawer.
2. Observe the drawer.

**Expected Result:** The article row vanishes from the queue AND the drawer closes simultaneously. No orphaned drawer remains visible for a deleted row.

**Priority:** P1

---

### TC-807 — Score/Signal badge color accuracy

**Scenario:** Badge colors match the design token specifications exactly.

**Pre-conditions:** Step 2 or Step 3 with various score and signal badges visible.

**Steps:**
1. Inspect a score 92 badge — verify bg #F0FDF4, text #16A34A.
2. Inspect a DEPLOYMENT signal badge — verify bg #DCFCE7, text #166534.
3. Inspect a CONTRACT signal badge — verify bg #DBEAFE, text #1E40AF.

**Expected Result:** All badge colors match the design tokens defined in PRD Section 8.2 and 8.3 exactly. No approximations or default Tailwind colors unless they match the spec.

**Priority:** P2

---

### TC-808 — Article title links

**Scenario:** Article titles are clickable links that open in a new tab.

**Pre-conditions:** Scored articles table or queue table visible.

**Steps:**
1. Hover over an article title.
2. Click the title.

**Expected Result:** Title turns blue on hover (indicating it's a link). Clicking opens the article's original URL in a new browser tab. Current tab remains on Dock Radar.

**Priority:** P1

---

### TC-809 — Source badges

**Scenario:** Source badges have correct colors per source.

**Pre-conditions:** Articles visible with source badges.

**Steps:**
1. Find a Google News source badge. Observe color.
2. (If present) Find a LinkedIn source badge.
3. (If present) Find a Facebook source badge.

**Expected Result:**
- Google News: yellow (bg #FEF9C3, text #A16207)
- LinkedIn: blue (bg #DBEAFE, text #1E40AF)
- Facebook: indigo (bg #EEF2FF, text #4338CA)

**Priority:** P2

---

### TC-810 — Empty states: correct messaging

**Scenario:** Each step displays appropriate empty state messaging.

**Pre-conditions:** Various empty conditions.

**Steps:**
1. Navigate to Step 2 before any collection — observe message.
2. Queue with all articles actioned — observe message.

**Expected Result:**
- Step 2 with no run: appropriate empty state (no table, prompt to collect first)
- Queue empty: "All caught up — no new signals to review" with checkmark icon
- Step 2 all dismissed: table shows 0 rows with "All articles dismissed" message

**Priority:** P1

---

## Category 9: Slack Integration (TC-900 Series)

---

### TC-901 — Pre-fill format

**Scenario:** Slack message pre-fills with the correct structured format.

**Pre-conditions:** Article drawer open for Port of Santos (score 92, DEPLOYMENT, Brazil, company "Port Authority of Santos").

**Steps:**
1. Observe the Slack compose textarea.

**Expected Result:** Pre-filled message follows the format:
```
*Port Authority of Santos* — DEPLOYMENT | Brazil
Score: 92/100 | Use Case: Container Yard Inspection

Port of Santos has deployed DJI Dock 2 drones for automated container yard inspection...

https://example.com/santos-drone-article
```
All fields are populated from the scored article data.

**Priority:** P0

---

### TC-902 — Editable message before sending

**Scenario:** User can modify the Slack message before sending.

**Pre-conditions:** Slack compose textarea visible in drawer.

**Steps:**
1. Click into the textarea.
2. Add a custom note: "Follow up with Santos port authority contact."
3. Click "Slack Internally."

**Expected Result:** The edited message (with the custom note) is what gets "sent" (in mock, what would be posted to Slack). The system does not revert to the pre-filled message. User edits are respected.

**Priority:** P0

---

### TC-903 — Non-English articles: English summary

**Scenario:** For non-English articles, the Slack message uses the English summary.

**Pre-conditions:** A Portuguese article scored with an English summary by GPT-4o.

**Steps:**
1. Open the article drawer.
2. Observe the Slack compose textarea.

**Expected Result:** The pre-filled message contains the English-language summary (translated by the LLM during scoring). No Portuguese text appears in the Slack compose area. The user can send this English summary to the #dock-radar channel.

**Priority:** P1

---

### TC-904 — Slack send: status update and UI transition

**Scenario:** Sending to Slack updates article status, shows toast, moves to Sent section.

**Pre-conditions:** Article drawer open, Slack message ready.

**Steps:**
1. Click "Slack Internally."
2. Observe toast.
3. Observe queue table.
4. Observe Sent section.

**Expected Result:** Toast appears: "Sent to #dock-radar." Article REMAINS in the queue. Slack button shows ✓ state. Drawer stays open. Article status updates to reflect it has been shared, but it remains in the Active Queue until "Mark as Reviewed" or "Dismiss" is clicked.

**Priority:** P0

---

### TC-905 — Slack + Bookmark on same article

**Scenario:** User can both Slack and Bookmark the same article.

**Pre-conditions:** Article drawer open in Step 3.

**Steps:**
1. Click "Slack Internally" — Slack button shows ✓, article stays in queue.
2. Click "Bookmark" — Bookmark button shows filled ★, article stays in queue.

**Expected Result:** The system supports both actions on the same article simultaneously. The article has both `shared_at` and `bookmarked_at` timestamps. Both button states (✓ and ★) are visible at the same time. Article remains in Active Queue. Dismiss would permanently remove it if applied later.

**Priority:** P1

---

### TC-906 — SlackMessage record creation

**Scenario:** Sending to Slack creates a SlackMessage record in mock data.

**Pre-conditions:** Article sent to Slack.

**Steps:**
1. Send an article to Slack.
2. (Internal verification) Check that a SlackMessage-equivalent record is created.

**Expected Result:** A SlackMessage record is created (in mock) with: article_id, channel_id (#dock-radar), message_text (the edited/pre-filled content), and sent_at timestamp. This record supports future audit trails and message history.

**Priority:** P2

---

### TC-907 — Sent section timestamp display

**Scenario:** Sent section shows relative timestamps.

**Pre-conditions:** Articles in the Sent section.

**Steps:**
1. Observe the timestamp column in the Sent section.

**Expected Result:** Timestamps display in relative format: "Sent 2h ago", "Sent 1d ago", "Sent just now", etc. Not absolute timestamps. Human-readable relative time.

**Priority:** P2

---

## Summary

| Category | Test Cases | P0 | P1 | P2 |
|----------|-----------|-----|-----|-----|
| 1. Step 1 — Collection | TC-101 to TC-117 | 5 | 8 | 2 |
| 2. Step 2 — Scoring | TC-201 to TC-222 | 4 | 15 | 2 |
| 3. Step 3 — Queue | TC-301 to TC-324 | 7 | 13 | 4 |
| 4. Duplicate Handling & Smart Memory | TC-401 to TC-414 | 10 | 4 | 0 |
| 5. Multi-Run Queue Behavior | TC-501 to TC-511 | 5 | 5 | 1 |
| 6. Scoring Edge Cases | TC-601 to TC-613 | 3 | 7 | 3 |
| 7. Step Navigation & State | TC-701 to TC-734 | 6 | 7 | 0 |
| 8. UI/UX Polish | TC-801 to TC-810 | 1 | 3 | 6 |
| 9. Slack Integration | TC-901 to TC-907 | 3 | 2 | 2 |
| **Total** | **~93 test cases** | **44** | **64** | **20** |

> **P0 tests must all pass** before Phase 1 can be considered shippable.
> P1 tests should pass for a quality release.
> P2 tests are polish — address if time permits.
