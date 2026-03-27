"use client";

import React, { useState, useCallback } from "react";
import { Navbar } from "@/components/shared/Navbar";

/* ─── Types ─── */

interface CompanyRow {
  name: string;
  domain: string;
  website: string | null;
  linkedin_url: string | null;
  country: string;
  city: string | null;
  sources: string[]; // dji_dealer, google_search, comet, chatgpt
  role: string; // operator, system integrator, solution provider, dealer, media, unknown
  dock_models: string | null; // "Dock 1, 2, 3" etc.
  comet_confidence: string | null; // high, medium, low
  google_score: number | null;
  notes: string | null;
  // Verification results (filled after running)
  dock_found?: boolean;
  dock_mentions?: number;
  dock_variant?: string | null;
  mentions?: Array<{ url: string; title: string; snippet: string }>;
  verify_error?: string | null;
}

/* ─── Pre-loaded master data (3 sources merged + deep research) ─── */

const ALL_COMPANIES: CompanyRow[] = [
  // ═══════════ FRANCE ═══════════

  // ── Multi-source confirmed (DJI + Google + Comet) ──
  { name: "Escadrone", domain: "escadrone.com", website: "https://escadrone.com", linkedin_url: "https://www.linkedin.com/company/escadrone", country: "FR", city: null, sources: ["dji_dealer", "google_search", "comet"], role: "system integrator", dock_models: "Dock 1, Dock 2", comet_confidence: "medium", google_score: 77, notes: "Sales & integration for automated surveillance/inspection. Listed as authorized DJI Enterprise dealer for Dock 2." },
  { name: "Flying Eye", domain: "flyingeye.fr", website: "https://www.flyingeye.fr", linkedin_url: "https://www.linkedin.com/company/flyingeye", country: "FR", city: "Biot (Sophia Antipolis)", sources: ["dji_dealer", "google_search", "comet"], role: "solution provider", dock_models: "Dock 1, Dock 2, Dock 3", comet_confidence: "high", google_score: null, notes: "DJI-recognised Dock 2 Flysafe kit in ecosystem catalogue. Dock demo events and webinars confirmed." },
  { name: "La Camera Embarquée (NETPIX)", domain: "lacameraembarquee.fr", website: "https://www.lacameraembarquee.fr", linkedin_url: "https://www.linkedin.com/company/la-camera-embarquee", country: "FR", city: null, sources: ["dji_dealer", "google_search", "comet"], role: "solution provider", dock_models: "Dock 2", comet_confidence: null, google_score: null, notes: "Dock 2 with Matrice 3D as turnkey autonomous station for automated missions up to 10km radius." },
  { name: "StudioSport", domain: "studiosport.fr", website: "https://www.studiosport.fr", linkedin_url: "https://www.linkedin.com/company/studiosport", country: "FR", city: null, sources: ["google_search", "comet"], role: "dealer", dock_models: "Dock 1, Dock 2, Dock 3", comet_confidence: null, google_score: null, notes: "Revendeur DJI N°1 en France. Markets Dock stations for automated industrial, surveillance and emergency missions." },

  // ── DJI + Comet (not in Google top results) ──
  { name: "ABOT", domain: "abot.fr", website: "https://www.abot.fr", linkedin_url: "https://www.linkedin.com/company/abot-fr", country: "FR", city: null, sources: ["dji_dealer", "comet", "chatgpt"], role: "system integrator", dock_models: "Dock 1, Dock 2, Dock 3", comet_confidence: "medium", google_score: null, notes: "Brands itself as 'votre expert drone autonome' around DJI Dock 2. SORA support and end-to-end assistance." },
  { name: "Geomesure", domain: "geomesure.fr", website: "https://www.geomesure.fr", linkedin_url: "https://www.linkedin.com/company/geomesure", country: "FR", city: null, sources: ["dji_dealer", "comet"], role: "solution provider", dock_models: "Dock 2", comet_confidence: "low", google_score: null, notes: "Authorized DJI Enterprise dealer for Dock 2. Specific services not publicly detailed." },

  // ── DJI Dealer only (no Comet, no Google) ──
  { name: "STTL", domain: "sttl-topographie.com", website: "https://www.sttl-topographie.com/", linkedin_url: "https://www.linkedin.com/company/sttl", country: "FR", city: null, sources: ["dji_dealer"], role: "dealer", dock_models: null, comet_confidence: null, google_score: null, notes: null },
  { name: "Dumont Securite", domain: "dumont-securite.fr", website: "https://www.dumont-securite.fr/", linkedin_url: "https://www.linkedin.com/company/dumont-securite", country: "FR", city: null, sources: ["dji_dealer"], role: "dealer", dock_models: null, comet_confidence: null, google_score: null, notes: null },
  { name: "Rivolier", domain: "rivolier-sd.com", website: "https://www.rivolier-sd.com/", linkedin_url: "https://www.linkedin.com/company/rivolier-sas", country: "FR", city: null, sources: ["dji_dealer"], role: "dealer", dock_models: null, comet_confidence: null, google_score: null, notes: null },
  { name: "Capture Solutions", domain: "capture-solutions.fr", website: "https://www.capture-solutions.fr/", linkedin_url: "https://www.linkedin.com/company/capture-solution123", country: "FR", city: null, sources: ["dji_dealer"], role: "dealer", dock_models: null, comet_confidence: null, google_score: null, notes: null },
  { name: "Protec Security Systems", domain: "protecsecuritysystems.fr", website: "https://www.protecsecuritysystems.fr/", linkedin_url: "https://www.linkedin.com/company/security-systems-by-protec", country: "FR", city: null, sources: ["dji_dealer"], role: "dealer", dock_models: null, comet_confidence: null, google_score: null, notes: null },
  { name: "Voltaneo", domain: "voltaneo.com", website: "https://www.voltaneo.com", linkedin_url: "https://www.linkedin.com/company/voltaneo", country: "FR", city: null, sources: ["dji_dealer"], role: "dealer", dock_models: null, comet_confidence: null, google_score: null, notes: null },
  { name: "Prodrones", domain: "prodrones.fr", website: "https://www.prodrones.fr", linkedin_url: "https://www.linkedin.com/company/pro-drones", country: "FR", city: null, sources: ["dji_dealer", "google_search"], role: "dealer", dock_models: null, comet_confidence: null, google_score: null, notes: "DJI Dock 2 product page found via Google." },

  // ── Google + Comet (not DJI dealers) ──
  { name: "Instadrone", domain: "instadrone.fr", website: "https://www.instadrone.fr", linkedin_url: "https://www.linkedin.com/company/instadrone", country: "FR", city: null, sources: ["google_search", "comet", "chatgpt"], role: "solution provider", dock_models: "Dock 3", comet_confidence: "medium", google_score: null, notes: "Homepage hero: 'DJI Dock 3 expert integrator'. Co-hosted Dock 2 webinar with Flying Eye. 5 pages found via Serper." },

  // ── Comet / Deep Research only (new finds) ──
  { name: "DJI Paris (Boutique)", domain: "boutique.dji-paris.com", website: "https://boutique.dji-paris.com", linkedin_url: null, country: "FR", city: "Paris", sources: ["google_search", "comet"], role: "dealer", dock_models: "Dock 1, Dock 2, Dock 3", comet_confidence: null, google_score: 73, notes: "Official DJI retail store in France. Dock bundles for automated inspection and surveillance." },
  { name: "Powerloop", domain: "powerloop.fr", website: "https://www.powerloop.fr", linkedin_url: null, country: "FR", city: null, sources: ["comet"], role: "solution provider", dock_models: "Dock 3", comet_confidence: null, google_score: null, notes: "Promoting Dock 3 as 24/7 autonomous solution. Fixed and vehicle-mounted deployments for security, inspection, emergency." },
  { name: "i-TechGroup (i-Techdrone)", domain: "i-techdrone.com", website: null, linkedin_url: null, country: "FR", city: "Assat / Pau (Nouvelle-Aquitaine)", sources: ["chatgpt"], role: "operator", dock_models: "Dock 1", comet_confidence: "high", google_score: null, notes: "Claims first in France to test/adapt DJI Dock (2023). Industrial surveillance, topography, environment." },
  { name: "EPC France (EPC Groupe)", domain: "epc-groupe.com", website: null, linkedin_url: null, country: "FR", city: "Vignats (Normandy)", sources: ["chatgpt"], role: "operator", dock_models: "Dock 2", comet_confidence: "medium", google_score: null, notes: "Dock 2 test at Vignats quarry for routine mapping and monitoring. Treat as tested, not long-term deployed." },

  // ═══════════ NETHERLANDS ═══════════

  // ── Multi-source confirmed ──
  { name: "DroneLand (Dutch Drone Group)", domain: "droneland.nl", website: "https://www.droneland.nl", linkedin_url: "https://www.linkedin.com/company/droneland", country: "NL", city: null, sources: ["dji_dealer", "google_search", "comet", "chatgpt"], role: "system integrator", dock_models: "Dock 1, Dock 2, Dock 3", comet_confidence: "high", google_score: 89, notes: "First Dock 2 in Benelux. Developed mobile Pick-Hub with two Dock 3 units. Benelux distribution, installation, support." },
  { name: "Drone Class B.V.", domain: "eudronebewijs.nl", website: "https://www.eudronebewijs.nl", linkedin_url: "https://www.linkedin.com/company/drone-class", country: "NL", city: "Duiven", sources: ["google_search", "comet", "chatgpt"], role: "operator", dock_models: "Dock 1", comet_confidence: "medium", google_score: 100, notes: "First DJI Dock operational in Netherlands (Aug 2023). Training and consultancy for BVLOS/remote-ops." },
  { name: "AirHub B.V.", domain: "airhub.app", website: "https://www.airhub.app", linkedin_url: "https://www.linkedin.com/company/airhub", country: "NL", city: null, sources: ["google_search", "comet", "chatgpt"], role: "solution provider", dock_models: "Dock 1, Dock 2, Dock 3", comet_confidence: "high", google_score: 89, notes: "DJI ecosystem listed. Drone operations platform with Dock 2/3 integration, compliance packages, mission management." },
  { name: "Dronebotics", domain: "dronebotics.nl", website: "https://nl.dronebotics.nl", linkedin_url: "https://www.linkedin.com/company/dronebotics", country: "NL", city: null, sources: ["google_search", "comet"], role: "solution provider", dock_models: "Dock 2", comet_confidence: null, google_score: 100, notes: "Dock 2 as part of drone-in-a-box security solution. Dronebotics Commando Centrum API." },

  // ── DJI + Comet ──
  { name: "Vortex Hardware", domain: "vortex-hardware.com", website: "https://www.vortex-hardware.com", linkedin_url: "https://nl.linkedin.com/company/vortex-hardware-maintenance-bv", country: "NL", city: "Heinenoord", sources: ["dji_dealer", "chatgpt"], role: "system integrator", dock_models: null, comet_confidence: "low", google_score: null, notes: "Referenced in Shell programme supply chain (Heliguy case study). Integration and localised support." },

  // ── DJI Dealer only ──
  { name: "Droneshop.nl", domain: "droneshop.nl", website: "https://droneshop.nl", linkedin_url: "https://www.linkedin.com/company/droneshopnl", country: "NL", city: null, sources: ["dji_dealer", "google_search"], role: "dealer", dock_models: null, comet_confidence: null, google_score: null, notes: "Dock 3 product page found via Google." },
  { name: "Dronestars B.V.", domain: "dronestars.nl", website: "https://dronestars.nl/", linkedin_url: "https://www.linkedin.com/company/dronestars-b-v", country: "NL", city: "Hoofddorp", sources: ["dji_dealer", "chatgpt"], role: "dealer", dock_models: "Dock 3", comet_confidence: "medium", google_score: null, notes: "4 DJI Dock matches on LinkedIn incl Dock 3 post and FlytBase alarm response webinar." },
  { name: "Vliegend.nl", domain: "vliegend.nl", website: "https://www.vliegend.nl/", linkedin_url: "https://www.linkedin.com/company/vliegend.nl", country: "NL", city: null, sources: ["dji_dealer"], role: "dealer", dock_models: null, comet_confidence: null, google_score: null, notes: null },
  { name: "Geocentrum", domain: "geocentrum.nl", website: "https://geocentrum.nl", linkedin_url: "https://www.linkedin.com/company/geocentrum-nl", country: "NL", city: null, sources: ["dji_dealer"], role: "dealer", dock_models: null, comet_confidence: null, google_score: null, notes: null },
  { name: "Geodirect", domain: "geodirect.nl", website: "https://www.geodirect.nl", linkedin_url: "https://www.linkedin.com/company/geodirect-bv", country: "NL", city: null, sources: ["dji_dealer"], role: "dealer", dock_models: null, comet_confidence: null, google_score: null, notes: null },

  // ── Deep Research only (new NL finds) ──
  { name: "Skeye (Terra Drone Europe)", domain: "skeye.com", website: "https://www.skeye.com", linkedin_url: null, country: "NL", city: "Heinenoord", sources: ["chatgpt"], role: "operator", dock_models: "Dock 1/2", comet_confidence: "high", google_score: null, notes: "Remote BVLOS drone-in-a-box for Shell. First EASA LUC in Netherlands. Remote flight centre operations." },
  { name: "Shell (Pernis / Europort)", domain: "shell.com", website: null, linkedin_url: null, country: "NL", city: "Rotterdam", sources: ["chatgpt"], role: "operator", dock_models: "Dock 1/2", comet_confidence: "high", google_score: null, notes: "End-user: multiple DJI Dock systems at Pernis refinery and Europort tank farms. Operational for over a year." },
  { name: "Tata Steel Nederland", domain: "tatasteel.com", website: null, linkedin_url: null, country: "NL", city: "IJmuiden", sources: ["chatgpt"], role: "operator", dock_models: "Dock 2", comet_confidence: "medium", google_score: null, notes: "Dock 2 + Matrice 3D for daily mapping flights measuring waste/stockpile volumes at IJmuiden site." },

  // ── Google Search only (NL) ──
  { name: "DroneWatch", domain: "dronewatch.nl", website: "https://www.dronewatch.nl", linkedin_url: null, country: "NL", city: null, sources: ["google_search"], role: "media", dock_models: null, comet_confidence: null, google_score: 89, notes: "Dutch drone news. Reported 'Eerste DJI Dock in bedrijf gesteld in Nederland'." },
  { name: "COPTRZ", domain: "coptrz.com", website: "https://www.coptrz.com", linkedin_url: "https://uk.linkedin.com/company/coptrz", country: "NL", city: null, sources: ["google_search"], role: "solution provider", dock_models: null, comet_confidence: null, google_score: 77, notes: "UK-based DSP/SI. Dock use cases page appeared in NL search results." },
  { name: "Drone Parts Center", domain: "drone-parts-center.com", website: "https://drone-parts-center.com", linkedin_url: null, country: "NL", city: null, sources: ["google_search"], role: "dealer", dock_models: null, comet_confidence: null, google_score: 77, notes: "Dock 3 features/pricing blog post." },
];

