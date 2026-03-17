---
name: DSP 6-Month Campaign Plan
description: Campaign to find 20+ net-new DSP/SI partners globally using 6-month historical Google News sweep
type: project
---

## Goal
Find 20+ net-new DSPs/SIs globally not in FlytBase CRM (which has 80+ DSPs already). Build a repository via 6-month historical Google News sweep, subtract CRM, identify top 20 for leadership presentation.

## Architecture Decisions (Locked)
- **52 total runs**: 26 weekly windows × 2 regional groups (West: Americas+EU, East: APAC+MENA)
- **30 trimmed keywords** across 4 tiers (identity, activity, infrastructure, regulatory)
- **maxArticles: 40** (unchanged from default — in practice 30-60 unique articles per run after dedup)
- **minScore: 50** for campaign (bands: 75-100 High Value, 50-74 Strong Signal, 25-49 Weak, 0-24 Noise)
- **5 signal types**: DEPLOYMENT, CONTRACT, PARTNERSHIP, GROWTH, OTHER
- **Industry taxonomy**: Energy & Utilities | Public Safety & Emergency Response | Oil & Gas / Industrial Assets | Mining & Natural Resources | Construction & Infrastructure | Ports, Maritime & Logistics Hubs | Agriculture & Forestry | Perimeter Security & Smart Facilities | Water & Environmental Utilities | Other: [describe]
- **campaign column** on runs table (TEXT, nullable)
- **industry column** on scored_articles table (TEXT)
- **Buyer**: captured via entities[] type="buyer", no new column
- **No Slack/bookmark** actions on campaign articles
- **Mark all Reviewed** button at run level (already exists in Step 3)
- **Phase 1**: Manual runs Weeks 1-4 to validate quality, then bulk automation
- **DSP Hit List**: New nav page `/dsp-hitlist` showing aggregated companies, not individual articles

## Prompt Status
CAMPAIGN_SCORING_SYSTEM_PROMPT tested against 9 articles across all 4 score bands — validated and confirmed ready. Key validations: DJI OEM rule holds (Indonesian/Japanese articles), non-English translation works, person extraction works (Bernhard Kager from Globe Flight in German article), noise rejection clean (State Grid $250M scored 0).

## Build Plan (3 Sprints)
Sprint 1 (Enables manual validation): DB migration + date range in collect API + campaign prompt in score route + Campaign tab UI with manual Run buttons
Sprint 2 (Automation + visibility): Auto-queue "Run All" + Hit List page basic version
Sprint 3 (CRM subtraction + top 20): CRM CSV import + top 20 ranked export

**Why:** FlytBase has 80+ DSPs in CRM already — finding 20 net-new requires broad global coverage, especially non-English markets (Indonesia, Japan, Austria validated in testing as productive sources).
