"use client";

import React, { useState, useRef, useCallback } from "react";
import { Navbar } from "@/components/shared/Navbar";

/* ─── Types ─── */

interface CountryResult {
  country: string;
  countryName: string;
  rawResults: number;
  entities: number;
  tier1Entities: number;
  dspSi: number;
  resellers: number;
  media: number;
  topCompanies: Array<{ name: string; score: number; type: string; domains: string[] }>;
  error: string | null;
}

interface Summary {
  countriesSearched: number;
  countriesWithResults: number;
  totalRawResults: number;
  totalEntities: number;
  totalTier1: number;
  totalDspSi: number;
  totalResellers: number;
  serperCredits: number;
  countries: CountryResult[];
}

/* ─── Countries ─── */

const ALL_COUNTRIES = [
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
  { code: "PL", name: "Poland", flag: "🇵🇱" },
  { code: "TR", name: "Turkey", flag: "🇹🇷" },
];

const TYPE_BADGE: Record<string, { bg: string; text: string }> = {
  operator: { bg: "#DCFCE7", text: "#166534" },
  reseller: { bg: "#FEF3C7", text: "#92400E" },
  media: { bg: "#E0E7FF", text: "#3730A3" },
  unknown: { bg: "#F3F4F6", text: "#6B7280" },
};

/* ─── Component ─── */