/* ─── Component ─── */

const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  dji_dealer: { bg: "#DBEAFE", text: "#1E40AF" },
  google_search: { bg: "#FEF3C7", text: "#92400E" },
  comet: { bg: "#F3E8FF", text: "#7C3AED" },
  chatgpt: { bg: "#FEE2E2", text: "#991B1B" },
};

const SOURCE_LABELS: Record<string, string> = {
  dji_dealer: "DJI",
  google_search: "Google",
  comet: "Comet",
  chatgpt: "ChatGPT",
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  operator: { bg: "#DCFCE7", text: "#166534" },
  "system integrator": { bg: "#DBEAFE", text: "#1E40AF" },
  "solution provider": { bg: "#F3E8FF", text: "#7C3AED" },
  dealer: { bg: "#FEF3C7", text: "#92400E" },
  media: { bg: "#E0E7FF", text: "#3730A3" },
  unknown: { bg: "#F3F4F6", text: "#6B7280" },
};

const DOCK_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  found: { bg: "#DCFCE7", text: "#166534", label: "Dock Found" },
  not_found: { bg: "#FEE2E2", text: "#991B1B", label: "No Dock" },
  pending: { bg: "#F3F4F6", text: "#6B7280", label: "—" },
  running: { bg: "#DBEAFE", text: "#1E40AF", label: "Checking..." },
  error: { bg: "#FEF3C7", text: "#92400E", label: "Error" },
  skipped: { bg: "#F3F4F6", text: "#9CA3AF", label: "Skipped" },
};

