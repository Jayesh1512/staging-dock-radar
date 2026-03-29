"use client";

import React, { useState } from "react";
import { Navbar } from "@/components/shared/Navbar";

/**
 * Minimal CSV → JSON rows parser (comma-separated, quoted fields).
 */
function parseCsvToRows(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if (c === "," && !q) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out;
  };

  const header = parseLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = parseLine(lines[r]);
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

export default function CsvCompanyPipelinePage() {
  const [countryCode, setCountryCode] = useState("AU");
  const [delayMs, setDelayMs] = useState(400);
  const [csvText, setCsvText] = useState(
    "Company Name,Location\nExample Drone Pty Ltd,Sydney NSW\n",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<unknown>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const rows = parseCsvToRows(csvText);
      if (rows.length === 0) throw new Error("No data rows (need header + ≥1 row)");

      const res = await fetch("/api/csv-company-pipeline/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          country_code: countryCode,
          delay_ms: delayMs,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "#F3F4F6" }}>
      <Navbar />
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 32px 64px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px", color: "#111827" }}>
          CSV company pipeline
        </h1>
        <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 16px", lineHeight: 1.5 }}>
          1) Apollo enriches website + LinkedIn (name variants). 2) Serper fills gaps (domain / LinkedIn). 3) Internet QA:{" "}
          <code style={{ fontSize: 11 }}>site:domain &quot;DJI Dock&quot;</code> (+ LinkedIn when known). 4) Every row is
          saved as JSON to the Supabase Storage bucket. 5) Rows that pass QA are upserted into{" "}
          <code style={{ fontSize: 12 }}>multi_sources_companies_import</code> with merged source refs and verifications.
        </p>
        <p style={{ fontSize: 12, color: "#92400E", marginBottom: 16 }}>
          Create Storage bucket <code>csv-company-pipeline</code> (or set env{" "}
          <code>SUPABASE_CSV_PIPELINE_BUCKET</code>) and allow service-role uploads. Set{" "}
          <code>APOLLO_API_KEY</code> (optional but recommended) and <code>SERPER_API_KEY</code>.
        </p>

        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <label style={{ fontSize: 12 }}>
              Country (ISO-2)
              <input
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase().slice(0, 2))}
                disabled={loading}
                style={{ marginLeft: 8, padding: 6, width: 56 }}
              />
            </label>
            <label style={{ fontSize: 12 }}>
              Delay ms
              <input
                type="number"
                min={0}
                max={10000}
                value={delayMs}
                onChange={(e) => setDelayMs(Number(e.target.value) || 0)}
                disabled={loading}
                style={{ marginLeft: 8, padding: 6, width: 72 }}
              />
            </label>
            <button
              type="button"
              onClick={run}
              disabled={loading}
              style={{
                padding: "8px 16px",
                border: "none",
                borderRadius: 8,
                fontWeight: 700,
                color: "#fff",
                background: "#059669",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Running…" : "Run pipeline"}
            </button>
          </div>
          <label style={{ display: "block", fontSize: 11, color: "#6B7280", marginBottom: 6 }}>
            Paste CSV (header must include Company Name or company_name; optional Location)
          </label>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            disabled={loading}
            rows={12}
            style={{
              width: "100%",
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
              padding: 10,
              border: "1px solid #D1D5DB",
              borderRadius: 8,
            }}
          />
        </div>

        {error && (
          <div
            style={{
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              color: "#991B1B",
              padding: 12,
              borderRadius: 10,
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {data && (
          <pre
            style={{
              background: "#111827",
              color: "#E5E7EB",
              padding: 16,
              borderRadius: 12,
              fontSize: 11,
              overflow: "auto",
              maxHeight: 560,
            }}
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </main>
    </div>
  );
}
