import { Radar } from 'lucide-react';

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-border-default">
      <div className="mx-auto flex h-14 max-w-[var(--max-w-content)] items-center px-8">
        <div className="flex items-center gap-3">
          <Radar className="h-6 w-6 text-primary" />
          <div>
            <span className="text-[15px] font-bold text-text-primary">Dock Radar</span>
            <span className="ml-2 text-[11px] text-text-muted">by FlytBase</span>
          </div>
        </div>
      </div>
    </header>
  );
}
