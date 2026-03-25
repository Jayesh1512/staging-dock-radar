"use client";

import React, { useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { Navbar } from "@/components/shared/Navbar";

/* ─── Types ─── */

interface SourceUrl {
  link: string;
  title: string;
  snippet: string;
  type: "direct" | "social";
  socialPlatform?: string;
}

interface CrawlResultItem {
  url: string;
  ok: boolean;
  charCount: number;
  timeMs: number;
  error?: string;
  textPreview: string;
}

interface Signal {
  tier: string;
  keyword: string;
  count: number;
  points: number;
}

interface CompanyResult {
  rank: number;
  slug: string;
  companyName: string;
  domains: string[];
  entityType: string;
  fence: string | null;
  lastSeen: string | null;
  totalScore: number;
  normalizedScore: number;
  freshnessBand: "fresh" | "warm" | "stale" | "unknown";
  freshnessLabel: string;
  snippetScore: number;
  tier1Hit: boolean;
  tier2Hit: boolean;
  topSignal: string;
  signalCount: number;
  signals: Signal[];
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  resultCount: number;
  sourceUrls: SourceUrl[];
  crawlResults: CrawlResultItem[];
}

interface FinalResults {
  keyword: string;
  country: string;
  pages: number;
  totalRawResults: number;
  totalEntities: number;
  scoredEntities: number;
  litmusCompany: string | null;
  litmusPass: boolean | null;
  companies: CompanyResult[];
}

/* ─── Sorting ─── */

type SortKey = "rank" | "slug" | "entityType" | "totalScore" | "tier1Hit" | "tier2Hit" | "topSignal" | "signalCount" | "lastSeen" | "resultCount";
type SortDir = "asc" | "desc";

function comparator(a: CompanyResult, b: CompanyResult, key: SortKey, dir: SortDir): number {
  let cmp = 0;
  switch (key) {
    case "rank":        cmp = a.rank - b.rank; break;
    case "slug":        cmp = a.slug.localeCompare(b.slug); break;
    case "entityType":  cmp = a.entityType.localeCompare(b.entityType); break;
    case "totalScore":  cmp = a.normalizedScore - b.normalizedScore; break;
    case "tier1Hit":    cmp = (a.tier1Hit ? 1 : 0) - (b.tier1Hit ? 1 : 0); break;
    case "tier2Hit":    cmp = (a.tier2Hit ? 1 : 0) - (b.tier2Hit ? 1 : 0); break;
    case "topSignal":   cmp = a.topSignal.localeCompare(b.topSignal); break;
    case "signalCount": cmp = a.signalCount - b.signalCount; break;
    case "lastSeen":    cmp = (a.lastSeen ?? "").localeCompare(b.lastSeen ?? ""); break;
    case "resultCount": cmp = a.resultCount - b.resultCount; break;
  }
  return dir === "desc" ? -cmp : cmp;
}

/* ─── Country options ─── */
const COUNTRIES = [
  { code: "FR", label: "France" },
  { code: "DE", label: "Germany" },
  { code: "UK", label: "United Kingdom" },
  { code: "AU", label: "Australia" },
  { code: "US", label: "United States" },
  { code: "IN", label: "India" },
  { code: "AE", label: "UAE" },
  { code: "SA", label: "Saudi Arabia" },
  { code: "NL", label: "Netherlands" },
  { code: "IT", label: "Italy" },
  { code: "ES", label: "Spain" },
  { code: "SG", label: "Singapore" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
  { code: "BR", label: "Brazil" },
];

/* ─── Scoring Rules Panel ─── */

function ScoringRulesPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, marginBottom: 16, overflow: "hidden" }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ padding: "10px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>Scoring Rules</span>
          <span style={{ fontSize: 11, color: "#B45309" }}>How entities are scored and classified</span>
        </div>
        <span style={{ fontSize: 12, color: "#92400E" }}>{open ? "Hide" : "Show"}</span>
      </div>
      {open && (
        <div style={{ padding: "0 16px 14px", borderTop: "1px solid #FDE68A" }}>
          {/* Tier scoring */}
          <div style={{ marginTop: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 6 }}>Normalized Score (0-100) — per tier capped at 3 matches</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #E5E7EB" }}>
                  <th style={{ ...ruleThStyle, width: 70 }}>Tier</th>
                  <th style={{ ...ruleThStyle, width: 60 }}>×weight</th>
                  <th style={{ ...ruleThStyle, textAlign: "left" }}>Keywords</th>
                  <th style={{ ...ruleThStyle, width: 90 }}>Max pts</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={ruleTdStyle}><span style={{ background: "#FEE2E2", color: "#991B1B", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>Tier 1</span></td>
                  <td style={{ ...ruleTdStyle, fontWeight: 700 }}>×20</td>
                  <td style={{ ...ruleTdStyle, textAlign: "left" }}>dji dock, dock 2, dock 3</td>
                  <td style={ruleTdStyle}>60</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={ruleTdStyle}><span style={{ background: "#FEF3C7", color: "#92400E", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>Tier 2</span></td>
                  <td style={{ ...ruleTdStyle, fontWeight: 700 }}>×12</td>
                  <td style={{ ...ruleTdStyle, textAlign: "left" }}>bvlos, sora, luc</td>
                  <td style={ruleTdStyle}>36</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={ruleTdStyle}><span style={{ background: "#DBEAFE", color: "#1E40AF", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>Tier 3</span></td>
                  <td style={{ ...ruleTdStyle, fontWeight: 700 }}>×4</td>
                  <td style={{ ...ruleTdStyle, textAlign: "left" }}>inspection, surveillance, infrastructure, mining, construction, railway, pipeline, wind farm, solar, oil and gas, sécurité, énergie</td>
                  <td style={ruleTdStyle}>12</td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ ...ruleTdStyle, textAlign: "right", color: "#6B7280" }}>Freshness bonus</td>
                  <td style={{ ...ruleTdStyle, textAlign: "left", color: "#6B7280" }}>≤3mo: +5 · 3-6mo: +3 · 6mo+ / no date: +0</td>
                  <td style={ruleTdStyle}>5</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Entity classification */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 6 }}>Entity Classification (v5)</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              {[
                { label: "DSP/SI", bg: "#DCFCE7", color: "#166534", desc: "Service company — integrator, operator, consulting" },
                { label: "Reseller", bg: "#FEF3C7", color: "#92400E", desc: "Sells hardware — e-commerce, retail, parts" },
                { label: "Reseller 🔶", bg: "#FEF3C7", color: "#92400E", desc: "Reseller with hybrid signal (rental, enterprise)" },
                { label: "Media", bg: "#E0E7FF", color: "#3730A3", desc: "News, blog, press release" },
              ].map(t => (
                <div key={t.label} style={{ flex: "1 1 200px", padding: "6px 10px", background: t.bg, borderRadius: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: t.color }}>{t.label}</span>
                  <div style={{ fontSize: 10, color: t.color, opacity: 0.8, marginTop: 2 }}>{t.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: "#6B7280", lineHeight: 1.6 }}>
              Priority: DJI domain/slug → Reseller · Domain pattern (.store, shop.) → Reseller · Then two-tier content analysis:<br />
              Primary service signals (intégrateur, prestation, déploiement, consulting, projet) + secondary product signals (autonome, sécurité, mission, bvlos) both present → DSP/SI.<br />
              Primary only + reseller signals → Reseller (product-copy leakage). Secondary only + no reseller → DSP/SI.
            </div>
          </div>

          {/* How it works */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 4 }}>How It Works</div>
            <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.7 }}>
              1. Google search via Serper.dev API with region targeting (gl parameter)<br />
              2. Results grouped by company — social URLs (LinkedIn, Facebook) mapped to company entities<br />
              3. Snippet pre-scoring from Google title + snippet text<br />
              4. Waterfall crawl: entities with signals get pages fetched (up to 1000 chars per page)<br />
              5. Final score = snippet + crawl signals. Normalized to 0-100 for pipeline import.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Component ─── */

export default function GoogleDockCrawlerPage() {
  const [keyword, setKeyword] = useState("DJI Dock");
  const [country, setCountry] = useState("FR");
  const [pages, setPages] = useState(5);
  const [litmusCompany, setLitmusCompany] = useState("");

  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<FinalResults | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [importState, setImportState] = useState<"idle" | "previewing" | "previewed" | "importing" | "done" | "error">("idle");
  const [importPreview, setImportPreview] = useState<{ total_input: number; after_filter: number; filtered_out: number; already_imported: number; new_records: number; filter_reasons: { zero_score: number; media_no_dock_signal: number; excluded_social_only: number } } | null>(null);
  const [importStats, setImportStats] = useState<{ imported: number; filtered: number; errors: number } | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("totalScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((line: string) => {
    setLogs(prev => [...prev, line]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "slug" || key === "entityType" ? "asc" : "desc");
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  async function saveReport() {
    if (!results) return;
    setSaveState("saving");
    setSavedPath(null);
    try {
      const res = await fetch("/api/google-search-crawler/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSavedPath(json.path);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      console.error(err);
    }
  }

  async function previewImport() {
    if (!results) return;
    setImportState("previewing");
    setImportPreview(null);
    try {
      const res = await fetch("/api/source-candidates/import/google-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: results.keyword, country: results.country, companies: results.companies, preview: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setImportPreview(json.stats);
      setImportState("previewed");
    } catch (err) {
      console.error(err);
      setImportState("error");
    }
  }

  async function confirmImport() {
    if (!results) return;
    setImportState("importing");
    setImportStats(null);
    try {
      const res = await fetch("/api/source-candidates/import/google-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: results.keyword, country: results.country, companies: results.companies }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setImportStats({ imported: json.imported, filtered: json.filtered_out, errors: json.errors });
      setImportState("done");
    } catch (err) {
      console.error(err);
      setImportState("error");
    }
  }

  async function runCrawl() {
    setStatus("running");
    setLogs([]);
    setResults(null);
    setExpandedRow(null);
    setSaveState("idle");
    setSavedPath(null);
    setImportState("idle");
    setImportPreview(null);
    setImportStats(null);
    setSortKey("totalScore");
    setSortDir("desc");

    try {
      const res = await fetch("/api/google-dock-crawler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, country, pages, litmusCompany: litmusCompany.trim() || undefined }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === "log") {
              addLog(parsed.data);
            } else if (parsed.type === "results") {
              setResults(parsed.data as FinalResults);
            } else if (parsed.type === "error") {
              addLog(`ERROR: ${parsed.data.message}`);
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      setStatus("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      addLog(`FATAL: ${msg}`);
      setStatus("error");
    }
  }

  const scored = useMemo(() => {
    const list = results?.companies.filter(c => c.totalScore > 0) ?? [];
    return [...list].sort((a, b) => comparator(a, b, sortKey, sortDir));
  }, [results, sortKey, sortDir]);

  const unscored = results?.companies.filter(c => c.totalScore === 0) ?? [];

  return (
    <main style={{ minHeight: "100vh", background: "#F8FAFC" }}>
      <Navbar />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>

        {/* ── Scoring Rules (always visible, collapsible) ── */}
        <ScoringRulesPanel />

        {/* ── Input Panel ── */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "16px 20px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 12 }}>Search Configuration</div>
          {/* Inputs row */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: "#6B7280", display: "block", marginBottom: 4 }}>Keyword</label>
              <input
                type="text"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                disabled={status === "running"}
                style={{ padding: "6px 10px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, width: 200 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#6B7280", display: "block", marginBottom: 4 }}>Country / Region</label>
              <select
                value={country}
                onChange={e => setCountry(e.target.value)}
                disabled={status === "running"}
                style={{ padding: "6px 10px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, width: 160 }}
              >
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.label} ({c.code})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#6B7280", display: "block", marginBottom: 4 }}>Pages (10 results each)</label>
              <input
                type="number"
                value={pages}
                onChange={e => setPages(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                disabled={status === "running"}
                min={1}
                max={10}
                style={{ padding: "6px 10px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, width: 80 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#6B7280", display: "block", marginBottom: 4 }}>Litmus check (optional)</label>
              <input
                type="text"
                value={litmusCompany}
                onChange={e => setLitmusCompany(e.target.value)}
                disabled={status === "running"}
                placeholder="e.g. instadrone"
                style={{ padding: "6px 10px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, width: 140 }}
              />
            </div>
          </div>
          {/* Buttons row */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={runCrawl}
              disabled={status === "running" || !keyword.trim()}
              style={{
                padding: "7px 20px",
                background: status === "running" ? "#9CA3AF" : "#2563EB",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: status === "running" ? "not-allowed" : "pointer",
              }}
            >
              {status === "running" ? "Running..." : "Run Search"}
            </button>
            <button
              onClick={saveReport}
              disabled={!results || saveState === "saving"}
              style={{
                padding: "7px 18px",
                background: saveState === "saved" ? "#059669" : saveState === "error" ? "#DC2626" : "#111827",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: (!results || saveState === "saving") ? "not-allowed" : "pointer",
                opacity: !results || saveState === "saving" ? 0.35 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : saveState === "error" ? "Save failed" : "Save Report"}
            </button>
            <button
              onClick={previewImport}
              disabled={!results || importState === "previewing" || importState === "importing" || importState === "done"}
              style={{
                padding: "7px 18px",
                background: importState === "done" ? "#059669" : importState === "error" ? "#DC2626" : "#7C3AED",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: (!results || importState === "previewing" || importState === "importing" || importState === "done") ? "not-allowed" : "pointer",
                opacity: !results || importState === "previewing" ? 0.35 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {importState === "previewing" ? "Loading…" : importState === "done" ? "Imported ✓" : importState === "error" ? "Import failed" : "Add to Multi-Source Pipeline"}
            </button>
          </div>
          {/* Status line */}
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>Query: &quot;{keyword}&quot; {country} · gl={country.toLowerCase()} · {pages} pages = ~{pages * 10} results · Cost: {pages} credits{litmusCompany.trim() ? ` · Litmus: "${litmusCompany.trim()}"` : ""}</span>
            {savedPath && <span style={{ color: "#6B7280" }}>Saved → <code style={{ background: "#F3F4F6", padding: "1px 5px", borderRadius: 3 }}>{savedPath}</code></span>}
            {importStats && <span style={{ color: "#7C3AED" }}>{importStats.imported} imported · {importStats.filtered} filtered{importStats.errors > 0 ? ` · ${importStats.errors} errors` : ""}</span>}
          </div>
        </div>

        {/* ── Live Log ── */}
        {logs.length > 0 && (
          <div style={{
            background: "#1E1E1E",
            border: "1px solid #374151",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 16,
            maxHeight: 320,
            overflowY: "auto",
            fontFamily: "'SF Mono', 'Fira Code', monospace",
          }}>
            <div style={{ fontSize: 11, color: "#6EE7B7", fontWeight: 700, marginBottom: 8 }}>Live Log</div>
            {logs.map((line, i) => (
              <div key={i} style={{
                fontSize: 11,
                color: line.includes("ERROR") || line.includes("FATAL") ? "#FCA5A5"
                  : line.includes("LITMUS PASS") ? "#6EE7B7"
                  : line.includes("LITMUS FAIL") ? "#FCA5A5"
                  : line.startsWith("  ✓") ? "#A7F3D0"
                  : line.startsWith("  ✗") ? "#FCA5A5"
                  : line.startsWith("──") ? "#93C5FD"
                  : line.startsWith("══") ? "#FDE68A"
                  : "#D1D5DB",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}>
                {line}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}

        {/* ── Summary Stats ── */}
        {results && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
            marginBottom: 16,
          }}>
            {[
              { label: "Raw Results", value: results.totalRawResults, color: "#6B7280" },
              { label: "Entities", value: results.totalEntities, color: "#2563EB" },
              { label: "DSP/SI", value: scored.filter(c => c.entityType === "operator").length, color: "#059669" },
              { label: "Resellers", value: scored.filter(c => c.entityType === "reseller").length, color: "#D97706" },
              { label: "Tier 1 Hits", value: scored.filter(c => c.tier1Hit).length, color: "#DC2626" },
              ...(results.litmusPass !== null ? [{
                label: `Litmus: ${results.litmusCompany}`,
                value: results.litmusPass ? "PASS" : "FAIL",
                color: results.litmusPass ? "#059669" : "#DC2626",
              }] : []),
            ].map((stat, i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 11, color: "#6B7280" }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Import Preview Panel ── */}
        {importState === "previewed" && importPreview && (
          <div style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 10, padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#5B21B6", marginBottom: 10 }}>Import Preview — Multi-Source Pipeline</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#374151", marginBottom: 12 }}>
              <span><strong>{importPreview.total_input}</strong> total entities</span>
              <span>→ <strong>{importPreview.after_filter}</strong> pass filter</span>
              <span>→ <strong style={{ color: "#059669" }}>{importPreview.new_records}</strong> new</span>
              {importPreview.already_imported > 0 && <span>· <strong>{importPreview.already_imported}</strong> already in DB</span>}
            </div>
            {importPreview.filtered_out > 0 && (
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 12 }}>
                Filtered out: {importPreview.filter_reasons.zero_score > 0 && <span>{importPreview.filter_reasons.zero_score} zero-score · </span>}
                {importPreview.filter_reasons.media_no_dock_signal > 0 && <span>{importPreview.filter_reasons.media_no_dock_signal} media (no Dock signal) · </span>}
                {importPreview.filter_reasons.excluded_social_only > 0 && <span>{importPreview.filter_reasons.excluded_social_only} excluded-social-only</span>}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={confirmImport}
                style={{ padding: "7px 20px", background: "#7C3AED", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Confirm Import ({importPreview.new_records} records)
              </button>
              <button
                onClick={() => { setImportState("idle"); setImportPreview(null); }}
                style={{ padding: "7px 16px", background: "#fff", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Results Table ── */}
        {scored.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Scored Entities ({scored.length})</span>
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>Click header to sort · Click row to expand</span>
            </div>
            <div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                <colgroup><col style={{ width: "3%" }} /><col style={{ width: "28%" }} /><col style={{ width: "7%" }} /><col style={{ width: "6%" }} /><col style={{ width: "5%" }} /><col style={{ width: "6%" }} /><col style={{ width: "10%" }} /><col style={{ width: "6%" }} /><col style={{ width: "9%" }} /><col style={{ width: "16%" }} /><col style={{ width: "4%" }} /></colgroup>
                <thead>
                  <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                    <SortTh k="rank" label="#" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} />
                    <SortTh k="slug" label="Entity" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} align="left" />
                    <SortTh k="entityType" label="Type" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} />
                    <SortTh k="totalScore" label="Score" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} />
                    <SortTh k="tier1Hit" label="Dock" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} title="Tier 1: DJI Dock keyword match" />
                    <SortTh k="tier2Hit" label="BVLOS" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} title="Tier 2: BVLOS/SORA/LUC keyword match" />
                    <SortTh k="topSignal" label="Top Signal" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} align="left" />
                    <SortTh k="signalCount" label="Signals" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} />
                    <SortTh k="lastSeen" label="Last Seen" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} />
                    <th style={{ ...thStyle, textAlign: "left" }}>Domains</th>
                    <SortTh k="resultCount" label="Src" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {scored.map((c) => (
                    <React.Fragment key={c.slug}>
                      <tr
                        onClick={() => setExpandedRow(expandedRow === c.rank ? null : c.rank)}
                        style={{
                          borderBottom: "1px solid #F3F4F6",
                          cursor: "pointer",
                          background: expandedRow === c.rank ? "#EFF6FF" : c.tier1Hit ? "#FEF2F2" : "transparent",
                        }}
                      >
                        <td style={tdStyle}>{c.rank}</td>
                        <td style={{ ...tdStyle, textAlign: "left", whiteSpace: "normal", lineHeight: 1.3 }}>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{c.companyName}</div>
                          {c.companyName.toLowerCase().replace(/\s/g, '') !== c.slug && (
                            <div style={{ fontSize: 10, color: "#9CA3AF" }}>{c.slug}</div>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                            background: c.entityType === "operator" ? "#DCFCE7" : c.entityType === "reseller" ? "#FEF3C7" : c.entityType === "media" ? "#E0E7FF" : "#F3F4F6",
                            color: c.entityType === "operator" ? "#166534" : c.entityType === "reseller" ? "#92400E" : c.entityType === "media" ? "#3730A3" : "#6B7280",
                          }}>
                            {c.entityType === "operator" ? "DSP/SI" : c.entityType === "reseller" ? "Reseller" : c.entityType === "media" ? "Media" : "—"}
                          </span>
                          {c.fence && <span title={c.fence} style={{ marginLeft: 3, fontSize: 10, cursor: "help" }}>🔶</span>}
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: c.normalizedScore >= 70 ? "#DC2626" : c.normalizedScore >= 30 ? "#D97706" : "#6B7280" }}>
                          {c.normalizedScore}
                        </td>
                        <td style={tdStyle}>{c.tier1Hit ? "✓" : ""}</td>
                        <td style={tdStyle}>{c.tier2Hit ? "✓" : ""}</td>
                        <td style={{ ...tdStyle, textAlign: "left" }}>{c.topSignal}</td>
                        <td style={tdStyle}>{c.signalCount}</td>
                        <td style={{ ...tdStyle, fontSize: 11, color: c.lastSeen ? "#374151" : "#D1D5DB" }}>
                          {c.freshnessBand === "fresh" && <span title="Fresh (≤3mo)" style={{ background: "#DCFCE7", color: "#166534", padding: "1px 4px", borderRadius: 3, fontSize: 9, fontWeight: 700, marginRight: 4 }}>NEW</span>}
                          {c.freshnessBand === "warm" && <span title="Warm (3-6mo)" style={{ background: "#FEF3C7", color: "#92400E", padding: "1px 4px", borderRadius: 3, fontSize: 9, fontWeight: 700, marginRight: 4 }}>6mo</span>}
                          {c.freshnessBand === "stale" && <span title="Stale (6mo+)" style={{ background: "#FEE2E2", color: "#991B1B", padding: "1px 4px", borderRadius: 3, fontSize: 9, fontWeight: 700, marginRight: 4 }}>OLD</span>}
                          {c.lastSeen ?? "—"}
                        </td>
                        <td style={{ ...tdStyle, fontSize: 11, color: "#6B7280", textAlign: "left", whiteSpace: "normal", wordBreak: "break-all", lineHeight: 1.4 }}>{c.domains.join(", ")}</td>
                        <td style={tdStyle}>{c.resultCount}</td>
                      </tr>
                      {expandedRow === c.rank && (
                        <tr key={`${c.slug}-detail`}>
                          <td colSpan={11} style={{ padding: "12px 16px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                            {/* Signals detail */}
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 4 }}>Signals</div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {c.signals.map((s, si) => (
                                  <span key={si} style={{
                                    padding: "2px 8px",
                                    borderRadius: 12,
                                    fontSize: 11,
                                    background: s.tier === "tier1" ? "#FEE2E2" : s.tier === "tier2" ? "#FEF3C7" : "#DBEAFE",
                                    color: s.tier === "tier1" ? "#991B1B" : s.tier === "tier2" ? "#92400E" : "#1E40AF",
                                  }}>
                                    {s.keyword} x{s.count} ({s.points}pts)
                                  </span>
                                ))}
                              </div>
                            </div>
                            {/* Source URLs */}
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 4 }}>Source URLs</div>
                              {c.sourceUrls.map((u, ui) => (
                                <div key={ui} style={{ fontSize: 11, marginBottom: 4 }}>
                                  <span style={{
                                    display: "inline-block",
                                    padding: "1px 5px",
                                    borderRadius: 4,
                                    fontSize: 10,
                                    marginRight: 6,
                                    background: u.type === "social" ? "#EDE9FE" : "#ECFDF5",
                                    color: u.type === "social" ? "#5B21B6" : "#065F46",
                                  }}>
                                    {u.type === "social" ? u.socialPlatform : "web"}
                                  </span>
                                  <a href={u.link} target="_blank" rel="noopener noreferrer" style={{ color: "#2563EB", textDecoration: "none" }}>
                                    {u.link.length > 80 ? u.link.substring(0, 80) + "..." : u.link}
                                  </a>
                                  <div style={{ color: "#6B7280", fontSize: 11, marginLeft: 48, marginTop: 2 }}>
                                    {u.snippet.substring(0, 150)}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {/* Crawl results */}
                            {c.crawlResults.length > 0 && (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 4 }}>Crawled Pages</div>
                                {c.crawlResults.map((cr, ci) => (
                                  <div key={ci} style={{ fontSize: 11, marginBottom: 4, color: cr.ok ? "#065F46" : "#991B1B" }}>
                                    {cr.ok ? "✓" : "✗"} {cr.url.substring(0, 70)} ({cr.ok ? `${cr.charCount} chars, ${cr.timeMs}ms` : cr.error})
                                    {cr.ok && cr.textPreview && (
                                      <div style={{ color: "#6B7280", fontSize: 10, marginLeft: 16, marginTop: 2, whiteSpace: "pre-wrap" }}>
                                        {cr.textPreview}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Unscored Entities ── */}
        {unscored.length > 0 && (
          <details style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, marginBottom: 16 }}>
            <summary style={{ padding: "10px 16px", fontSize: 12, color: "#6B7280", cursor: "pointer" }}>
              Unscored entities ({unscored.length}) — no keyword matches in snippets
            </summary>
            <div style={{ padding: "0 16px 12px" }}>
              {unscored.map((c, i) => (
                <div key={i} style={{ fontSize: 11, color: "#9CA3AF", padding: "3px 0", borderBottom: "1px solid #F3F4F6" }}>
                  {c.companyName} ({c.slug}) — {c.domains.join(", ")} — {c.resultCount} result(s)
                  {c.sourceUrls.map((u, ui) => (
                    <div key={ui} style={{ marginLeft: 16, fontSize: 10, color: "#D1D5DB" }}>
                      {u.type === "social" ? `[${u.socialPlatform}]` : "[web]"} {u.link.substring(0, 80)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </details>
        )}

      </div>
    </main>
  );
}

/* ─── Sortable Table Header ─── */

function SortTh({ k, label, sortKey, sortDir, onClick, align, title }: {
  k: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (key: SortKey) => void;
  align?: "left" | "center";
  title?: string;
}) {
  const active = sortKey === k;
  const arrow = active ? (sortDir === "asc" ? " ▲" : " ▼") : " ▿";
  return (
    <th
      onClick={() => onClick(k)}
      title={title}
      style={{
        ...thStyle,
        textAlign: align ?? "center",
        cursor: "pointer",
        userSelect: "none",
        color: active ? "#111827" : "#6B7280",
        background: active ? "#EFF6FF" : undefined,
      }}
    >
      {label}<span style={{ opacity: active ? 1 : 0.35, fontSize: 9 }}>{arrow}</span>
    </th>
  );
}

/* ─── Styles ─── */
const thStyle: React.CSSProperties = {
  padding: "7px 6px",
  fontSize: 11,
  fontWeight: 600,
  color: "#6B7280",
  textAlign: "center",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "7px 6px",
  textAlign: "center",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const ruleThStyle: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: 10,
  fontWeight: 600,
  color: "#6B7280",
  textAlign: "center",
};

const ruleTdStyle: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: 11,
  textAlign: "center",
};
