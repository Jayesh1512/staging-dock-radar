Visual Summary: The Full Funnel

 Google News RSS (40 articles)
      │
      ├── C1: Date filter ────────────── -5   (too old)
      ├── C2: Within-run dedup ───────── -8   (same URL or title)
      ├── C3: maxArticles cap ────────── -7   (over limit)
      │
      │   [20 articles sent to scoring]
      │
      ├── S0: Title keyword exclusion ── -2   (blacklisted words)
      ├── S1: URL fingerprint dedup ──── -2   (same URL params in DB)
      ├── S2: D4 cache ──────────────── (3 skip LLM, use cached score)
      ├── S3: URL+entities dedup ─────── -1   (same URL + company + country)
      ├── S4: Region filter ──────────── -5   (outside UAE/India)
      ├── S5: Semantic dedup ─────────── -1   (same company+country+signal)
      │
      │   [18 results returned to client]
      │
      ├── Q1: existingIds check ──────── -3   (already in queue)
      ├── Q1: minScore filter ────────── -3   (score < 40)
      ├── Q1: drop_reason/is_duplicate ─ -7   (various drops above)
      │
      ▼
   5 articles in Active Queue