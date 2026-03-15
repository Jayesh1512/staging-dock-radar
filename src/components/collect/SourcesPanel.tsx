"use client";

export function SourcesPanel() {
  return (
    <div
      className="flex items-center gap-5 flex-wrap"
      style={{
        background: 'var(--dr-surface)', border: '1px solid var(--dr-border)',
        borderRadius: 8, padding: '12px 16px', marginBottom: 14,
      }}
    >
      <span className="whitespace-nowrap uppercase" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.4 }}>
        Sources to scan:
      </span>
      {/* Google News - enabled */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center justify-center flex-shrink-0" style={{ width: 16, height: 16, borderRadius: 4, border: '2px solid var(--dr-blue)', background: 'var(--dr-blue)' }}>
          <span className="text-white font-bold" style={{ fontSize: 10 }}>✓</span>
        </div>
        <span className="font-semibold" style={{ fontSize: 13, color: 'var(--dr-text-secondary)' }}>Google News</span>
      </div>
      {/* LinkedIn - disabled */}
      <div className="flex items-center gap-1.5">
        <div className="flex-shrink-0" style={{ width: 16, height: 16, borderRadius: 4, border: '2px solid #D1D5DB', background: '#fff' }} />
        <span className="font-medium" style={{ fontSize: 13, color: '#9CA3AF' }}>LinkedIn</span>
        <span className="font-semibold" style={{ fontSize: 10, color: '#9CA3AF', background: '#F3F4F6', border: '1px solid #E5E7EB', padding: '1px 7px', borderRadius: 20 }}>coming soon</span>
      </div>
      {/* Facebook - disabled */}
      <div className="flex items-center gap-1.5">
        <div className="flex-shrink-0" style={{ width: 16, height: 16, borderRadius: 4, border: '2px solid #D1D5DB', background: '#fff' }} />
        <span className="font-medium" style={{ fontSize: 13, color: '#9CA3AF' }}>Facebook</span>
        <span className="font-semibold" style={{ fontSize: 10, color: '#9CA3AF', background: '#F3F4F6', border: '1px solid #E5E7EB', padding: '1px 7px', borderRadius: 20 }}>coming soon</span>
      </div>
    </div>
  );
}
