# Cross-Funnel Duplicate Assessment
**Dock Radar — Internal Engineering Note**
*Last updated: 2026-03-18 | Prepared for: Internal team review*

---

## 1. Context

Dock Radar runs a 52-bucket campaign (26 weeks × West/East region groups) to collect and score
articles from Google News RSS. Each bucket fetches the same keyword set across a different
geographic edition of Google News. This document assesses where duplicate articles currently
enter the scoring pipeline despite multiple deduplication layers, and proposes a fix.

---

## 2. The Existing Filtering Pipeline

The following is a condensed map of all filters currently in place. The full single-run funnel
is documented in `Recording-filtering-logic.md`.

### Collection phase (`/api/collect`)

| Step | Method | Scope |
|---|---|---|
| C1 — Date filter | Drop articles outside the bucket's date window | Within run |
| C2 — Within-run URL dedup | Exact `normalized_url` match | Within run |
| C3 — Within-run title dedup | Jaccard similarity ≥ 0.80 on word sets | Within run |
| C4 — maxArticles cap | Truncate to 50 articles | Within run |

### Scoring phase (`/api/score`)

| Step | Method | Scope |
|---|---|---|
| S0 — Title keyword exclusion | Drop articles whose title matches exclusion list | Per call |
| S1 — URL fingerprint dedup | Skip scoring if `hostname+path+params` already in `scored_articles` | Cross-run (same URL) |
| S2 — D4 cache | Return existing score if `article_id` already in `scored_articles` | Cross-run (same article_id) |
| S3 — URL+entities dedup | Mark duplicate if `url_fingerprint+company+country+city` already seen | Cross-run (same fingerprint+entities) |
| S4 — Gate 2 semantic dedup | Mark duplicate if `company+country+signal_type` match + summary Jaccard ≥ 0.75 | Within scoring batch only |

### Queue phase (client)

| Step | Method | Scope |
|---|---|---|
| Q1 — ever_queued gate | Skip articles already promoted to Step 3 in a prior run | Cross-run |
| Q2 — minScore filter | Exclude score < 50 from queue | Per run |
| Q3 — drop_reason / is_duplicate | Exclude flagged articles | Per run |

---

## 3. The Gap: Cross-Run, Cross-Regional-Edition Duplicates

### What is happening

Google News RSS serves **different CBMi tokens per regional edition** for the same underlying article.
A CBMi token is the opaque path segment in every Google News redirect URL:

```
US edition:   https://news.google.com/rss/articles/CBMi_AAAAAAA...?hl=en-US&gl=US&ceid=US%3Aen
UK edition:   https://news.google.com/rss/articles/CBMi_BBBBBBB...?hl=en-GB&gl=GB&ceid=GB%3Aen
SG edition:   https://news.google.com/rss/articles/CBMi_CCCCCCC...?hl=en-SG&gl=SG&ceid=SG%3Aen
```

These are three different URLs pointing to the same press release. Every deduplication layer
that operates on the URL or its fingerprint treats them as three distinct articles.

### Why each layer fails

| Layer | Why it misses |
|---|---|
| **C2 — Within-run URL dedup** | Different CBMi paths → `normalized_url` differs → no match. *Also*, W1 West and W1 East are separate `/api/collect` calls so this layer never sees both. |
| **DB UNIQUE on `normalized_url`** | Same reason — different paths → both rows inserted into `articles` table with different `article_id` values. |
| **S1 — URL fingerprint dedup** | `urlFingerprint()` = `hostname + pathname + params`. Different CBMi pathname → different fingerprint → both pass the "already scored?" check. |
| **S3 — URL+entities dedup** | `dedupKey = url_fingerprint \| company \| country \| city`. Since `url_fingerprint` differs between editions, the key always differs even when company/country/city are identical. |
| **S4 — Gate 2 semantic dedup** | Only runs within a **single scoring batch**. W1 West and W1 East are scored in separate `/api/score` calls minutes or hours apart → never in the same batch → semantic dedup never fires between them. |

### Confirmed example: Volatus Aerospace (W1 of DSP Campaign)

During the 52-bucket sprint we observed Volatus Aerospace appearing in:

- **W1 West** — scored 90 (Hot Lead) via US/UK/France/Germany editions
- **W1 East** — scored 70 (Strong Signal) via India/Singapore/Australia editions

Same article. Both marked as valid, non-duplicate records. Both counted in the `at 50+`
aggregate stat. The company appeared to be two separate leads when it is one.

**Impact on total signal count**: Unknown without full audit. Given 6 keywords × 16 regions
over 26 weeks, the theoretical maximum duplicate rate for articles covered by multiple editions
is significant. Conservative estimate: 10–20% of the 31 "strong signal" records may be
cross-edition duplicates of the same story.

---

## 4. Why the `dedupKey` Design Cannot Fix This Alone

The current `dedupKey` function in `url-fingerprint.ts`:

