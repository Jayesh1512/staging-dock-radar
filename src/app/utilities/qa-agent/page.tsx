"use client";

import React, { useState, useRef, useCallback } from "react";
import { Navbar } from "@/components/shared/Navbar";

/* ─── Types (mirror server types) ─── */

interface QACompanyInput {
  name: string;
  domain: string;
  website?: string | null;
  linkedin_url?: string | null;
  country: string;
  city?: string | null;
  role?: string;
  sources_preloaded: string[];
  dock_models_preloaded?: string | null;
  evidence_url_preloaded?: string | null;
  notes_preloaded?: string | null;
}

interface QAResult {
  name: string;
  domain: string;
  country: string;
  role: string;
  dock_confirmed: boolean;
  dock_models: string;
  confidence: string;
  confidence_score: number;
  sources_confirmed: string[];
  evidence_url: string | null;
  evidence_summary: string;
  notes: string;
  serper: { found: boolean; hits: number; variant: string | null } | null;
  linkedin: { found: boolean; mentions: number } | null;
  website: string | null;
  linkedin_url: string | null;
}

interface QASummary {
  total: number;
  confirmed: number;
  high: number;
  medium: number;
  low: number;
  none: number;
  serper_credits_used: number;
}

/* ─── Sample data template ─── */

const SAMPLE_INPUT = `[
  {
    "name": "Escadrone",
    "domain": "escadrone.com",
    "website": "https://escadrone.com",
    "linkedin_url": "https://www.linkedin.com/company/escadrone",
    "country": "FR",
    "role": "System Integrator",
    "sources_preloaded": ["dji_dealer", "google_search", "comet"],
    "dock_models_preloaded": "Dock 1, 2, 3",
    "notes_preloaded": "DJI Enterprise dealer"
  }
]`;

/* ─── Badge colors ─── */

const SRC_COLORS: Record<string, { bg: string; text: string }> = {
  dji_dealer: { bg: "#DBEAFE", text: "#1E40AF" },
  google_search: { bg: "#FEF3C7", text: "#92400E" },
  comet: { bg: "#F3E8FF", text: "#7C3AED" },
  chatgpt: { bg: "#FEE2E2", text: "#991B1B" },
  serper_website: { bg: "#ECFDF5", text: "#065F46" },
  linkedin_posts: { bg: "#E0F2FE", text: "#0369A1" },
};

const SRC_LABELS: Record<string, string> = {
  dji_dealer: "DJI", google_search: "Google", comet: "Comet",
  chatgpt: "ChatGPT", serper_website: "Serper", linkedin_posts: "LinkedIn",
};

const CONF_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: "#DCFCE7", text: "#059669" },
  medium: { bg: "#FEF3C7", text: "#D97706" },
  low: { bg: "#FEE2E2", text: "#DC2626" },
  none: { bg: "#F3F4F6", text: "#6B7280" },
};

/* ─── Component ─── */

/* ─── DB Mode Types ─── */

interface DBVerifyProgress {
  index: number;
  total: number;
  domain: string;
  name: string;
  status: string;
  hits?: number;
  variant?: string;
  relevance?: string;
  evidence?: string;
}

interface DBVerifySummary {
  total: number;
  confirmed: number;
  direct: number;
  indirect: number;
  mention_only: number;
  not_found: number;
  errors: number;
  records_updated: number;
  puppeteerCandidates: number;
  puppeteerList: Array<{ name: string; domain: string; linkedin: string; source: string }>;
  dryRun: boolean;
}

const ALL_COUNTRIES = [
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "UK", name: "United Kingdom", flag: "🇬🇧" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "AE", name: "UAE", flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦" },
  { code: "TH", name: "Thailand", flag: "🇹🇭" },
];

