# Dock Radar v2 — Hackathon PRD

**Project:** Dock Radar
**Timebox:** 6-hour internal hackathon
**Owner:** FlytBase BD

---

## Problem Statement

Dock Radar is FlytBase's internal growth-hacking and social listening tool that monitors news and social channels to identify drone operators using DJI Dock hardware. Today it collects and scores signals but stops short of acting on them. This hack extends it with three capabilities: a daily social listening feed surfacing who's talking about DJI docks across channels; an approval-based qualification pipeline that moves prospects from raw signal to CRM-ready; and a deal intelligence agent that answers questions about sourced leads from everything we've collected.

---

## Existing Context

Dock Radar runs a 3-step pipeline: collect articles from Google News and LinkedIn → LLM-score for drone deployment signals → review queue with Slack sharing. It identifies DSPs and SIs using DJI Dock hardware and surfaces a ranked Partner Hit List. What's missing is everything that happens *after* the signal: no daily feed, no lead workflow, no way to query what we know.

---

## The 3 Features

### 1. Daily Social Listening Feed
A morning briefing showing all new DJI Dock signals from the last 24h — grouped by company, tagged new vs. known, with source links.

### 2. Qualification Pipeline Board
An approval-based Kanban-style board with 4 stages (New → Approved → Outreach → CRM-Ready) to move prospects from raw signal to handoff.

### 3. Deal Intelligence Agent
A chat interface that answers questions about any sourced lead by querying collected articles and enrichment data using an LLM.

---

## Out of Scope

- Drag-and-drop Kanban (use dropdowns)
- Automated cron collection (manual refresh)
- External enrichment (Apollo, Lemlist) in v0
- CRM integration (handoff is a status flag only)

---

## DB Changes

| Change | Detail |
|--------|--------|
| `pipeline_stage` column | Add to `discovered_companies` — enum: `new`, `approved`, `outreach`, `crm_ready`, `rejected` |
| `lead_actions` table | Audit log: stage transitions with actor, timestamp, and optional note |

---

## Success Criteria

- BD team opens the app each morning and sees what's new without running a collection
- Any lead can be moved through 4 stages with one click and an optional note
- Team can type "What do we know about [Instadrone](https://instadrone.fr/)?" and get a sourced summary in under 10 seconds