```typescript
export function dedupKey(urlFingerprintValue, company, country, city) {
  return `${urlFingerprintValue}|${c}|${co}|${ci}`;
}
```

The URL fingerprint is **part of the key**. Removing it and using only `company|country|city`
would reduce false negatives for this specific case but would create false positives: two
genuinely different articles from the same company in the same country (e.g. a funding round
AND a deployment) would both be incorrectly marked as duplicates.

The semantic dedup (Gate 2) was designed to handle this case — but only within a batch, not
across batches from different regional scoring calls.

---

## 5. Proposed Fix: Title Jaccard Check at Collect Time vs DB

**Insertion point**: Between collect and scoring, before any LLM cost.

**Mechanism**:

1. After `/api/collect` returns articles for a bucket, load the titles of all
   already-scored articles for the same campaign from DB.
2. For each newly collected article, run Jaccard title similarity (≥ 0.80) against all
   loaded titles.
3. Drop any article that matches an existing title before it enters scoring.

**Why this works**:
- Title Jaccard is robust to URL variance (CBMi tokens are irrelevant).
- It fires before LLM costs — zero extra API spend for duplicates.
- It's already implemented for within-run dedup (`deduplicateWithinRun` in `dedup.ts`) —
  the same Jaccard logic extends naturally to the cross-run case.
- Titles are available without fetching article bodies.

**What needs to change in code**:

```
db.ts:  extend loadDedupKeysFromScoredArticles()
        → also return article titles (join articles table)
        → return: { existingUrlFingerprints, existingDedupKeys, existingTitles: string[] }

/api/score route:  pass existingTitles to the collect phase OR
CampaignPanel:     load existingTitles before each scoreChunked() call,
                   filter articles by title Jaccard before passing to scoreChunked
```

**Scope of change**: Medium. Requires:
- One additional DB query (article titles for campaign runs)
- One Jaccard pass at collect-complete time (O(n × m) on titles, cheap)
- No changes to scoring prompt, DB schema, or scoring logic

**Campaign scope**: The title cache should be **scoped per campaign** (e.g., C1 articles do
not gate-check against C2 articles). Different campaigns intentionally use different keywords
and may legitimately score the same company for different signal types.

---

## 6. Multi-Campaign Implications

When C2 (Direct Operators) and C3 (Adjacent Ops) run over the same 6-month window as C1:

| Scenario | Risk | Mitigation |
|---|---|---|
| Same article collected by C1 and C2 under different keywords | High — different keywords can surface same article | Title Jaccard scoped **per campaign** prevents cross-bucket dups within C2; cross-campaign dups are acceptable (different scoring context) |
| Same DSP company scored in both C1 and C2 from different articles | Acceptable — two different articles about the same company are genuinely different signals | No mitigation needed; the combined company list is the desired TOFU output |
| Same article in W/E buckets of the same campaign | The confirmed gap above | Title Jaccard fix resolves this |

---

## 7. Recommendations

### Immediate (before running C2)
1. **Download and archive C1 CSV** via `/api/campaign-export` — this is the baseline for
   comparison.
2. **Audit the C1 data** in the CSV: group by `Company`, look for the same company appearing
   in both West and East rows with similar summaries. This gives the actual duplicate count.

### Short-term (1 sprint)
3. **Implement the title Jaccard collect-time check** as described in Section 5.
4. **Scope it per campaign** so C1/C2/C3 remain independent TOFU layers.

### Longer-term
5. **Consider resolved URL dedup**: after body fetch, `resolved_url` is the actual publisher
   URL (not Google News redirect). If we fingerprint the `resolved_url` instead of (or in
   addition to) the Google News URL, S1 would catch cross-edition duplicates naturally.
   This is a clean fix but requires resolved URLs to be available at pre-score time
   (currently they're only populated after body fetch).

---

## 8. Summary Table

| Dedup Layer | Within-run | Cross-run, same URL | Cross-run, diff CBMi | Cross-campaign |
|---|---|---|---|---|
| C2 Within-run URL | ✅ | ❌ | ❌ | ❌ |
| C3 Within-run title Jaccard | ✅ | ❌ | ❌ | ❌ |
| DB UNIQUE normalized_url | ✅ | ✅ | ❌ | ✅ (if same URL) |
| S1 URL fingerprint | ✅ | ✅ | ❌ | ✅ (if same URL) |
| S3 URL+entities dedupKey | ✅ | ✅ | ❌ | N/A |
| S4 Gate 2 semantic | ✅ (within batch) | ❌ | ❌ | ❌ |
| **Proposed: Title Jaccard vs DB** | ✅ | ✅ | ✅ | Scoped per campaign |

The proposed fix fills the only column that every existing layer misses.

---

*Document prepared by Claude Code for internal engineering review.*
*Next step: Schedule 30-min review session to align on implementation approach before C2 launch.*
