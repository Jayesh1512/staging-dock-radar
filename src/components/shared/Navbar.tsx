"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { EnrichmentTestAgent } from './EnrichmentTestAgent';
import { CometImportPanel } from '../import/CometImportPanel';
import { DjiPartnersScraper } from '../utilities/DjiPartnersScraper';

export function Navbar({
  onAnalytics,
  analyticsActive,
  onCampaign,
  campaignActive,
  onPartnerHitList,
  partnerHitListActive,
  onHome,
}: {
  onAnalytics?: () => void;
  analyticsActive?: boolean;
  onCampaign?: () => void;
  campaignActive?: boolean;
  onPartnerHitList?: () => void;
  partnerHitListActive?: boolean;
  onHome?: () => void;
}) {
  const pathname = usePathname();
  const [campaignsOpen, setCampaignsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const campaignsRef = useRef<HTMLDivElement | null>(null);
  const toolsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (campaignsRef.current && e.target instanceof Node && !campaignsRef.current.contains(e.target)) {
        setCampaignsOpen(false);
      }
      if (toolsRef.current && e.target instanceof Node && !toolsRef.current.contains(e.target)) {
        setToolsOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    right: 0,
    top: 'calc(100% + 8px)',
    width: 270,
    background: '#fff',
    border: '1px solid var(--dr-border)',
    borderRadius: 10,
    boxShadow: '0 18px 40px rgba(0,0,0,0.10)',
    zIndex: 1000,
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  };

  const menuItemStyle = (active?: boolean, color?: string): React.CSSProperties => ({
    width: '100%',
    textAlign: 'left',
    fontSize: 12,
    fontWeight: 700,
    padding: '8px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    border: 'none',
    letterSpacing: 0.1,
    background: active ? (color ?? 'var(--dr-blue)') : '#fff',
    color: active ? '#fff' : (color ?? '#374151'),
  });

  const menuSubtitle: React.CSSProperties = {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: 400,
    marginTop: 2,
    lineHeight: 1.3,
  };

  return (
    <header className="sticky top-0 z-[100] bg-white border-b" style={{ borderColor: 'var(--dr-border)', height: 53 }}>
      <div className="flex items-center justify-between h-full px-8" style={{ maxWidth: 'var(--dr-max-w)', margin: '0 auto' }}>
        {onHome ? (
          <button
            onClick={onHome}
            className="flex items-center gap-3 cursor-pointer"
            style={{ background: 'none', border: 'none', padding: 0 }}
            title="Collect, Score & Queue pipeline"
          >
            <div className="flex items-center justify-center rounded-md text-white font-bold" style={{ width: 28, height: 28, fontSize: 11, letterSpacing: 0.3, background: 'var(--dr-blue)' }}>
              DR
            </div>
            <div className="flex flex-col text-left">
              <span className="font-bold leading-tight" style={{ fontSize: 15, color: 'var(--dr-blue)' }}>Dock Radar</span>
              <span className="leading-tight" style={{ fontSize: 11, color: 'var(--dr-text-disabled)' }}>Social Listening & BD Intelligence</span>
            </div>
          </button>
        ) : (
          <Link href="/" className="flex items-center gap-3" style={{ textDecoration: 'none' }} title="Collect, Score & Queue pipeline">
            <div className="flex items-center justify-center rounded-md text-white font-bold" style={{ width: 28, height: 28, fontSize: 11, letterSpacing: 0.3, background: 'var(--dr-blue)' }}>
              DR
            </div>
            <div className="flex flex-col text-left">
              <span className="font-bold leading-tight" style={{ fontSize: 15, color: 'var(--dr-blue)' }}>Dock Radar</span>
              <span className="leading-tight" style={{ fontSize: 11, color: 'var(--dr-text-disabled)' }}>Social Listening & BD Intelligence</span>
            </div>
          </Link>
        )}

        <div className="flex items-center gap-3">

          {/* ── Campaigns Dropdown ── */}
          <div ref={campaignsRef} className="relative">
            <button
              onClick={() => { setCampaignsOpen(o => !o); setToolsOpen(false); }}
              title="DSP campaigns and LinkedIn scans"
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '5px 12px',
                borderRadius: 7,
                cursor: 'pointer',
                background: campaignsOpen || campaignActive ? '#C2410C' : '#FFF7ED',
                color: campaignsOpen || campaignActive ? '#fff' : '#C2410C',
                border: 'none',
                letterSpacing: 0.1,
              }}
            >
              Campaigns ▾
            </button>

            {campaignsOpen && (
              <div role="menu" aria-label="Campaigns" style={dropdownStyle} onClick={(e) => e.stopPropagation()}>
                {onCampaign ? (
                  <button
                    role="menuitem"
                    onClick={() => { onCampaign(); setCampaignsOpen(false); }}
                    style={menuItemStyle(campaignActive, '#C2410C')}
                  >
                    <div>DSP Campaign</div>
                    <div style={menuSubtitle}>Run C1/C2/C3 historical sweeps across regions</div>
                  </button>
                ) : (
                  <Link role="menuitem" href="/" onClick={() => setCampaignsOpen(false)} style={{ ...menuItemStyle(false, '#C2410C'), textDecoration: 'none', display: 'block' }}>
                    <div>DSP Campaign</div>
                    <div style={menuSubtitle}>Run C1/C2/C3 historical sweeps across regions</div>
                  </Link>
                )}

                <Link
                  role="menuitem"
                  href="/utilities/google-search-campaign"
                  onClick={() => setCampaignsOpen(false)}
                  style={{ ...menuItemStyle(pathname === '/utilities/google-search-campaign', '#C2410C'), textDecoration: 'none', display: 'block' }}
                >
                  <div>Batch 2 — Global Google Search</div>
                  <div style={menuSubtitle}>Run DJI Dock search across 18 countries, 7 pages each</div>
                </Link>

                <Link
                  role="menuitem"
                  href="/utilities/linkedin-company-posts"
                  onClick={() => setCampaignsOpen(false)}
                  style={{ ...menuItemStyle(pathname === '/utilities/linkedin-company-posts', '#C2410C'), textDecoration: 'none', display: 'block' }}
                >
                  <div>LinkedIn Company Scan</div>
                  <div style={menuSubtitle}>Scan company pages for DJI Dock signals + keyword match</div>
                </Link>

                <Link
                  role="menuitem"
                  href="/utilities/linkedin-scan-results"
                  onClick={() => setCampaignsOpen(false)}
                  style={{ ...menuItemStyle(pathname === '/utilities/linkedin-scan-results', '#C2410C'), textDecoration: 'none', display: 'block' }}
                >
                  <div>LinkedIn Scan Results</div>
                  <div style={menuSubtitle}>Dashboard with batch signals, dock matches, progress</div>
                </Link>
              </div>
            )}
          </div>

          {/* ── Partners Pipeline (top-level) ── */}
          {onPartnerHitList ? (
            <button
              onClick={onPartnerHitList}
              title="DSP hit list and partner pipeline"
              style={{
                fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 7, cursor: 'pointer',
                background: partnerHitListActive ? '#15803D' : '#DCFCE7',
                color: partnerHitListActive ? '#fff' : '#15803D',
                border: 'none', letterSpacing: 0.1,
              }}
            >
              Partners Pipeline
            </button>
          ) : (
            <Link href="/" title="DSP hit list and partner pipeline" style={{
              fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 7,
              background: '#DCFCE7', color: '#15803D', textDecoration: 'none', letterSpacing: 0.1,
            }}>
              Partners Pipeline
            </Link>
          )}

          {/* ── Analytics (top-level) ── */}
          {onAnalytics ? (
            <button
              onClick={onAnalytics}
              title="Signal trends, country breakdown, score distribution"
              style={{
                fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 7, cursor: 'pointer',
                background: analyticsActive ? 'var(--dr-blue)' : 'var(--dr-blue-light)',
                color: analyticsActive ? '#fff' : 'var(--dr-blue)',
                border: 'none', letterSpacing: 0.1,
              }}
            >
              Analytics
            </button>
          ) : (
            <Link href="/" title="Signal trends, country breakdown, score distribution" style={{
              fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 7,
              background: 'var(--dr-blue-light)', color: 'var(--dr-blue)', textDecoration: 'none', letterSpacing: 0.1,
            }}>
              Analytics
            </Link>
          )}

          {/* ── Tools Dropdown ── */}
          <div ref={toolsRef} className="relative">
            <button
              onClick={() => { setToolsOpen(o => !o); setCampaignsOpen(false); }}
              title="Internal tools and data imports"
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '5px 12px',
                borderRadius: 7,
                cursor: 'pointer',
                background: toolsOpen ? '#6B7280' : '#F3F4F6',
                color: toolsOpen ? '#fff' : '#6B7280',
                border: 'none',
                letterSpacing: 0.1,
              }}
            >
              Tools ▾
            </button>

            {toolsOpen && (
              <div role="menu" aria-label="Tools" style={dropdownStyle} onClick={(e) => e.stopPropagation()}>
                <Link
                  role="menuitem"
                  href="/utilities/country-wise-registry-review"
                  onClick={() => setToolsOpen(false)}
                  style={{ ...menuItemStyle(pathname === '/utilities/country-wise-registry-review'), textDecoration: 'none', display: 'block' }}
                >
                  <div>Country Registry Review</div>
                  <div style={menuSubtitle}>QA & approve companies from govt business registries (SIRENE, Companies House)</div>
                </Link>

                <Link
                  role="menuitem"
                  href="/utilities/google-search-crawler"
                  onClick={() => setToolsOpen(false)}
                  style={{ ...menuItemStyle(pathname === '/utilities/google-search-crawler'), textDecoration: 'none', display: 'block' }}
                >
                  <div>Google Search Crawler</div>
                  <div style={menuSubtitle}>Crawl Google for DJI Dock keywords by country, score domains</div>
                </Link>

                <Link
                  role="menuitem"
                  href="/utilities/dji-dock-research"
                  onClick={() => setToolsOpen(false)}
                  style={{ ...menuItemStyle(pathname === '/utilities/dji-dock-research'), textDecoration: 'none', display: 'block' }}
                >
                  <div>DJI Dock Research</div>
                  <div style={menuSubtitle}>Raw Google News + LinkedIn HTML snapshots by country</div>
                </Link>

                <Link
                  role="menuitem"
                  href="/utilities/dji-dock-hunter"
                  onClick={() => setToolsOpen(false)}
                  style={{ ...menuItemStyle(pathname === '/utilities/dji-dock-hunter', '#B45309'), textDecoration: 'none', display: 'block' }}
                >
                  <div>DJI Dock Hunter</div>
                  <div style={menuSubtitle}>Registry → Serper + crawl → DJI Dock regex → discovered_companies</div>
                </Link>

                <Link
                  role="menuitem"
                  href="/utilities/csv-company-pipeline"
                  onClick={() => setToolsOpen(false)}
                  style={{ ...menuItemStyle(pathname === '/utilities/csv-company-pipeline', '#047857'), textDecoration: 'none', display: 'block' }}
                >
                  <div>CSV company pipeline</div>
                  <div style={menuSubtitle}>Apollo + Serper enrich → QA → Storage + multi_sources_companies_import</div>
                </Link>

                <Link
                  role="menuitem"
                  href="/utilities/dock-verify"
                  onClick={() => setToolsOpen(false)}
                  style={{ ...menuItemStyle(pathname === '/utilities/dock-verify', '#059669'), textDecoration: 'none', display: 'block' }}
                >
                  <div>Dock Verify (Cross-Reference)</div>
                  <div style={menuSubtitle}>Verify DJI Dock mentions on company websites &amp; LinkedIn</div>
                </Link>

                <Link
                  role="menuitem"
                  href="/utilities/qa-agent"
                  onClick={() => setToolsOpen(false)}
                  style={{ ...menuItemStyle(pathname === '/utilities/qa-agent', '#7C3AED'), textDecoration: 'none', display: 'block' }}
                >
                  <div>DJI Dock Keyword QA Agent</div>
                  <div style={menuSubtitle}>Automated DJI Dock verification — Serper + LinkedIn + confidence scoring</div>
                </Link>

                <Link
                  role="menuitem"
                  href="/utilities/dji-dock-company-enricher"
                  onClick={() => setToolsOpen(false)}
                  style={{ ...menuItemStyle(pathname === '/utilities/dji-dock-company-enricher', '#C2410C'), textDecoration: 'none', display: 'block' }}
                >
                  <div>DJI Dock Company Enricher</div>
                  <div style={menuSubtitle}>Company + country | Serper | regex scrape</div>
                </Link>

                <Link
                  role="menuitem"
                  href="/utilities/company-enrichment"
                  onClick={() => setToolsOpen(false)}
                  style={{ ...menuItemStyle(pathname === '/utilities/company-enrichment', '#047857'), textDecoration: 'none', display: 'block' }}
                >
                  <div>Company Enrichment</div>
                  <div style={menuSubtitle}>Preview next 5 companies for enrichment</div>
                </Link>

                <div style={{ width: '100%' }} title="Test company enrichment lookups">
                  <EnrichmentTestAgent mode="menuItem" />
                </div>
                <div style={{ width: '100%' }} title="Import partner data from Comet CSV">
                  <CometImportPanel mode="menuItem" />
                </div>
                <div style={{ width: '100%' }} title="Scrape DJI where-to-buy reseller pages">
                  <DjiPartnersScraper mode="menuItem" />
                </div>
              </div>
            )}
          </div>

          <span className="font-semibold rounded-full" style={{ fontSize: 11, padding: '3px 10px', background: 'var(--dr-blue-light)', color: 'var(--dr-blue)' }}>Phase 1</span>
          <span className="font-medium" style={{ fontSize: 13, color: 'var(--dr-text-disabled)' }}>FlytBase</span>
        </div>
      </div>
    </header>
  );
}
