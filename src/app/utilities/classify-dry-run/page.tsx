"use client";

import React, { useCallback, useState } from 'react';
import { Navbar } from '@/components/shared/Navbar';

type ClassifiedCompany = {
  display_name: string;
  role: string | null;
  website: string | null;
  linkedin: string | null;
  evidence_url: string | null;
  country_code: string;
  category: string;
  confidence: number;
  reason: string;
  email_subject: string | null;
  email_body: string | null;
  error: string | null;
};

export default function ClassifyDryRunPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ClassifiedCompany[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [hasRun, setHasRun] = useState(false);
  const [expandedEmail, setExpandedEmail] = useState<Record<number, boolean>>({});
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  function getHostname(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  const toggleEmail = useCallback((idx: number) => {
    setExpandedEmail((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }, []);

  const copyEmail = useCallback(async (idx: number, subject: string, body: string) => {
    const text = `Subject: ${subject}\n\n${body}`;
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }, []);

  const runClassification = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResults([]);
    setHasRun(true);
    setExpandedEmail({});
    try {
      const res = await fetch(`/api/utilities/company-enrichment/classify-batch?limit=${limit}`, {
        method: 'POST',
      });
      const json = (await res.json()) as {
        total?: number;
        results?: ClassifiedCompany[];
        error?: string;
      };
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setResults(Array.isArray(json.results) ? json.results : []);
      setTotal(json.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [limit]);

  const categoryBadge = (cat: string, confidence: number) => {
    const styles: Record<string, { bg: string; color: string; border: string }> = {
      DSP: { bg: '#DCFCE7', color: '#166534', border: '#86EFAC' },
      buyer: { bg: '#DBEAFE', color: '#1E40AF', border: '#93C5FD' },
      '3rd_party': { bg: '#F3F4F6', color: '#6B7280', border: '#E5E7EB' },
      error: { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
    };
    const s = styles[cat] ?? styles.error;
    const label = cat === '3rd_party' ? '3rd Party' : cat === 'error' ? 'Error' : cat;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 800,
            background: s.bg,
            color: s.color,
            border: `1px solid ${s.border}`,
            letterSpacing: 0.3,
          }}
        >
          {label}
        </span>
        {cat !== 'error' && (
          <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 700 }}>
            {Math.round(confidence * 100)}%
          </span>
        )}
      </div>
    );
  };

  // Summary counts
  const dspCount = results.filter((r) => r.category === 'DSP').length;
  const buyerCount = results.filter((r) => r.category === 'buyer').length;
  const thirdPartyCount = results.filter((r) => r.category === '3rd_party').length;
  const errorCount = results.filter((r) => r.category === 'error').length;
  const emailCount = results.filter((r) => r.email_subject).length;

  return (
    <div className="min-h-screen" style={{ background: '#0F1117' }}>
      <Navbar />
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 32px 64px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: '#F9FAFB',
                margin: 0,
                letterSpacing: -0.3,
              }}
            >
              🇫🇷 France — Classify & Outreach Dry Run
            </h1>
            <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4, lineHeight: 1.5 }}>
              Classify verified French companies (<code style={{ background: '#1F2937', padding: '1px 6px', borderRadius: 4, fontSize: 12, color: '#93C5FD' }}>dock_verified = true</code>) and generate personalised outreach emails.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9CA3AF', fontSize: 12, fontWeight: 700 }}>
              Limit
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                disabled={loading}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  border: '1px solid #374151',
                  background: '#1F2937',
                  color: '#E5E7EB',
                  cursor: 'pointer',
                }}
              >
                {[10, 20, 50, 100, 200].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <button
              onClick={runClassification}
              disabled={loading}
              style={{
                padding: '8px 20px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 800,
                cursor: loading ? 'wait' : 'pointer',
                border: 'none',
                background: loading
                  ? 'linear-gradient(135deg, #374151 0%, #1F2937 100%)'
                  : 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
                color: '#fff',
                boxShadow: loading ? 'none' : '0 2px 12px rgba(99, 102, 241, 0.35)',
                transition: 'all 0.2s ease',
              }}
            >
              {loading ? '⏳ Classifying…' : '▶ Run Classification'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 16,
              color: '#FCA5A5',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Summary badges */}
        {results.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginBottom: 20,
              flexWrap: 'wrap',
            }}
          >
            {[
              { label: 'Total', count: total, bg: '#1F2937', color: '#E5E7EB', border: '#374151' },
              { label: 'DSP', count: dspCount, bg: 'rgba(22, 163, 74, 0.12)', color: '#4ADE80', border: 'rgba(22, 163, 74, 0.3)' },
              { label: 'Buyer', count: buyerCount, bg: 'rgba(59, 130, 246, 0.12)', color: '#60A5FA', border: 'rgba(59, 130, 246, 0.3)' },
              { label: '3rd Party', count: thirdPartyCount, bg: 'rgba(107, 114, 128, 0.12)', color: '#9CA3AF', border: 'rgba(107, 114, 128, 0.3)' },
              { label: '✉ Emails', count: emailCount, bg: 'rgba(168, 85, 247, 0.12)', color: '#C084FC', border: 'rgba(168, 85, 247, 0.3)' },
              ...(errorCount > 0
                ? [{ label: 'Errors', count: errorCount, bg: 'rgba(239, 68, 68, 0.12)', color: '#FCA5A5', border: 'rgba(239, 68, 68, 0.3)' }]
                : []),
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  background: s.bg,
                  border: `1px solid ${s.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280' }}>{s.label}</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: s.color }}>{s.count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        <div
          style={{
            background: '#1A1D27',
            border: '1px solid #2D3142',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          }}
        >
          {!hasRun ? (
            <div
              style={{
                padding: '60px 20px',
                textAlign: 'center',
                color: '#6B7280',
                fontSize: 14,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔬</div>
              <div style={{ fontWeight: 700 }}>Click &quot;Run Classification&quot; to start the dry run</div>
              <div style={{ fontSize: 12, marginTop: 6, color: '#4B5563' }}>
                This will fetch French companies with dock_verified = true, classify each one, and generate outreach emails
              </div>
            </div>
          ) : loading ? (
            <div
              style={{
                padding: '60px 20px',
                textAlign: 'center',
                color: '#9CA3AF',
                fontSize: 14,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 12, animation: 'spin 1.5s linear infinite' }}>⚙️</div>
              <div style={{ fontWeight: 700 }}>Classifying companies & generating emails…</div>
              <div style={{ fontSize: 12, marginTop: 6, color: '#6B7280' }}>
                Each company gets 2 LLM calls (classify + email). This may take a few minutes.
              </div>
            </div>
          ) : results.length === 0 ? (
            <div
              style={{
                padding: '60px 20px',
                textAlign: 'center',
                color: '#6B7280',
                fontSize: 14,
              }}
            >
              <div style={{ fontWeight: 700 }}>No verified French companies found</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#141620', borderBottom: '1px solid #2D3142' }}>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Company Name</th>
                    <th style={thStyle}>Category</th>
                    <th style={thStyle}>Role</th>
                    <th style={thStyle}>Website</th>
                    <th style={thStyle}>LinkedIn</th>
                    <th style={thStyle}>Evidence</th>
                    <th style={{ ...thStyle, minWidth: 200 }}>Reason</th>
                    <th style={thStyle}>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => {
                    const rowBg = i % 2 === 0 ? '#1A1D27' : '#1E2130';
                    const isExpanded = expandedEmail[i] ?? false;
                    const hasEmail = !!(r.email_subject && r.email_body);

                    return (
                      <React.Fragment key={`${r.display_name}-${i}`}>
                        <tr style={{ background: rowBg, borderBottom: isExpanded ? 'none' : '1px solid #2D314222' }}>
                          <td style={tdStyle}>
                            <span style={{ color: '#4B5563', fontWeight: 800 }}>{i + 1}</span>
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 800, color: '#F3F4F6', maxWidth: 200 }}>
                            {r.display_name}
                          </td>
                          <td style={tdStyle}>{categoryBadge(r.category, r.confidence)}</td>
                          <td style={tdStyle}>
                            <span style={{ color: '#D1D5DB', fontWeight: 700 }}>
                              {r.role ?? '—'}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            {r.website ? (
                              <a
                                href={r.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  color: '#818CF8',
                                  textDecoration: 'none',
                                  fontWeight: 700,
                                  borderBottom: '1px solid rgba(129, 140, 248, 0.3)',
                                }}
                              >
                                {getHostname(r.website)} ↗
                              </a>
                            ) : (
                              <span style={{ color: '#4B5563' }}>—</span>
                            )}
                          </td>
                          <td style={tdStyle}>
                            {r.linkedin ? (
                              <a
                                href={r.linkedin}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  color: '#60A5FA',
                                  textDecoration: 'none',
                                  fontWeight: 700,
                                  borderBottom: '1px solid rgba(96, 165, 250, 0.3)',
                                }}
                              >
                                LinkedIn ↗
                              </a>
                            ) : (
                              <span style={{ color: '#4B5563' }}>—</span>
                            )}
                          </td>
                          <td style={tdStyle}>
                            {r.evidence_url ? (
                              <a
                                href={r.evidence_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  color: '#34D399',
                                  textDecoration: 'none',
                                  fontWeight: 700,
                                  borderBottom: '1px solid rgba(52, 211, 153, 0.3)',
                                }}
                              >
                                Evidence ↗
                              </a>
                            ) : (
                              <span style={{ color: '#4B5563' }}>—</span>
                            )}
                          </td>
                          <td style={{ ...tdStyle, whiteSpace: 'normal', minWidth: 200, color: '#9CA3AF', fontWeight: 600, lineHeight: 1.4 }}>
                            {r.error ? (
                              <span style={{ color: '#FCA5A5' }}>⚠ {r.error}</span>
                            ) : (
                              r.reason
                            )}
                          </td>
                          <td style={tdStyle}>
                            {hasEmail ? (
                              <button
                                onClick={() => toggleEmail(i)}
                                style={{
                                  padding: '4px 12px',
                                  borderRadius: 8,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  border: isExpanded ? '1px solid #A78BFA' : '1px solid #374151',
                                  background: isExpanded
                                    ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(99, 102, 241, 0.08) 100%)'
                                    : '#1F2937',
                                  color: isExpanded ? '#C084FC' : '#9CA3AF',
                                  whiteSpace: 'nowrap',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                {isExpanded ? '▾ Hide' : '✉ View'}
                              </button>
                            ) : (
                              <span style={{ color: '#4B5563', fontSize: 11 }}>—</span>
                            )}
                          </td>
                        </tr>

                        {/* Expanded email row */}
                        {isExpanded && hasEmail && (
                          <tr style={{ background: rowBg }}>
                            <td colSpan={9} style={{ padding: 0 }}>
                              <div
                                style={{
                                  margin: '0 14px 14px',
                                  background: '#141620',
                                  border: '1px solid #2D3142',
                                  borderRadius: 12,
                                  overflow: 'hidden',
                                }}
                              >
                                {/* Email header */}
                                <div
                                  style={{
                                    padding: '12px 18px',
                                    borderBottom: '1px solid #2D3142',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.06) 0%, rgba(99, 102, 241, 0.03) 100%)',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 16 }}>✉</span>
                                    <div>
                                      <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        Subject
                                      </div>
                                      <div style={{ fontSize: 13, color: '#E5E7EB', fontWeight: 800, marginTop: 1 }}>
                                        {r.email_subject}
                                      </div>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => copyEmail(i, r.email_subject!, r.email_body!)}
                                    style={{
                                      padding: '5px 14px',
                                      borderRadius: 8,
                                      fontSize: 11,
                                      fontWeight: 800,
                                      cursor: 'pointer',
                                      border: copiedIdx === i ? '1px solid #4ADE80' : '1px solid #374151',
                                      background: copiedIdx === i ? 'rgba(74, 222, 128, 0.1)' : '#1F2937',
                                      color: copiedIdx === i ? '#4ADE80' : '#D1D5DB',
                                      transition: 'all 0.2s ease',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {copiedIdx === i ? '✓ Copied!' : '📋 Copy'}
                                  </button>
                                </div>

                                {/* Email body */}
                                <div
                                  style={{
                                    padding: '16px 18px',
                                    fontSize: 13,
                                    color: '#D1D5DB',
                                    lineHeight: 1.7,
                                    fontWeight: 500,
                                    whiteSpace: 'pre-line',
                                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                  }}
                                >
                                  {r.email_body}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 14px',
  color: '#6B7280',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
