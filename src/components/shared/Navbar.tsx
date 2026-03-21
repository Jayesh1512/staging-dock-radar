"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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
  const [utilitiesOpen, setUtilitiesOpen] = useState(false);
  const utilitiesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const el = utilitiesRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setUtilitiesOpen(false);
    }

    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  return (
    <header className="sticky top-0 z-[100] bg-white border-b" style={{ borderColor: 'var(--dr-border)', height: 53 }}>
      <div className="flex items-center justify-between h-full px-8" style={{ maxWidth: 'var(--dr-max-w)', margin: '0 auto' }}>
        <button
          onClick={onHome}
          className="flex items-center gap-3 cursor-pointer"
          style={{ background: 'none', border: 'none', padding: 0 }}
        >
          <div className="flex items-center justify-center rounded-md text-white font-bold" style={{ width: 28, height: 28, fontSize: 11, letterSpacing: 0.3, background: 'var(--dr-blue)' }}>
            DR
          </div>
          <div className="flex flex-col text-left">
            <span className="font-bold leading-tight" style={{ fontSize: 15, color: 'var(--dr-blue)' }}>Dock Radar</span>
            <span className="leading-tight" style={{ fontSize: 11, color: 'var(--dr-text-disabled)' }}>Social Listening & BD Intelligence</span>
          </div>
        </button>
        <div className="flex items-center gap-3">
          <div ref={utilitiesRef} className="relative">
            <button
              onClick={() => setUtilitiesOpen(o => !o)}
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '5px 12px',
                borderRadius: 7,
                cursor: 'pointer',
                background: utilitiesOpen ? 'var(--dr-blue)' : 'var(--dr-blue-light)',
                color: utilitiesOpen ? '#fff' : 'var(--dr-blue)',
                border: 'none',
                letterSpacing: 0.1,
              }}
              aria-haspopup="menu"
              aria-expanded={utilitiesOpen}
            >
              Utilities ▾
            </button>

            {utilitiesOpen && (
              <div
                role="menu"
                aria-label="Utilities"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 8px)',
                  width: 270,
                  background: '#fff',
                  border: `1px solid var(--dr-border)`,
                  borderRadius: 10,
                  boxShadow: '0 18px 40px rgba(0,0,0,0.10)',
                  zIndex: 1000,
                  padding: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
                onClick={(e) => {
                  // Prevent document handler from closing the dropdown
                  // before the click reaches React handlers.
                  e.stopPropagation();
                }}
              >
                <div style={{ width: '100%' }}>
                  <EnrichmentTestAgent mode="menuItem" />
                </div>
                <div style={{ width: '100%' }}>
                  <CometImportPanel mode="menuItem" />
                </div>
                <div style={{ width: '100%' }}>
                  <DjiPartnersScraper mode="menuItem" />
                </div>
                <Link
                  role="menuitem"
                  href="/utilities/linkedin-company-posts"
                  onClick={() => setUtilitiesOpen(false)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #E5E7EB',
                    background: '#fff',
                    color: '#374151',
                    cursor: 'pointer',
                    letterSpacing: 0.1,
                    textDecoration: 'none',
                    display: 'block',
                  }}
                >
                  🏢 LinkedIn Company Posts
                </Link>

                <button
                  role="menuitem"
                  onClick={() => { onCampaign?.(); setUtilitiesOpen(false); }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '8px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: campaignActive ? '#C2410C' : '#FFF7ED',
                    color: campaignActive ? '#fff' : '#C2410C',
                    border: 'none',
                    letterSpacing: 0.1,
                  }}
                >
                  DSP Campaign
                </button>

                <button
                  role="menuitem"
                  onClick={() => { onPartnerHitList?.(); setUtilitiesOpen(false); }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '8px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: partnerHitListActive ? '#15803D' : '#DCFCE7',
                    color: partnerHitListActive ? '#fff' : '#15803D',
                    border: 'none',
                    letterSpacing: 0.1,
                  }}
                >
                  Partners Hit List ↗
                </button>

                <button
                  role="menuitem"
                  onClick={() => { onAnalytics?.(); setUtilitiesOpen(false); }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '8px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: analyticsActive ? 'var(--dr-blue)' : 'var(--dr-blue-light)',
                    color: analyticsActive ? '#fff' : 'var(--dr-blue)',
                    border: 'none',
                    letterSpacing: 0.1,
                  }}
                >
                  Radar Analytics ↗
                </button>
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
