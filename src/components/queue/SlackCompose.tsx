"use client";

interface SlackComposeProps {
  message: string;
  onChange: (message: string) => void;
}

export function SlackCompose({ message, onChange }: SlackComposeProps) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--dr-border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--dr-border)', fontSize: 12, fontWeight: 600, color: 'var(--dr-text-muted)' }}>
        💬&nbsp;&nbsp;Message to #dock-radar
      </div>
      <textarea
        value={message}
        onChange={(e) => onChange(e.target.value)}
        className="focus:outline-none"
        style={{
          width: '100%', padding: '12px 14px', border: 'none', resize: 'vertical',
          minHeight: 100, fontSize: 12.5,
          color: 'var(--dr-text)', lineHeight: 1.6,
        }}
      />
    </div>
  );
}