export default function GoogleSearchCampaignPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set(ALL_COUNTRIES.map(c => c.code)));
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [currentCountry, setCurrentCountry] = useState<{ index: number; total: number; name: string } | null>(null);
  const [countryResults, setCountryResults] = useState<CountryResult[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reportPath, setReportPath] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev, msg]);
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
  }, []);

  const toggleCountry = (code: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === ALL_COUNTRIES.length) setSelected(new Set());
    else setSelected(new Set(ALL_COUNTRIES.map(c => c.code)));
  };

  const runCampaign = useCallback(async () => {
    if (selected.size === 0) return;
    setRunning(true);
    setLogs([]);
    setCountryResults([]);
    setSummary(null);
    setReportPath(null);

    try {
      const res = await fetch("/api/google-search-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countries: [...selected], keyword: "DJI Dock", pages: 7 }),
      });

      if (!res.ok || !res.body) { addLog("ERROR: API " + res.status); setRunning(false); return; }

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
              case "log": addLog(event.data); break;
              case "country_start":
                setCurrentCountry({ index: event.data.index, total: event.data.total, name: event.data.countryName });
                break;
              case "country_done":
                setCountryResults(prev => [...prev, event.data]);
                break;
              case "summary": setSummary(event.data); break;
              case "report": setReportPath(event.data.path); addLog("Report: " + event.data.path); break;
              case "done": addLog("Campaign complete."); break;
              case "error": addLog("ERROR: " + event.data); break;
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      addLog("ERROR: " + (err instanceof Error ? err.message : "Unknown"));
    }
    setRunning(false);
  }, [selected, addLog]);

  const creditsNeeded = selected.size * 7;

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC" }}>
      <Navbar />
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 24px 64px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>
          Batch 2 — Global DJI Dock Google Search Campaign
        </h1>
        <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 20px" }}>
          Run "DJI Dock" Google Search across multiple countries. 7 pages per country. Only companies mentioning DJI Dock are captured.
        </p>

        {/* Country Selection */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Select Countries ({selected.size}/{ALL_COUNTRIES.length})</span>
            <button onClick={toggleAll} style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 6, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer", color: "#374151" }}>
              {selected.size === ALL_COUNTRIES.length ? "Deselect All" : "Select All"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ALL_COUNTRIES.map(c => (
              <button
                key={c.code}
                onClick={() => toggleCountry(c.code)}
                style={{
                  padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: selected.has(c.code) ? "2px solid #2563EB" : "1px solid #D1D5DB",
                  background: selected.has(c.code) ? "#EFF6FF" : "#fff",
                  color: selected.has(c.code) ? "#2563EB" : "#6B7280",
                }}
              >
                {c.flag} {c.code}
              </button>
            ))}
          </div>
        </div>

        {/* Run Controls */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
          <button
            onClick={runCampaign}
            disabled={running || selected.size === 0}
            style={{
              padding: "10px 24px", borderRadius: 8, border: "none", cursor: running ? "wait" : "pointer",
              background: running ? "#9CA3AF" : "#2563EB", color: "#fff", fontWeight: 700, fontSize: 13,
            }}
          >
            {running
              ? `Running... ${currentCountry ? `${currentCountry.name} (${currentCountry.index}/${currentCountry.total})` : ""}`
              : `Run Campaign (${selected.size} countries)`}
          </button>
          <span style={{ fontSize: 12, color: "#6B7280" }}>
            Serper credits: ~{creditsNeeded} · Keyword: "DJI Dock" · 7 pages/country
          </span>
        </div>

        {/* Log Panel */}
        {logs.length > 0 && (
          <div ref={logRef} style={{
            background: "#111827", color: "#A5F3FC", fontFamily: "monospace", fontSize: 11,
            padding: 12, borderRadius: 8, maxHeight: 250, overflowY: "auto", marginBottom: 20, whiteSpace: "pre-wrap",
          }}>
            {logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}

        {/* Summary KPIs */}
        {summary && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
            {[
              { label: "Countries", value: summary.countriesSearched, color: "#111827" },
              { label: "With Results", value: summary.countriesWithResults, color: "#059669" },
              { label: "Raw Results", value: summary.totalRawResults, color: "#6B7280" },
              { label: "DJI Dock Entities", value: summary.totalTier1, color: "#059669" },
              { label: "DSP / SI", value: summary.totalDspSi, color: "#166534" },
              { label: "Resellers", value: summary.totalResellers, color: "#92400E" },
              { label: "Serper Credits", value: summary.serperCredits, color: "#6B7280" },
            ].map(k => (
              <div key={k.label} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "12px 16px", textAlign: "center", minWidth: 90 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 10, color: "#6B7280" }}>{k.label}</div>
              </div>
            ))}
            {reportPath && (
              <div style={{ display: "flex", alignItems: "center", marginLeft: 12 }}>
                <span style={{ fontSize: 12, color: "#059669", fontWeight: 700 }}>Report: {reportPath}</span>
              </div>
            )}
          </div>
        )}

        {/* Country Results Table */}
        {countryResults.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #E5E7EB", fontSize: 14, fontWeight: 700 }}>
              Per-Country Results ({countryResults.length})
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["#", "Country", "Raw", "Entities", "DJI Dock", "DSP/SI", "Resellers", "Media", "Top Companies"].map(h => (
                      <th key={h} style={{
                        padding: "9px 10px", fontSize: 11, fontWeight: 600, color: "#6B7280",
                        background: "#F9FAFB", borderBottom: "2px solid #E5E7EB",
                        textAlign: h === "Country" || h === "Top Companies" ? "left" : "center", whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {countryResults.map((cr, i) => (
                    <tr key={cr.country} style={{ background: cr.error ? "#FEF2F2" : cr.tier1Entities > 0 ? "#F0FDF4" : undefined }}>
                      <td style={td}>{i + 1}</td>
                      <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>
                        {ALL_COUNTRIES.find(c => c.code === cr.country)?.flag} {cr.countryName}
                      </td>
                      <td style={td}>{cr.rawResults}</td>
                      <td style={td}>{cr.entities}</td>
                      <td style={{ ...td, fontWeight: 700, color: "#059669" }}>{cr.tier1Entities}</td>
                      <td style={td}>{cr.dspSi}</td>
                      <td style={td}>{cr.resellers}</td>
                      <td style={td}>{cr.media}</td>
                      <td style={{ ...td, textAlign: "left", fontSize: 11, color: "#6B7280", maxWidth: 350 }}>
                        {cr.error
                          ? <span style={{ color: "#DC2626" }}>Error: {cr.error}</span>
                          : cr.topCompanies.slice(0, 4).map((t, j) => (
                            <span key={j} style={{ marginRight: 8 }}>
                              <span style={{ padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700, background: TYPE_BADGE[t.type]?.bg ?? "#F3F4F6", color: TYPE_BADGE[t.type]?.text ?? "#6B7280" }}>{t.type === "operator" ? "DSP" : t.type}</span>
                              {" "}{t.name} ({t.score})
                            </span>
                          ))
                        }
                      </td>
                    </tr>
                  ))}
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
  padding: "8px 10px", textAlign: "center", borderBottom: "1px solid #F3F4F6", fontSize: 12,
};