const CONF_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: "#DCFCE7", text: "#166534" },
  medium: { bg: "#FEF3C7", text: "#92400E" },
  low: { bg: "#FEE2E2", text: "#991B1B" },
};

export default function DockVerifyPage() {
  const [companies, setCompanies] = useState<CompanyRow[]>([...ALL_COMPANIES]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [countryFilter, setCountryFilter] = useState<"all" | "FR" | "NL">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [dockFilter, setDockFilter] = useState<string>("all");

  const runVerification = useCallback(async () => {
    setRunning(true);
    const toVerify = companies.filter(c => c.dock_found === undefined && c.domain && !c.domain.includes("shell.com") && !c.domain.includes("tatasteel.com"));
    setProgress({ done: 0, total: toVerify.length });

    const batchSize = 5;
    const updated = [...companies];

    for (let i = 0; i < toVerify.length; i += batchSize) {
      const batch = toVerify.slice(i, i + batchSize);

      try {
        const res = await fetch("/api/verify-dock-mention", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companies: batch.map(c => ({
              name: c.name,
              domain: c.domain,
              linkedin_url: c.linkedin_url,
            })),
          }),
        });

        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();

        for (const result of data.results) {
          const idx = updated.findIndex(c => c.domain === result.domain);
          if (idx >= 0) {
            updated[idx] = {
              ...updated[idx],
              dock_found: result.dock_found,
              dock_mentions: result.dock_mentions,
              dock_variant: result.dock_variant,
              mentions: result.mentions,
              verify_error: result.error,
            };
          }
        }
      } catch (err) {
        for (const c of batch) {
          const idx = updated.findIndex(u => u.domain === c.domain);
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], dock_found: false, dock_mentions: 0, verify_error: err instanceof Error ? err.message : "Unknown error" };
          }
        }
      }

      setProgress({ done: Math.min(i + batchSize, toVerify.length), total: toVerify.length });
      setCompanies([...updated]);
    }

    setRunning(false);
  }, [companies]);

  const downloadCSV = useCallback(() => {
    const headers = ["name", "country", "city", "role", "sources", "dock_models", "comet_confidence", "google_score", "website", "linkedin_url", "domain", "notes", "dock_verified", "dock_variant", "dock_web_mentions"];
    const rows = companies.map(c => [
      c.name,
      c.country,
      c.city ?? "",
      c.role,
      c.sources.join(" + "),
      c.dock_models ?? "",
      c.comet_confidence ?? "",
      c.google_score ?? "",
      c.website ?? "",
      c.linkedin_url ?? "",
      c.domain,
      c.notes ?? "",
      c.dock_found === undefined ? "pending" : c.dock_found ? "yes" : "no",
      c.dock_variant ?? "",
      c.dock_mentions ?? "",
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dock-radar-cross-reference-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [companies]);

  // Filter logic
  const filtered = companies.filter(c => {
    if (countryFilter !== "all" && c.country !== countryFilter) return false;
    if (sourceFilter !== "all" && !c.sources.includes(sourceFilter)) return false;
    if (roleFilter !== "all" && c.role !== roleFilter) return false;
    if (dockFilter === "confirmed" && !c.dock_models && c.dock_found !== true) return false;
    if (dockFilter === "unconfirmed" && (c.dock_models || c.dock_found === true)) return false;
    return true;
  });

  // Stats
  const stats = {
    total: companies.length,
    fr: companies.filter(c => c.country === "FR").length,
    nl: companies.filter(c => c.country === "NL").length,
    multiSource: companies.filter(c => c.sources.length >= 2).length,
    cometConfirmed: companies.filter(c => !!c.dock_models).length,
    webVerified: companies.filter(c => c.dock_found === true).length,
    webNoDock: companies.filter(c => c.dock_found === false && !c.verify_error).length,
    webPending: companies.filter(c => c.dock_found === undefined).length,
    operators: companies.filter(c => c.role === "operator").length,
    integrators: companies.filter(c => c.role === "system integrator" || c.role === "solution provider").length,
  };

  // Web verification status (Serper site-search result — independent of Comet)
  function webVerifyStatus(c: CompanyRow) {
    if (c.domain === "shell.com" || c.domain === "tatasteel.com" || c.domain === "epc-groupe.com" || !c.website) return "skipped";
    if (c.verify_error) return "error";
    if (c.dock_found === undefined) return "pending";
    return c.dock_found ? "found" : "not_found";
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC" }}>
      <Navbar />
      <div style={{ maxWidth: 1500, margin: "0 auto", padding: "24px 24px 64px" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>
            DJI Dock Cross-Reference — FR + NL Master List
          </h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>
            Deduped from 4 sources: DJI Dealer List, Google Search Crawler, Comet Intelligence, Deep Research.
            Run Serper verification to check websites for &quot;DJI Dock&quot; mentions.
          </p>
        </div>

        {/* KPI Cards */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
          {[
            { label: "Total Unique", value: stats.total, color: "#111827" },
            { label: "France", value: stats.fr, color: "#2563EB" },
            { label: "Netherlands", value: stats.nl, color: "#D97706" },
            { label: "Multi-Source", value: stats.multiSource, color: "#059669" },
            { label: "Comet Confirmed", value: stats.cometConfirmed, color: "#7C3AED" },
            { label: "Web: Dock Found", value: stats.webVerified, color: "#059669" },
            { label: "Web: No Dock", value: stats.webNoDock, color: "#DC2626" },
            { label: "Web: Pending", value: stats.webPending, color: "#9CA3AF" },
            { label: "Operators", value: stats.operators, color: "#DC2626" },
          ].map(kpi => (
            <div key={kpi.label} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "14px 18px", textAlign: "center", minWidth: 100 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <button onClick={runVerification} disabled={running}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: running ? "wait" : "pointer", background: running ? "#9CA3AF" : "#2563EB", color: "#fff", fontWeight: 700, fontSize: 13 }}>
            {running ? `Verifying... ${progress.done}/${progress.total}` : "Verify Websites"}
          </button>

          <button onClick={downloadCSV}
            style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #D1D5DB", cursor: "pointer", background: "#fff", color: "#374151", fontWeight: 700, fontSize: 13 }}>
            Download CSV
          </button>

          <select value={countryFilter} onChange={e => setCountryFilter(e.target.value as "all" | "FR" | "NL")}
            style={selectStyle}><option value="all">All Countries</option><option value="FR">France</option><option value="NL">Netherlands</option></select>

          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={selectStyle}>
            <option value="all">All Sources</option>
            <option value="dji_dealer">DJI Dealer</option>
            <option value="google_search">Google Search</option>
            <option value="comet">Comet</option>
            <option value="chatgpt">Deep Research</option>
          </select>

          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={selectStyle}>
            <option value="all">All Roles</option>
            <option value="operator">Operator</option>
            <option value="system integrator">System Integrator</option>
            <option value="solution provider">Solution Provider</option>
            <option value="dealer">Dealer</option>
            <option value="media">Media</option>
          </select>

          <select value={dockFilter} onChange={e => setDockFilter(e.target.value)} style={selectStyle}>
            <option value="all">All Dock Status</option>
            <option value="confirmed">Dock Confirmed</option>
            <option value="unconfirmed">Unconfirmed</option>
          </select>
        </div>

        {/* Table */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #E5E7EB", fontSize: 13, color: "#6B7280" }}>
            Showing {filtered.length} of {companies.length} companies
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["#", "Company", "Country", "City", "Role", "Sources", "Dock Models", "Confidence", "Website", "LinkedIn", "Web Verify", "Web Hits", "Web Variant", "Notes"].map(h => (
                    <th key={h} style={{
                      padding: "9px 10px", fontSize: 11, fontWeight: 600, color: "#6B7280",
                      background: "#F9FAFB", borderBottom: "2px solid #E5E7EB",
                      textAlign: ["Company", "Website", "LinkedIn", "Notes", "City"].includes(h) ? "left" : "center",
                      whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => {
                  const wvStatus = webVerifyStatus(c);
                  const wvBadge = DOCK_BADGE[wvStatus];
                  const roleBadge = ROLE_COLORS[c.role] ?? ROLE_COLORS.unknown;
                  // Row color: green if Comet confirmed OR web verified, red if web says no dock AND no Comet
                  const hasComet = !!c.dock_models;
                  const webConfirmed = c.dock_found === true;
                  const rowBg = (hasComet || webConfirmed) ? "#F0FDF4" : (c.dock_found === false && !hasComet) ? "#FEF2F2" : undefined;

                  return (
                    <React.Fragment key={`${c.country}-${c.domain}`}>
                      <tr style={{ background: rowBg }}>
                        <td style={tdStyle}>{i + 1}</td>
                        <td style={{ ...tdStyle, textAlign: "left", fontWeight: 700, maxWidth: 200 }}>{c.name}</td>
                        <td style={tdStyle}>
                          <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: c.country === "FR" ? "#DBEAFE" : "#FEF3C7", color: c.country === "FR" ? "#1E40AF" : "#92400E" }}>{c.country}</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "left", fontSize: 11, color: "#6B7280", maxWidth: 120 }}>{c.city ?? "—"}</td>
                        <td style={tdStyle}>
                          <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: roleBadge.bg, color: roleBadge.text }}>{c.role}</span>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
                            {c.sources.map(s => {
                              const sc = SOURCE_COLORS[s] ?? { bg: "#F3F4F6", text: "#6B7280" };
                              return <span key={s} style={{ padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700, background: sc.bg, color: sc.text }}>{SOURCE_LABELS[s] ?? s}</span>;
                            })}
                          </div>
                        </td>
                        <td style={{ ...tdStyle, fontSize: 11, maxWidth: 140 }}>{c.dock_models ?? <span style={{ color: "#D1D5DB" }}>—</span>}</td>
                        <td style={tdStyle}>
                          {c.comet_confidence ? (
                            <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: CONF_COLORS[c.comet_confidence]?.bg ?? "#F3F4F6", color: CONF_COLORS[c.comet_confidence]?.text ?? "#6B7280" }}>{c.comet_confidence}</span>
                          ) : "—"}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "left", fontSize: 11 }}>
                          {c.website ? <a href={c.website} target="_blank" rel="noreferrer" style={{ color: "#2563EB" }}>{c.domain}</a> : <span style={{ color: "#D1D5DB" }}>{c.domain}</span>}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "left", fontSize: 11 }}>
                          {c.linkedin_url ? <a href={c.linkedin_url} target="_blank" rel="noreferrer" style={{ color: "#2563EB" }}>LinkedIn</a> : <span style={{ color: "#D1D5DB" }}>—</span>}
                        </td>
                        {/* Web Verify = Serper site-search result */}
                        <td style={tdStyle}>
                          <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: wvBadge.bg, color: wvBadge.text }}>{wvBadge.label}</span>
                        </td>
                        {/* Web Hits = number of pages mentioning DJI Dock */}
                        <td style={tdStyle}>
                          {c.dock_mentions !== undefined ? (
                            <span style={{ fontWeight: 700, color: c.dock_mentions > 0 ? "#059669" : "#DC2626" }}>{c.dock_mentions}</span>
                          ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                        </td>
                        {/* Web Variant = which Dock model found on website */}
                        <td style={{ ...tdStyle, fontSize: 11 }}>
                          {c.dock_variant ? (
                            <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "#F0FDF4", color: "#166534" }}>{c.dock_variant}</span>
                          ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "left", fontSize: 10, color: "#6B7280", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.notes ?? undefined}>{c.notes ?? "—"}</td>
                      </tr>
                      {/* Expandable: show actual pages found by Serper */}
                      {c.mentions && c.mentions.length > 0 && (
                        <tr>
                          <td colSpan={14} style={{ padding: "8px 16px", background: "#F9FAFB", borderBottom: "2px solid #E5E7EB" }}>
                            <div style={{ fontSize: 11, color: "#374151" }}>
                              <span style={{ fontWeight: 700, fontSize: 10, color: "#6B7280", marginBottom: 4, display: "block" }}>Pages mentioning &quot;DJI Dock&quot; on {c.domain}:</span>
                              {c.mentions.slice(0, 5).map((m, j) => (
                                <div key={j} style={{ marginBottom: 4 }}>
                                  <a href={m.url} target="_blank" rel="noreferrer" style={{ color: "#2563EB", fontWeight: 600 }}>{m.title}</a>
                                  <div style={{ color: "#9CA3AF", fontSize: 10 }}>{m.snippet}</div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "center",
  borderBottom: "1px solid #F3F4F6",
  fontSize: 12,
};

const selectStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid #D1D5DB",
  fontSize: 13,
};
