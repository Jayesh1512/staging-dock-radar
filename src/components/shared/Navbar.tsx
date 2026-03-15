"use client";

export function Navbar() {
  return (
    <header className="sticky top-0 z-[100] bg-white border-b" style={{ borderColor: 'var(--dr-border)', height: 53 }}>
      <div className="flex items-center justify-between h-full px-8" style={{ maxWidth: 'var(--dr-max-w)', margin: '0 auto' }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-md text-white font-bold" style={{ width: 28, height: 28, fontSize: 11, letterSpacing: 0.3, background: 'var(--dr-blue)' }}>
            DR
          </div>
          <div className="flex flex-col">
            <span className="font-bold leading-tight" style={{ fontSize: 15, color: 'var(--dr-blue)' }}>Dock Radar</span>
            <span className="leading-tight" style={{ fontSize: 11, color: '#9CA3AF' }}>Social Listening & BD Intelligence</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-semibold rounded-full" style={{ fontSize: 11, padding: '3px 10px', background: 'var(--dr-blue-light)', color: 'var(--dr-blue)' }}>Phase 1</span>
          <span className="font-medium" style={{ fontSize: 13, color: '#9CA3AF' }}>FlytBase</span>
        </div>
      </div>
    </header>
  );
}
