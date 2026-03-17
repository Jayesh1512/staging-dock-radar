"use client";
import { EnrichmentTestAgent } from './EnrichmentTestAgent';

export function Navbar({ onAnalytics, analyticsActive, onCampaign, campaignActive }: { onAnalytics?: () => void; analyticsActive?: boolean; onCampaign?: () => void; campaignActive?: boolean }) {
  return (
    <header className="sticky top-0 z-[100] bg-white border-b" style={{ borderColor: 'var(--dr-border)', height: 53 }}>
      <div className="flex items-center justify-between h-full px-8" style={{ maxWidth: 'var(--dr-max-w)', margin: '0 auto' }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-md text-white font-bold" style={{ width: 28, height: 28, fontSize: 11, letterSpacing: 0.3, background: 'var(--dr-blue)' }}>
            DR
          </div>
          <div className="flex flex-col">
            <span className="font-bold leading-tight" style={{ fontSize: 15, color: 'var(--dr-blue)' }}>Dock Radar</span>
            <span className="leading-tight" style={{ fontSize: 11, color: 'var(--dr-text-disabled)' }}>Social Listening & BD Intelligence</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <EnrichmentTestAgent />
          <button
            onClick={onCampaign}
            style={{
              fontSize: 12, fontWeight: 600, padding: '5px 14px', borderRadius: 7, cursor: 'pointer',
              background: campaignActive ? '#C2410C' : '#FFF7ED',
              color: campaignActive ? '#fff' : '#C2410C',
              border: 'none',
            }}
          >
            DSP Campaign
          </button>
          <button
            onClick={onAnalytics}
            style={{
              fontSize: 12, fontWeight: 600, padding: '5px 14px', borderRadius: 7, cursor: 'pointer',
              background: analyticsActive ? 'var(--dr-blue)' : 'var(--dr-blue-light)',
              color: analyticsActive ? '#fff' : 'var(--dr-blue)',
              border: 'none',
            }}
          >
            Radar Analytics ↗
          </button>
          <span className="font-semibold rounded-full" style={{ fontSize: 11, padding: '3px 10px', background: 'var(--dr-blue-light)', color: 'var(--dr-blue)' }}>Phase 1</span>
          <span className="font-medium" style={{ fontSize: 13, color: 'var(--dr-text-disabled)' }}>FlytBase</span>
        </div>
      </div>
    </header>
  );
}
