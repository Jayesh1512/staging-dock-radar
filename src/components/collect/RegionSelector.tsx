"use client";
import { useState, useRef, useEffect } from 'react';
import { REGION_GROUPS, ALL_COUNTRIES } from '@/lib/constants';

interface RegionSelectorProps {
  selected: string[];
  onChange: (regions: string[]) => void;
}

export function RegionSelector({ selected, onChange }: RegionSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const allSelected = selected.length === ALL_COUNTRIES.length;

  const toggleAll = () => {
    onChange(allSelected ? [] : [...ALL_COUNTRIES]);
  };

  const toggleCountry = (country: string) => {
    onChange(selected.includes(country) ? selected.filter(c => c !== country) : [...selected, country]);
  };

  const toggleContinent = (countries: readonly string[]) => {
    const allIn = countries.every(c => selected.includes(c));
    if (allIn) {
      onChange(selected.filter(c => !countries.includes(c)));
    } else {
      const newSet = new Set([...selected, ...countries]);
      onChange([...newSet]);
    }
  };

  return (
    <div ref={ref} className="relative">
      <label className="block" style={{ fontSize: 12, fontWeight: 600, color: 'var(--dr-text-muted)', marginBottom: 6 }}>Regions</label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 w-full cursor-pointer"
        style={{
          padding: '7px 12px', border: '1px solid var(--dr-border)', borderRadius: 6,
          background: '#fff', fontSize: 13, fontWeight: 500, color: 'var(--dr-text)',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        ▾&nbsp;&nbsp;{selected.length} countries selected
      </button>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-72 bg-white border shadow-lg overflow-y-auto" style={{ borderColor: 'var(--dr-border)', borderRadius: 8, maxHeight: 320, padding: 12 }}>
          <label className="flex items-center gap-2 cursor-pointer mb-2 pb-2 border-b" style={{ borderColor: 'var(--dr-border)' }}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-[var(--dr-blue)]" />
            <span className="font-semibold" style={{ fontSize: 13 }}>Global (all editions)</span>
          </label>
          {REGION_GROUPS.map((group) => {
            const allGroupIn = group.countries.every(c => selected.includes(c));
            return (
              <div key={group.continent} className="mb-2">
                <label className="flex items-center gap-2 cursor-pointer mb-1">
                  <input type="checkbox" checked={allGroupIn} onChange={() => toggleContinent(group.countries)} className="accent-[var(--dr-blue)]" />
                  <span className="font-semibold" style={{ fontSize: 12.5, color: 'var(--dr-text-secondary)' }}>{group.continent}</span>
                </label>
                <div className="flex flex-wrap gap-x-3 gap-y-1 pl-6">
                  {group.countries.map((country) => (
                    <label key={country} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={selected.includes(country)} onChange={() => toggleCountry(country)} className="accent-[var(--dr-blue)]" />
                      <span style={{ fontSize: 12, color: 'var(--dr-text-muted)' }}>{country}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
