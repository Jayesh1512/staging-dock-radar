-- Dock Radar — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query)

-- ─── Runs ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS runs (
  id            TEXT PRIMARY KEY,
  keywords      JSONB NOT NULL DEFAULT '[]',
  sources       JSONB NOT NULL DEFAULT '["google_news"]',
  regions       JSONB NOT NULL DEFAULT '[]',
  filter_days   INTEGER NOT NULL DEFAULT 7,
  min_score     INTEGER NOT NULL DEFAULT 40,
  max_articles  INTEGER NOT NULL DEFAULT 50,
  status        TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  articles_fetched  INTEGER NOT NULL DEFAULT 0,
  articles_stored   INTEGER NOT NULL DEFAULT 0,
  dedup_removed     INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

-- ─── Articles ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS articles (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  source          TEXT NOT NULL DEFAULT 'google_news' CHECK (source IN ('google_news', 'linkedin', 'facebook')),
  title           TEXT NOT NULL,
  url             TEXT NOT NULL,
  normalized_url  TEXT NOT NULL,
  snippet         TEXT,
  publisher       TEXT,
  published_at    TIMESTAMPTZ,
  resolved_url    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cross-run dedup: same normalized URL is never stored twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_normalized_url ON articles(normalized_url);

-- Fast lookup by run
CREATE INDEX IF NOT EXISTS idx_articles_run_id ON articles(run_id);

-- ─── Scored Articles ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scored_articles (
  id                TEXT PRIMARY KEY,
  article_id        TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  normalized_url    TEXT,
  url_fingerprint   TEXT,
  relevance_score   INTEGER NOT NULL DEFAULT 0,
  company           TEXT,
  country           TEXT,
  city              TEXT,
  use_case          TEXT,
  signal_type       TEXT NOT NULL DEFAULT 'OTHER' CHECK (signal_type IN ('DEPLOYMENT','CONTRACT','TENDER','PARTNERSHIP','EXPANSION','FUNDING','REGULATION','OTHER')),
  summary           TEXT,
  flytbase_mentioned BOOLEAN NOT NULL DEFAULT false,
  persons           JSONB NOT NULL DEFAULT '[]',
  entities          JSONB NOT NULL DEFAULT '[]',
  drop_reason       TEXT,
  is_duplicate      BOOLEAN NOT NULL DEFAULT false,
  status            TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'dismissed')),
  actions_taken     JSONB NOT NULL DEFAULT '[]',
  reviewed_at       TIMESTAMPTZ,
  dismissed_at      TIMESTAMPTZ,
  slack_sent_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One score per article
CREATE UNIQUE INDEX IF NOT EXISTS idx_scored_article_id ON scored_articles(article_id);

-- URL dedup: skip scoring when URL already in scored_articles
CREATE INDEX IF NOT EXISTS idx_scored_normalized_url ON scored_articles(normalized_url) WHERE normalized_url IS NOT NULL;

-- URL fingerprint + entities dedup
CREATE INDEX IF NOT EXISTS idx_scored_url_fingerprint ON scored_articles(url_fingerprint) WHERE url_fingerprint IS NOT NULL;

-- Queue queries: status + score
CREATE INDEX IF NOT EXISTS idx_scored_status ON scored_articles(status, relevance_score DESC);
