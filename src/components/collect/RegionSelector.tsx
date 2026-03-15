"use client";
import { REGION_GROUPS, ALL_COUNTRIES } from '@/lib/constants';

interface RegionSelectorProps {
  selected: string[];
  onChange: (regions: string[]) => void;
}

export function RegionSelector({ selected, onChange }: RegionSelectorProps) {
  const allSelected = selected.length === ALL_COUNTRIES.length;

  const toggleAll = () => onChange(allSelected ? [] : [...ALL_COUNTRIES]);

  const toggleCountry = (country: string) =>
    onChange(
      selected.includes(country)
        ? selected.filter((c) => c !== country)
        : [...selected, country]
    );

  const toggleContinent = (countries: readonly string[]) => {
    const allIn = countries.every((c) => selected.includes(c));
    if (allIn) {
      onChange(selected.filter((c) => !countries.includes(c)));
    } else {
      onChange([...new Set([...selected, ...countries])]);
    }
  };

  return (
    <div>
      {/* Label row */}
      <div className="flex items-center gap-3" style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--dr-text-muted)' }}>
          Regions
        </label>
        <button
          onClick={toggleAll}
          className="cursor-pointer"
          style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
            border: '1px solid var(--dr-border)',
            background: allSelected ? 'var(--dr-blue-light)' : '#fff',
            color: allSelected ? 'var(--dr-blue)' : 'var(--dr-text-muted)',
          }}
        >
          {allSelected ? '✓ All markets' : 'Select all'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--dr-text-muted)' }}>
          {selected.length} / {ALL_COUNTRIES.length} selected
        </span>
      </div>

      {/* Continent groups */}
      <div
        style={{
          border: '1px solid var(--dr-border)', borderRadius: 8,
          background: '#fff', padding: '10px 12px',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        {REGION_GROUPS.map((group) => {
          const allIn = group.countries.every((c) => selected.includes(c));
          const someIn = group.countries.some((c) => selected.includes(c));

          return (
            <div key={group.continent}>
              {/* Continent toggle row */}
              <div className="flex items-center gap-2" style={{ marginBottom: 5 }}>
                <button
                  onClick={() => toggleContinent(group.countries)}
                  className="cursor-pointer"
                  style={{
                    fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                    letterSpacing: 0.3, textTransform: 'uppercase',
                    border: `1px solid ${allIn ? '#BFDBFE' : someIn ? '#BFDBFE' : 'var(--dr-border)'}`,
                    background: allIn ? 'var(--dr-blue)' : someIn ? 'var(--dr-blue-light)' : '#F9FAFB',
                    color: allIn ? '#fff' : someIn ? 'var(--dr-blue)' : 'var(--dr-text-muted)',
                  }}
                >
                  {group.continent}
                </button>
                {someIn && !allIn && (
                  <span style={{ fontSize: 10, color: 'var(--dr-text-muted)' }}>
                    {group.countries.filter((c) => selected.includes(c)).length}/{group.countries.length}
                  </span>
                )}
              </div>

              {/* Country chips */}
              <div className="flex flex-wrap gap-1.5" style={{ paddingLeft: 4 }}>
                {group.countries.map((country) => {
                  const active = selected.includes(country);
                  return (
                    <button
                      key={country}
                      onClick={() => toggleCountry(country)}
                      className="cursor-pointer transition-colors"
                      style={{
                        fontSize: 11.5, fontWeight: 500, padding: '3px 10px', borderRadius: 20,
                        border: `1px solid ${active ? '#BFDBFE' : 'var(--dr-border)'}`,
                        background: active ? 'var(--dr-blue-light)' : '#F9FAFB',
                        color: active ? 'var(--dr-blue)' : 'var(--dr-text-muted)',
                      }}
                    >
                      {country}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