export default function QAAgentPage() {
  const [mode, setMode] = useState<"upload" | "db">("db");

  // Upload mode state
  const [jsonInput, setJsonInput] = useState(SAMPLE_INPUT);
  const [country, setCountry] = useState("FR");
  const [runLabel, setRunLabel] = useState("");
  const [skipSerper, setSkipSerper] = useState(false);
  const [skipLinkedin, setSkipLinkedin] = useState(false);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, name: "" });
  const [results, setResults] = useState<QAResult[]>([]);
  const [summary, setSummary] = useState<QASummary | null>(null);
  const [reportPath, setReportPath] = useState<string | null>(null);
  const [confFilter, setConfFilter] = useState("all");
  const [dockFilter, setDockFilter] = useState("all");
  const logRef = useRef<HTMLDivElement>(null);

  // DB mode state
  const [dbCountries, setDbCountries] = useState<Set<string>>(new Set(["FR", "NL"]));
  const [dbDryRun, setDbDryRun] = useState(true);
  const [dbSampleSize, setDbSampleSize] = useState(30);
  const [dbRunning, setDbRunning] = useState(false);
  const [dbLogs, setDbLogs] = useState<string[]>([]);
  const [dbConfirmed, setDbConfirmed] = useState<DBVerifyProgress[]>([]);
  const [dbSummary, setDbSummary] = useState<DBVerifySummary | null>(null);
  const dbLogRef = useRef<HTMLDivElement>(null);

  // Country completion tracking (persisted in localStorage)
  const [completedCountries, setCompletedCountries] = useState<Record<string, { at: string; confirmed: number; total: number }>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("dock-verify-completed") || "{}"); } catch { return {}; }
  });
  const markCountriesComplete = useCallback((countries: string[], confirmed: number, total: number) => {
    setCompletedCountries(prev => {
      const next = { ...prev };
      const at = new Date().toISOString().split("T")[0];
      countries.forEach(cc => { next[cc] = { at, confirmed, total }; });
      if (typeof window !== "undefined") localStorage.setItem("dock-verify-completed", JSON.stringify(next));
      return next;
    });
  }, []);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev, msg]);
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
  }, []);

  const runAgent = useCallback(async () => {
    let companies: QACompanyInput[];
    try {
      companies = JSON.parse(jsonInput);
      if (!Array.isArray(companies)) throw new Error("Input must be a JSON array");
    } catch (e) {
      addLog(`ERROR: Invalid JSON — ${e instanceof Error ? e.message : "parse failed"}`);
      return;
    }

    setRunning(true);
    setLogs([]);
    setResults([]);
    setSummary(null);
    setReportPath(null);

    try {
      const res = await fetch("/api/qa-agent/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companies,
          country,
          runLabel: runLabel || `${country} QA Run`,
          skipSerper,
          skipLinkedin,
        }),
      });

      if (!res.ok || !res.body) {
        addLog(`ERROR: API returned ${res.status}`);
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
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
            const event = JSON.parse(line);
            switch (event.type) {
              case "log":
                addLog(event.data);
                break;
              case "progress":
                setProgress(event.data);
                addLog(`[${event.data.current}/${event.data.total}] ${event.data.name}`);
                break;
              case "step":
                addLog(`  ${event.data.step}: ${event.data.found ? "✓" : "✗"}${event.data.hits ? ` (${event.data.hits} hits)` : ""}${event.data.mentions ? ` (${event.data.mentions} mentions)` : ""}`);
                break;
              case "result":
                setResults(prev => [...prev, event.data]);
                break;
              case "summary":
                setSummary(event.data);
                addLog(`\nSummary: ${event.data.confirmed}/${event.data.total} confirmed · ${event.data.serper_credits_used} Serper credits`);
                break;
              case "report":
                setReportPath(event.data.path);
                addLog(`Report saved: ${event.data.path}`);
                break;
              case "done":
                addLog("Done.");
                break;
              case "error":
                addLog(`ERROR: ${event.data}`);
                break;
            }
          } catch { /* skip malformed lines */ }
        }
      }
    } catch (err) {
      addLog(`ERROR: ${err instanceof Error ? err.message : "Unknown"}`);
    }

    setRunning(false);
  }, [jsonInput, country, runLabel, skipSerper, skipLinkedin, addLog]);

  // DB mode: run verification from database
  const addDbLog = useCallback((msg: string) => {
    setDbLogs(prev => [...prev, msg]);
    setTimeout(() => dbLogRef.current?.scrollTo(0, dbLogRef.current.scrollHeight), 50);
  }, []);

  const runDbVerify = useCallback(async () => {
    if (dbCountries.size === 0) return;

    // Re-run warning for already-completed countries (live runs only)
    if (!dbDryRun) {
      const alreadyDone = [...dbCountries].filter(cc => completedCountries[cc]);
      if (alreadyDone.length > 0) {
        const msg = `These countries were already verified:\n${alreadyDone.map(cc => `  ${cc} — ${completedCountries[cc].at} (${completedCountries[cc].confirmed} confirmed)`).join("\n")}\n\nRe-running will re-check all records. Continue?`;
        if (!confirm(msg)) return;
      }
    }

    setDbRunning(true);
    setDbLogs([]);
    setDbConfirmed([]);
    setDbSummary(null);

    try {
      const res = await fetch("/api/registry/verify-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCodes: [...dbCountries], dryRun: dbDryRun, limit: dbDryRun ? dbSampleSize : 500 }),
      });

      if (!res.ok || !res.body) { addDbLog("ERROR: API " + res.status); setDbRunning(false); return; }

      const reader = res.body.getReader();
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
            const event = JSON.parse(line);
            switch (event.type) {
              case "log": addDbLog(event.data); break;
              case "progress":
                if (event.data.status === "confirmed") {
                  setDbConfirmed(prev => [...prev, event.data]);
                  addDbLog(`✓ [${event.data.index}/${event.data.total}] ${event.data.name} — ${event.data.hits} hits (${event.data.relevance}) ${event.data.variant || ""}`);
                } else if (event.data.status === "not_found" || event.data.status === "error") {
                  addDbLog(`  [${event.data.index}/${event.data.total}] ${event.data.name} — ${event.data.status}`);
                }
                break;
              case "summary":
                setDbSummary(event.data);
                // Mark countries as complete (only for live runs)
                if (!dbDryRun && event.data.total > 0) {
                  markCountriesComplete([...dbCountries], event.data.confirmed, event.data.total);
                }
                break;
              case "done": addDbLog("Done."); break;
              case "error": addDbLog("ERROR: " + event.data); break;
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      addDbLog("ERROR: " + (err instanceof Error ? err.message : "Unknown"));
    }
    setDbRunning(false);
  }, [dbCountries, dbDryRun, addDbLog]);

  // Filter results
  const filtered = results.filter(r => {
    if (confFilter !== "all" && r.confidence !== confFilter) return false;
    if (dockFilter === "yes" && !r.dock_confirmed) return false;
    if (dockFilter === "no" && r.dock_confirmed) return false;
    return true;
  });

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC" }}>
      <Navbar />
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 24px 64px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>QA Agent — DJI Dock Verification</h1>
        <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 16px" }}>
          Verify DJI Dock presence via Serper site-search. Website check only — captures evidence URL, dock models, and relevance.
        </p>

        {/* Mode Tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid #E5E7EB" }}>
          <button onClick={() => setMode("db")} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none", borderBottom: mode === "db" ? "2px solid #2563EB" : "2px solid transparent",
            background: "none", color: mode === "db" ? "#2563EB" : "#6B7280", marginBottom: -2,
          }}>DB Mode (Batch)</button>
          <button onClick={() => setMode("upload")} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none", borderBottom: mode === "upload" ? "2px solid #2563EB" : "2px solid transparent",
            background: "none", color: mode === "upload" ? "#2563EB" : "#6B7280", marginBottom: -2,
          }}>Upload Mode (JSON)</button>
        </div>

        {/* ═══════ DB MODE ═══════ */}
        {mode === "db" && (
          <div>
            {/* Country Selector */}
            <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Select Countries ({dbCountries.size})</span>
                <button onClick={() => {
                  if (dbCountries.size === ALL_COUNTRIES.length) setDbCountries(new Set());
                  else setDbCountries(new Set(ALL_COUNTRIES.map(c => c.code)));
                }} style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 6, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer" }}>
                  {dbCountries.size === ALL_COUNTRIES.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ALL_COUNTRIES.map(c => {
                  const done = completedCountries[c.code];
                  return (
                    <button key={c.code} onClick={() => {
                      setDbCountries(prev => { const n = new Set(prev); if (n.has(c.code)) n.delete(c.code); else n.add(c.code); return n; });
                    }} style={{
                      padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      border: dbCountries.has(c.code) ? "2px solid #2563EB" : done ? "1px solid #BBF7D0" : "1px solid #D1D5DB",
                      background: dbCountries.has(c.code) ? "#EFF6FF" : done ? "#F0FDF4" : "#fff",
                      color: dbCountries.has(c.code) ? "#2563EB" : done ? "#059669" : "#6B7280",
                    }} title={done ? `Verified ${done.at} — ${done.confirmed} confirmed / ${done.total} domains` : c.name}>
                      {c.flag} {c.code}{done ? " ✓" : ""}
                    </button>
                  );
                })}
              </div>
              {Object.keys(completedCountries).length > 0 && (
                <div style={{ fontSize: 10, color: "#64748B", marginTop: 6 }}>
                  Green = already verified (hover for details). <button onClick={() => {
                    setCompletedCountries({});
                    if (typeof window !== "undefined") localStorage.removeItem("dock-verify-completed");
                  }} style={{ fontSize: 10, color: "#DC2626", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Clear history</button>
                </div>
              )}
            </div>

            {/* Run Controls */}
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
              <button onClick={runDbVerify} disabled={dbRunning || dbCountries.size === 0} style={{
                padding: "10px 24px", borderRadius: 8, border: "none", cursor: dbRunning ? "wait" : "pointer",
                background: dbRunning ? "#9CA3AF" : "#2563EB", color: "#fff", fontWeight: 700, fontSize: 13,
              }}>
                {dbRunning ? "Verifying..." : `Run Verification (${dbCountries.size} countries)`}
              </button>
              <label style={{ fontSize: 12, color: "#6B7280", display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={dbDryRun} onChange={e => setDbDryRun(e.target.checked)} />
                Dry Run (no DB writes)
              </label>
              {dbDryRun && (
                <label style={{ fontSize: 12, color: "#6B7280", display: "flex", alignItems: "center", gap: 6 }}>
                  Sample:
                  <input type="number" value={dbSampleSize} onChange={e => setDbSampleSize(Math.max(5, parseInt(e.target.value) || 30))}
                    style={{ width: 60, padding: "4px 8px", borderRadius: 6, border: "1px solid #D1D5DB", fontSize: 12 }} />
                  records
                </label>
              )}
              <span style={{ fontSize: 12, color: "#6B7280" }}>
                Serper: ~1 credit per unique domain · Deduped by domain
              </span>
            </div>

            {/* DB Log Panel */}
            {dbLogs.length > 0 && (
              <div ref={dbLogRef} style={{
                background: "#111827", color: "#A5F3FC", fontFamily: "monospace", fontSize: 11,
                padding: 12, borderRadius: 8, maxHeight: 300, overflowY: "auto", marginBottom: 16, whiteSpace: "pre-wrap",
              }}>
                {dbLogs.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}

            {/* DB Summary */}
            {dbSummary && (
              <div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                  {[
                    { label: "Domains Checked", value: dbSummary.total, color: "#111827" },
                    { label: "DJI Dock Confirmed", value: dbSummary.confirmed, color: "#059669" },
                    { label: "Direct (Product)", value: dbSummary.direct, color: "#166534" },
                    { label: "Indirect", value: dbSummary.indirect, color: "#D97706" },
                    { label: "Mention Only", value: dbSummary.mention_only, color: "#6B7280" },
                    { label: "Not Found", value: dbSummary.not_found, color: "#DC2626" },
                    { label: "DB Updated", value: dbSummary.records_updated, color: "#2563EB" },
                    { label: "Puppeteer Queue", value: dbSummary.puppeteerCandidates, color: "#7C3AED" },
                  ].map(k => (
                    <div key={k.label} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "10px 14px", textAlign: "center", minWidth: 80 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
                      <div style={{ fontSize: 10, color: "#6B7280" }}>{k.label}</div>
                    </div>
                  ))}
                </div>

                {/* Confirmed Companies Table */}
                {dbConfirmed.length > 0 && (
                  <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #E5E7EB", fontSize: 14, fontWeight: 700 }}>
                      DJI Dock Confirmed ({dbConfirmed.length})
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            {["#", "Company", "Domain", "Hits", "Dock Models", "Relevance", "Evidence"].map(h => (
                              <th key={h} style={{
                                padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "#6B7280",
                                background: "#F9FAFB", borderBottom: "2px solid #E5E7EB",
                                textAlign: ["Company", "Domain", "Evidence"].includes(h) ? "left" : "center",
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {dbConfirmed.map((r, i) => (
                            <tr key={r.domain} style={{ background: r.relevance === "direct" ? "#F0FDF4" : undefined }}>
                              <td style={td}>{i + 1}</td>
                              <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{r.name}</td>
                              <td style={{ ...td, textAlign: "left", fontSize: 11 }}>{r.domain}</td>
                              <td style={{ ...td, fontWeight: 700, color: "#059669" }}>{r.hits}</td>
                              <td style={td}>{r.variant || "—"}</td>
                              <td style={td}>
                                <span style={{
                                  ...badgeStyle,
                                  background: r.relevance === "direct" ? "#DCFCE7" : r.relevance === "indirect" ? "#FEF3C7" : "#F3F4F6",
                                  color: r.relevance === "direct" ? "#166534" : r.relevance === "indirect" ? "#92400E" : "#6B7280",
                                }}>{r.relevance}</span>
                              </td>
                              <td style={{ ...td, textAlign: "left", fontSize: 11 }}>
                                {r.evidence ? <a href={r.evidence} target="_blank" rel="noreferrer" style={{ color: "#2563EB" }}>Evidence ↗</a> : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Puppeteer Candidates */}
                {dbSummary.puppeteerList.length > 0 && (
                  <div style={{ background: "#FAF5FF", border: "1px solid #E9D5FF", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#7C3AED", marginBottom: 8 }}>
                      Puppeteer Deep Scan Candidates ({dbSummary.puppeteerList.length})
                    </div>
                    <p style={{ fontSize: 11, color: "#6B7280", margin: "0 0 8px" }}>
                      High-value source companies where Serper found 0 hits. These have LinkedIn profiles available for deep scanning.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {dbSummary.puppeteerList.map(c => (
                        <div key={c.domain} style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ ...badgeStyle, background: SRC_COLORS[c.source]?.bg ?? "#F3F4F6", color: SRC_COLORS[c.source]?.text ?? "#6B7280" }}>
                            {SRC_LABELS[c.source] ?? c.source}
                          </span>
                          <strong>{c.name}</strong>
                          <a href={c.linkedin} target="_blank" rel="noreferrer" style={{ color: "#2563EB", fontSize: 11 }}>LinkedIn ↗</a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {dbSummary.dryRun && (
                  <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 16px", fontSize: 12, color: "#92400E" }}>
                    <strong>Dry run</strong> — no records were updated. Uncheck &ldquo;Dry Run&rdquo; and re-run to write results to the database.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════ UPLOAD MODE ═══════ */}
        {mode === "upload" && <>
        {/* Input Section */}
        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Company JSON (array)</label>
            <textarea
              value={jsonInput}
              onChange={e => setJsonInput(e.target.value)}
              style={{ width: "100%", height: 200, fontFamily: "monospace", fontSize: 11, padding: 12, borderRadius: 8, border: "1px solid #D1D5DB", resize: "vertical" }}
            />
          </div>
          <div style={{ width: 220, display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Country</label>
              <select value={country} onChange={e => setCountry(e.target.value)} style={selectStyle}>
                {["FR", "NL", "DE", "UK", "AU", "US", "IN", "AE", "SA", "JP", "KR", "BR", "IT", "ES", "SG"].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Run Label</label>
              <input value={runLabel} onChange={e => setRunLabel(e.target.value)} placeholder={`${country} QA Run`} style={{ ...selectStyle, width: "100%" }} />
            </div>
            <label style={{ fontSize: 12, color: "#6B7280", display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={skipSerper} onChange={e => setSkipSerper(e.target.checked)} /> Skip Serper
            </label>
            <label style={{ fontSize: 12, color: "#6B7280", display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={skipLinkedin} onChange={e => setSkipLinkedin(e.target.checked)} /> Skip LinkedIn
            </label>
            <button
              onClick={runAgent}
              disabled={running}
              style={{
                padding: "10px 20px", borderRadius: 8, border: "none", cursor: running ? "wait" : "pointer",
                background: running ? "#9CA3AF" : "#2563EB", color: "#fff", fontWeight: 700, fontSize: 13, marginTop: 8,
              }}
            >
              {running ? `Running... ${progress.current}/${progress.total}` : "Run QA Agent"}
            </button>
          </div>
        </div>

        {/* Log Panel */}
        {logs.length > 0 && (
          <div ref={logRef} style={{
            background: "#111827", color: "#A5F3FC", fontFamily: "monospace", fontSize: 11,
            padding: 12, borderRadius: 8, maxHeight: 200, overflowY: "auto", marginBottom: 20,
            whiteSpace: "pre-wrap",
          }}>
            {logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}

        {/* Summary + Report Link */}
        {summary && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20, alignItems: "center" }}>
            {[
              { label: "Total", value: summary.total, color: "#111827" },
              { label: "Confirmed", value: summary.confirmed, color: "#059669" },
              { label: "No Evidence", value: summary.total - summary.confirmed, color: "#DC2626" },
              { label: "High", value: summary.high, color: "#059669" },
              { label: "Medium", value: summary.medium, color: "#D97706" },
              { label: "Low", value: summary.low, color: "#DC2626" },
              { label: "Serper Credits", value: summary.serper_credits_used, color: "#6B7280" },
            ].map(k => (
              <div key={k.label} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "10px 14px", textAlign: "center", minWidth: 80 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 10, color: "#6B7280" }}>{k.label}</div>
              </div>
            ))}
            {reportPath && (
              <div style={{ marginLeft: 16 }}>
                <span style={{ fontSize: 12, color: "#059669", fontWeight: 700 }}>Report saved: {reportPath}</span>
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        {results.length > 0 && (
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <select value={confFilter} onChange={e => setConfFilter(e.target.value)} style={selectStyle}>
              <option value="all">All Confidence</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="none">None</option>
            </select>
            <select value={dockFilter} onChange={e => setDockFilter(e.target.value)} style={selectStyle}>
              <option value="all">All Dock Status</option>
              <option value="yes">Dock Confirmed</option>
              <option value="no">No Evidence</option>
            </select>
            <span style={{ fontSize: 12, color: "#6B7280", alignSelf: "center" }}>
              Showing {filtered.length} of {results.length}
            </span>
          </div>
        )}

        {/* Results Table */}
        {filtered.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["#", "Company", "Country", "Role", "DJI Dock", "Confidence", "Sources", "Website", "LinkedIn", "Evidence"].map(h => (
                      <th key={h} style={{
                        padding: "9px 10px", fontSize: 11, fontWeight: 600, color: "#6B7280",
                        background: "#F9FAFB", borderBottom: "2px solid #E5E7EB",
                        textAlign: ["Company", "Website"].includes(h) ? "left" : "center", whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const cc = CONF_COLORS[r.confidence] ?? CONF_COLORS.none;
                    return (
                      <React.Fragment key={r.domain}>
                        <tr style={{ background: r.dock_confirmed ? "#F0FDF4" : "#FAFAFA" }}>
                          <td style={td}>{i + 1}</td>
                          <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{r.name}</td>
                          <td style={td}><span style={{ ...badgeStyle, background: r.country === "FR" ? "#DBEAFE" : "#FEF3C7", color: r.country === "FR" ? "#1E40AF" : "#92400E" }}>{r.country}</span></td>
                          <td style={td}><span style={{ ...badgeStyle, background: "#F3F4F6", color: "#374151" }}>{r.role}</span></td>
                          <td style={td}>
                            {r.dock_confirmed
                              ? <span style={{ ...badgeStyle, background: "#DCFCE7", color: "#166534" }}>{"✓ " + (r.dock_models || "Dock")}</span>
                              : <span style={{ ...badgeStyle, background: "#FEE2E2", color: "#991B1B" }}>No evidence</span>}
                          </td>
                          <td style={td}><span style={{ ...badgeStyle, background: cc.bg, color: cc.text }}>{r.confidence} ({r.confidence_score})</span></td>
                          <td style={td}>
                            <div style={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
                              {r.sources_confirmed.map(s => {
                                const sc = SRC_COLORS[s] ?? { bg: "#F3F4F6", text: "#6B7280" };
                                let label = SRC_LABELS[s] ?? s;
                                if (s === "serper_website" && r.serper) label = `Serper (${r.serper.hits})`;
                                if (s === "linkedin_posts" && r.linkedin) label = `LI (${r.linkedin.mentions})`;
                                return <span key={s} style={{ padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700, background: sc.bg, color: sc.text }}>{label}</span>;
                              })}
                            </div>
                          </td>
                          <td style={{ ...td, textAlign: "left", fontSize: 11 }}>
                            {r.website ? <a href={r.website} target="_blank" rel="noreferrer" style={{ color: "#2563EB" }}>{r.domain}</a> : <span style={{ color: "#D1D5DB" }}>{r.domain}</span>}
                          </td>
                          <td style={{ ...td, fontSize: 11 }}>
                            {r.linkedin_url ? <a href={r.linkedin_url} target="_blank" rel="noreferrer" style={{ color: "#2563EB" }}>LinkedIn</a> : <span style={{ color: "#D1D5DB" }}>—</span>}
                          </td>
                          <td style={{ ...td, fontSize: 11 }}>
                            {r.evidence_url ? <a href={r.evidence_url} target="_blank" rel="noreferrer" style={{ color: "#2563EB" }}>Evidence ↗</a> : <span style={{ color: "#D1D5DB" }}>—</span>}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={10} style={{ padding: "4px 8px 6px 40px", borderBottom: "2px solid #E5E7EB", fontSize: 10, color: "#6B7280", background: "#FAFAFA" }}>
                            <strong>Verified via:</strong> {r.evidence_summary}
                            {r.notes && <><br /><strong>Notes:</strong> {r.notes}</>}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>}
      </div>
    </div>
  );
}

const td: React.CSSProperties = {
  padding: "7px 8px", textAlign: "center", borderBottom: "1px solid #E5E7EB", fontSize: 12,
};

const badgeStyle: React.CSSProperties = {
  padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, display: "inline-block",
};

const selectStyle: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 6, border: "1px solid #D1D5DB", fontSize: 13,
};
