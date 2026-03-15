"use client";
import { getInitials } from '@/lib/utils';
import type { Person } from '@/lib/types';

const AVATAR_COLORS = ['#2C7BF2', '#7C3AED', '#059669', '#D97706', '#DC2626'];

interface PersonCardProps {
  person: Person;
  index?: number;
}

export function PersonCard({ person, index = 0 }: PersonCardProps) {
  const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
  return (
    <div className="flex items-center gap-2.5" style={{ padding: '8px 10px', background: '#fff', border: '1px solid var(--dr-border)', borderRadius: 7, marginBottom: 6 }}>
      <div className="flex items-center justify-center flex-shrink-0 rounded-full text-white font-bold" style={{ width: 32, height: 32, background: color, fontSize: 11 }}>
        {getInitials(person.name)}
      </div>
      <div style={{ flex: 1 }}>
        <div className="font-semibold" style={{ fontSize: 12.5, color: 'var(--dr-text)' }}>{person.name}</div>
        <div style={{ fontSize: 11, color: 'var(--dr-text-muted)' }}>{person.role} — {person.organization}</div>
        <div className="italic" style={{ fontSize: 10.5, color: '#D1D5DB', borderTop: '1px dashed var(--dr-border)', paddingTop: 4, marginTop: 4 }}>
          Phase 2: email / LinkedIn profile slot
        </div>
      </div>
    </div>
  );
}
