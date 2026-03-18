import { SOURCE_BADGE_COLORS, SOURCE_LABELS } from "@/lib/constants";
import type { ArticleSource } from "@/lib/types";

interface SourceBadgeProps {
  source?: ArticleSource | null;
}

export function SourceBadge({ source }: SourceBadgeProps) {
  const key = (source ?? 'unknown') as ArticleSource;
  const colors = SOURCE_BADGE_COLORS[key] ?? { bg: '#F3F4F6', text: '#4B5563' };
  const label = SOURCE_LABELS[key] ?? String(source ?? 'Unknown');
  return (
    <span
      className="inline-flex items-center font-bold"
      style={{
        background: colors.bg,
        color: colors.text,
        fontSize: 11,
        padding: '3px 9px',
        borderRadius: 5,
      }}
    >
      {label}
    </span>
  );
}
