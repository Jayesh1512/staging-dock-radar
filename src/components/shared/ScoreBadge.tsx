import { getScoreBand } from "@/lib/constants";

interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'default';
}

export function ScoreBadge({ score, size = 'default' }: ScoreBadgeProps) {
  const band = getScoreBand(score);
  const isSmall = size === 'sm';
  return (
    <span
      className="inline-flex items-center justify-center font-bold"
      style={{
        background: band.bg,
        color: band.text,
        width: isSmall ? 32 : 38,
        height: isSmall ? 20 : 26,
        borderRadius: 6,
        fontSize: isSmall ? 11 : 13,
      }}
    >
      {score}
    </span>
  );
}
