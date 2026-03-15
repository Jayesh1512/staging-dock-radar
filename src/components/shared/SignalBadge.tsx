import { SIGNAL_BADGE_COLORS } from "@/lib/constants";
import type { SignalType } from "@/lib/types";

interface SignalBadgeProps {
  signal: SignalType;
}

export function SignalBadge({ signal }: SignalBadgeProps) {
  const colors = SIGNAL_BADGE_COLORS[signal];
  return (
    <span
      className="inline-flex items-center uppercase font-bold"
      style={{
        background: colors.bg,
        color: colors.text,
        fontSize: 10.5,
        letterSpacing: 0.3,
        padding: '3px 8px',
        borderRadius: 4,
      }}
    >
      {signal}
    </span>
  );
}
