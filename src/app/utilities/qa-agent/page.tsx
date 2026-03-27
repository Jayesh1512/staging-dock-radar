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

export default function QAAgentPage() {
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
        <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 20px" }}>
          Paste company JSON, run automated Serper + LinkedIn verification, get confidence-scored HTML report.
        </p>

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
