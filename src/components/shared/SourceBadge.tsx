import { SOURCE_BADGE_COLORS, SOURCE_LABELS } from "@/lib/constants";
import type { ArticleSource } from "@/lib/types";

interface SourceBadgeProps {
  source: ArticleSource;
}

export function SourceBadge({ source }: SourceBadgeProps) {
  const colors = SOURCE_BADGE_COLORS[source];
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
      {SOURCE_LABELS[source]}
    </span>
  );
}
