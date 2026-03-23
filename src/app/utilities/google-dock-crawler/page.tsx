"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";

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
  domains: string[];
  totalScore: number;
  snippetScore: number;
  tier1Hit: boolean;
  tier2Hit: boolean;
  topSignal: string;
  signalCount: number;
  signals: Signal[];
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
  litmusPass: boolean;
  companies: CompanyResult[];
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
  { code: "IT", label: "Italy" },
  { code: "ES", label: "Spain" },
  { code: "SG", label: "Singapore" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
  { code: "BR", label: "Brazil" },
];

/* ─── Component ─── */

export default function GoogleDockCrawlerPage() {
  const [keyword, setKeyword] = useState("DJI Dock");
  const [country, setCountry] = useState("FR");
  const [pages, setPages] = useState(5);

  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<FinalResults | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((line: string) => {
    setLogs(prev => [...prev, line]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  async function runCrawl() {
    setStatus("running");
    setLogs([]);
    setResults(null);
    setExpandedRow(null);

    try {
      const res = await fetch("/api/google-dock-crawler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, country, pages }),
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

  const scored = results?.companies.filter(c => c.totalScore > 0) ?? [];
  const unscored = results?.companies.filter(c => c.totalScore === 0) ?? [];

  return (
    <main style={{ minHeight: "100vh", background: "#F8FAFC" }}>
      {/* ── Nav ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "8px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/" style={{ fontSize: 13, color: "#6B7280", textDecoration: "none" }}>← Dashboard</Link>
        <span style={{ color: "#D1D5DB" }}>|</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Google Dock Crawler</span>
        <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: "auto" }}>v0.1 — Serper.dev</span>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>

        {/* ── Input Panel ── */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "16px 20px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 12 }}>Search Configuration</div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
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
          </div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>
            Query: &quot;{keyword}&quot; {country} · gl={country.toLowerCase()} · {pages} pages = ~{pages * 10} results · Cost: {pages} Serper credits
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
              { label: "With Signals", value: results.scoredEntities, color: "#059669" },
              { label: "Tier 1 Hits", value: scored.filter(c => c.tier1Hit).length, color: "#DC2626" },
              { label: "Litmus", value: results.litmusPass ? "PASS" : "FAIL", color: results.litmusPass ? "#059669" : "#DC2626" },
            ].map((stat, i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 11, color: "#6B7280" }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Results Table ── */}
        {scored.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Scored Entities ({scored.length})</span>
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>Click row to expand</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                  <th style={thStyle}>#</th>
                  <th style={{ ...thStyle, textAlign: "left" }}>Entity</th>
                  <th style={thStyle}>Score</th>
                  <th style={thStyle}>T1</th>
                  <th style={thStyle}>T2</th>
                  <th style={{ ...thStyle, textAlign: "left" }}>Top Signal</th>
                  <th style={thStyle}>Signals</th>
                  <th style={{ ...thStyle, textAlign: "left" }}>Domains</th>
                  <th style={thStyle}>Sources</th>
                </tr>
              </thead>
              <tbody>
                {scored.map((c) => (
                  <>
                    <tr
                      key={c.rank}
                      onClick={() => setExpandedRow(expandedRow === c.rank ? null : c.rank)}
                      style={{
                        borderBottom: "1px solid #F3F4F6",
                        cursor: "pointer",
                        background: expandedRow === c.rank ? "#EFF6FF" : c.tier1Hit ? "#FEF2F2" : "transparent",
                      }}
                    >
                      <td style={tdStyle}>{c.rank}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{c.slug}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: c.totalScore >= 100 ? "#DC2626" : c.totalScore >= 40 ? "#D97706" : "#6B7280" }}>
                        {c.totalScore}
                      </td>
                      <td style={tdStyle}>{c.tier1Hit ? "✓" : ""}</td>
                      <td style={tdStyle}>{c.tier2Hit ? "✓" : ""}</td>
                      <td style={tdStyle}>{c.topSignal}</td>
                      <td style={tdStyle}>{c.signalCount}</td>
                      <td style={{ ...tdStyle, fontSize: 11, color: "#6B7280" }}>{c.domains.join(", ")}</td>
                      <td style={tdStyle}>{c.resultCount}</td>
                    </tr>
                    {expandedRow === c.rank && (
                      <tr key={`${c.rank}-detail`}>
                        <td colSpan={9} style={{ padding: "12px 16px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
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
                                  {s.keyword} ×{s.count} ({s.points}pts)
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
                  </>
                ))}
              </tbody>
            </table>
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
                  {c.slug} — {c.domains.join(", ")} — {c.resultCount} result(s)
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

/* ─── Styles ─── */
const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 11,
  fontWeight: 600,
  color: "#6B7280",
  textAlign: "center",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "center",
  whiteSpace: "nowrap",
};
