"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { Navbar } from '@/components/shared/Navbar';
import { toast } from 'sonner';

type ApiCompany = {
  rank: number;
  verifications: VerificationEntry[];
  normalized_name: string;
  display_name: string;
  website: string | null;
  linkedin: string | null;
  country_code: string;
  source_count: number;
  source_types: string[];
  dock_verified: boolean | null;
  dock_models: string | null;
  role: string | null;
  evidence_urls: string[];
  evidence_count: number;
  matches_priority: boolean;
  updated_at: string | null;
  // Full row payload from multi_sources_companies_import.
  row: Record<string, unknown>;
};

type VerificationEntry = {
  method: string;
  hits: number;
  url: string | null;
  relevance: string;
  at: string;
  keywords_matched: string[];
  post_date: string | null;
  note: string | null;
};

export default function CompanyEnrichmentPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedFullRows, setExpandedFullRows] = useState<Record<string, boolean>>({});

  type ClassificationResult = {
    category: 'DSP' | 'buyer' | '3rd_party';
    confidence: number;
    reason: string;
    draft_email: { subject: string; body: string } | null;
    sources_used: { website_scraped: boolean; linkedin_scraped: boolean; evidence_count: number } | null;
  };

  const [classificationByKey, setClassificationByKey] = useState<Record<string, ClassificationResult | undefined>>({});
  const [classifyLoadingByKey, setClassifyLoadingByKey] = useState<Record<string, boolean>>({});

  function getHostname(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  const countryLabels: Record<string, string> = {
    FR: 'France',
    NL: 'Netherlands',
    IT: 'Italy',
    DE: 'Germany',
    UK: 'United Kingdom',
    US: 'United States',
    AE: 'UAE',
    SA: 'Saudi Arabia',
    ES: 'Spain',
    SG: 'Singapore',
    JP: 'Japan',
    KR: 'South Korea',
    BR: 'Brazil',
    AU: 'Australia',
  };

  const toggleFullRow = useCallback((key: string) => {
    setExpandedFullRows(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const classifyCompany = useCallback(async (rowKey: string, c: ApiCompany) => {
    setClassifyLoadingByKey((prev) => ({ ...prev, [rowKey]: true }));
    try {
      const res = await fetch('/api/utilities/company-enrichment/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: {
            display_name: c.display_name,
            website: c.website,
            linkedin: c.linkedin,
            role: c.role,
            dock_models: c.dock_models,
            country_code: c.country_code,
            verifications: c.verifications,
          },
        }),
      });

      const json = (await res.json()) as {
        category?: 'DSP' | 'buyer' | '3rd_party';
        confidence?: number;
        reason?: string;
        draft_email?: { subject: string; body: string } | null;
        sources_used?: { website_scraped: boolean; linkedin_scraped: boolean; evidence_count: number } | null;
        error?: string;
      };
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      if (!json.category) throw new Error('Missing category in response');

      setClassificationByKey((prev) => ({
        ...prev,
        [rowKey]: {
          category: json.category!,
          confidence: typeof json.confidence === 'number' ? json.confidence : 0.3,
          reason: json.reason ?? 'No reason provided',
          draft_email: json.draft_email ?? null,
          sources_used: json.sources_used ?? null,
        },
      }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setClassifyLoadingByKey((prev) => ({ ...prev, [rowKey]: false }));
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/utilities/company-enrichment?limit=5');
      const json = (await res.json()) as { total?: number; companies?: ApiCompany[]; error?: string };
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setCompanies(Array.isArray(json.companies) ? json.companies : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: '#F3F4F6' }}>
      <Navbar />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px 64px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--dr-text)', margin: 0 }}>Company Enrichment</h1>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
              Preview the next 5 companies from <code>multi_sources_companies_import</code>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                border: '1px solid #D1D5DB',
                background: '#fff',
                color: '#374151',
                opacity: refreshing ? 0.6 : 1,
              }}
            >
              {refreshing ? 'Refreshing…' : '↺ Refresh'}
            </button>
            <button
              disabled
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'not-allowed',
                border: '1px solid #D1D5DB',
                background: '#F9FAFB',
                color: '#6B7280',
                opacity: 0.9,
              }}
              title="Not implemented yet"
            >
              Process next 5 (coming soon)
            </button>
          </div>
        </div>

        {error && (
          <div
            style={{
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 16,
              color: '#991B1B',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ background: '#fff', border: '1px solid var(--dr-border)', borderRadius: 12, padding: 18 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 14 }}>Loading next companies…</div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#111827' }}>Next 5 companies</div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>
                  {companies.length} company{companies.length === 1 ? '' : 'ies'}
                </div>
              </div>

              {companies.length === 0 ? (
                <div
                  style={{
                    border: '2px dashed #D1D5DB',
                    borderRadius: 10,
                    padding: '26px 14px',
                    textAlign: 'center',
                    color: '#9CA3AF',
                    fontSize: 13,
                  }}
                >
                  No companies available to preview.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                  {companies.map((c) => {
                    const rowKey = `${c.normalized_name}_${c.country_code}`;
                    const showFull = Boolean(expandedFullRows[rowKey]);
                    const countryLabel =
                      (c.country_code && countryLabels[c.country_code.toUpperCase()]) ? countryLabels[c.country_code.toUpperCase()] : (c.country_code ?? '');
                    const accentColor =
                      c.dock_verified === true
                        ? '#16A34A'
                        : c.dock_verified === false
                          ? '#DC2626'
                          : '#F59E0B';

                    return (
                      <section
                        key={rowKey}
                        style={{
                          background: '#fff',
                          border: '1px solid var(--dr-border)',
                          borderRadius: 12,
                          padding: 16,
                          boxShadow: '0 1px 6px rgba(17, 24, 39, 0.04)',
                          borderTop: `6px solid ${accentColor}`,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 900, color: '#6B7280', marginBottom: 2, letterSpacing: 0.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {countryLabel || '—'}
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 900, color: '#111827', lineHeight: 1.2, wordBreak: 'break-word' }}>
                              {c.display_name}
                            </div>
                          </div>

                          <button
                            onClick={() => toggleFullRow(rowKey)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 900,
                              cursor: 'pointer',
                              border: showFull ? `1px solid ${accentColor}` : '1px solid #D1D5DB',
                              background: showFull ? `linear-gradient(180deg, ${accentColor}22, #fff)` : '#fff',
                              color: showFull ? accentColor : '#374151',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {showFull ? 'Hide details' : 'Show details'}
                          </button>
                        </div>

                        {showFull && (
                          <>
                            <div style={{ marginTop: 12, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                              <div style={{ flex: '1 1 100%', marginBottom: 6 }}>
                                {(() => {
                                  const cls = classificationByKey[rowKey];
                                  const clsLoading = classifyLoadingByKey[rowKey] ?? false;
                                  const badge =
                                    cls?.category === 'DSP' ? (
                                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 900, background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC' }}>
                                        DSP
                                      </span>
                                    ) : cls?.category === 'buyer' ? (
                                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 900, background: '#DBEAFE', color: '#1E40AF', border: '1px solid #93C5FD' }}>
                                        buyer
                                      </span>
                                    ) : cls ? (
                                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 900, background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' }}>
                                        3rd party
                                      </span>
                                    ) : null;

                                  return (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                        <div style={{ fontSize: 12, fontWeight: 900, color: '#111827' }}>Enrichment</div>
                                        {badge ?? (
                                          <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 900, background: '#F9FAFB', color: '#6B7280', border: '1px dashed #D1D5DB' }}>
                                            Not classified
                                          </span>
                                        )}
                                        {cls ? (
                                          <span style={{ fontSize: 11, fontWeight: 800, color: '#6B7280' }}>
                                            {Math.round((cls.confidence ?? 0) * 100)}% confidence
                                          </span>
                                        ) : null}
                                      </div>
                                      <button
                                        onClick={() => classifyCompany(rowKey, c)}
                                        disabled={clsLoading}
                                        style={{
                                          padding: '6px 12px',
                                          borderRadius: 8,
                                          fontSize: 12,
                                          fontWeight: 900,
                                          cursor: clsLoading ? 'wait' : 'pointer',
                                          border: clsLoading ? '1px solid #D1D5DB' : `1px solid ${accentColor}`,
                                          background: clsLoading ? '#F9FAFB' : `linear-gradient(180deg, ${accentColor}22, #fff)`,
                                          color: clsLoading ? '#6B7280' : accentColor,
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {clsLoading ? 'Enriching…' : 'Enrich (classify)'}
                                      </button>
                                    </div>
                                  );
                                })()}
                                {classificationByKey[rowKey]?.reason ? (
                                  <div style={{ marginTop: 8, fontSize: 12, color: '#374151', fontWeight: 700, lineHeight: 1.5 }}>
                                    Reason: {classificationByKey[rowKey]!.reason}
                                  </div>
                                ) : null}
                                {classificationByKey[rowKey]?.sources_used ? (
                                  <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {(() => {
                                      const s = classificationByKey[rowKey]!.sources_used!;
                                      return (
                                        <>
                                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: s.website_scraped ? '#DCFCE7' : '#F3F4F6', color: s.website_scraped ? '#166534' : '#9CA3AF', border: '1px solid rgba(0,0,0,0.06)', fontWeight: 800 }}>
                                            Website {s.website_scraped ? '✓' : '✗'}
                                          </span>
                                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: s.linkedin_scraped ? '#DCFCE7' : '#F3F4F6', color: s.linkedin_scraped ? '#166534' : '#9CA3AF', border: '1px solid rgba(0,0,0,0.06)', fontWeight: 800 }}>
                                            LinkedIn {s.linkedin_scraped ? '✓' : '✗'}
                                          </span>
                                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', fontWeight: 800 }}>
                                            {s.evidence_count} evidence entries
                                          </span>
                                        </>
                                      );
                                    })()}
                                  </div>
                                ) : null}
                                {classificationByKey[rowKey]?.draft_email ? (
                                  <div style={{ marginTop: 12, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12 }}>
                                    <div style={{ fontSize: 11, fontWeight: 900, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                      Draft Outreach Email
                                    </div>
                                    <div style={{ fontSize: 12, fontWeight: 900, color: '#111827', marginBottom: 6 }}>
                                      Subject: {classificationByKey[rowKey]!.draft_email!.subject}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                                      {classificationByKey[rowKey]!.draft_email!.body}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                              <div style={{ flex: '1 1 240px' }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', marginBottom: 4 }}>Website</div>
                                {c.website ? (
                                  <a
                                    href={c.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: accentColor, fontSize: 12, fontWeight: 900, textDecoration: 'none', borderBottom: `2px solid ${accentColor}33` }}
                                  >
                                    {getHostname(c.website)} ↗
                                  </a>
                                ) : (
                                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>—</div>
                                )}
                              </div>

                              <div style={{ flex: '1 1 240px' }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', marginBottom: 4 }}>LinkedIn</div>
                                {c.linkedin ? (
                                  <a
                                    href={c.linkedin}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: accentColor, fontSize: 12, fontWeight: 900, textDecoration: 'none', borderBottom: `2px solid ${accentColor}33` }}
                                  >
                                    LinkedIn ↗
                                  </a>
                                ) : (
                                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>—</div>
                                )}
                              </div>

                              <div style={{ flex: '1 1 220px' }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: '#6B7280', marginBottom: 4 }}>Role</div>
                                <div style={{ fontSize: 12, color: '#111827', fontWeight: 900 }}>
                                  {c.role ?? '—'}
                                </div>
                              </div>
                            </div>

                            <div style={{ marginTop: 14 }}>
                              <div style={{ fontSize: 12, fontWeight: 900, color: '#111827', marginBottom: 8 }}>
                                Evidences / verifications ({c.verifications?.length ?? 0})
                              </div>

                              {(!c.verifications || c.verifications.length === 0) ? (
                                <div style={{ fontSize: 12, color: '#9CA3AF' }}>No verification entries.</div>
                              ) : (
                                <div style={{ overflowX: 'auto' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                    <thead>
                                      <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                                        <th style={{ textAlign: 'left', padding: '6px 10px', color: '#6B7280', fontSize: 10, fontWeight: 900 }}>Method</th>
                                        <th style={{ textAlign: 'left', padding: '6px 10px', color: '#6B7280', fontSize: 10, fontWeight: 900 }}>Hits</th>
                                        <th style={{ textAlign: 'left', padding: '6px 10px', color: '#6B7280', fontSize: 10, fontWeight: 900, maxWidth: 420 }}>Evidence URL / Note</th>
                                        <th style={{ textAlign: 'left', padding: '6px 10px', color: '#6B7280', fontSize: 10, fontWeight: 900 }}>Relevance</th>
                                        <th style={{ textAlign: 'left', padding: '6px 10px', color: '#6B7280', fontSize: 10, fontWeight: 900 }}>Keywords</th>
                                        <th style={{ textAlign: 'left', padding: '6px 10px', color: '#6B7280', fontSize: 10, fontWeight: 900 }}>Date</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {c.verifications.map((v, i) => {
                                        const rowBg = i % 2 === 0 ? '#FFFFFF' : '#FAFAFF';
                                        const relevanceBg =
                                          v.relevance === 'direct'
                                            ? '#DCFCE7'
                                            : v.relevance === 'mention_only'
                                              ? '#F3F4F6'
                                              : '#FEF3C7';
                                        const relevanceColor =
                                          v.relevance === 'direct'
                                            ? '#15803D'
                                            : v.relevance === 'mention_only'
                                              ? '#6B7280'
                                              : '#92400E';

                                        return (
                                          <tr
                                            key={`${c.normalized_name}_${c.country_code}_v_${i}`}
                                            style={{ borderBottom: '1px solid #F3F4F6', background: rowBg }}
                                          >
                                            <td style={{ padding: '6px 10px', color: '#111827', fontWeight: 900 }}>
                                              <span
                                                style={{
                                                  display: 'inline-block',
                                                  padding: '2px 8px',
                                                  borderRadius: 999,
                                                  fontSize: 10,
                                                  fontWeight: 900,
                                                  background: '#EFF6FF',
                                                  color: '#1D4ED8',
                                                  border: '1px solid #BFDBFE',
                                                }}
                                              >
                                                {v.method}
                                              </span>
                                            </td>
                                            <td style={{ padding: '6px 10px', color: '#111827', fontWeight: 900 }}>{v.hits}</td>
                                            <td style={{ padding: '6px 10px', color: '#374151', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                              {v.url ? (
                                                <a
                                                  href={v.url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  style={{ color: accentColor, textDecoration: 'none', fontWeight: 900, borderBottom: `2px solid ${accentColor}33` }}
                                                >
                                                  {v.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70)}
                                                </a>
                                              ) : (
                                                <span style={{ color: '#9CA3AF' }}>{v.note ?? '—'}</span>
                                              )}
                                            </td>
                                            <td style={{ padding: '6px 10px', color: relevanceColor, fontWeight: 900 }}>
                                              <span
                                                style={{
                                                  display: 'inline-block',
                                                  padding: '2px 8px',
                                                  borderRadius: 999,
                                                  fontSize: 10,
                                                  fontWeight: 900,
                                                  background: relevanceBg,
                                                  border: '1px solid rgba(0,0,0,0.05)',
                                                }}
                                              >
                                                {v.relevance}
                                              </span>
                                            </td>
                                            <td style={{ padding: '6px 10px', color: '#374151' }}>
                                              {v.keywords_matched?.length ? v.keywords_matched.join(', ') : '—'}
                                            </td>
                                            <td style={{ padding: '6px 10px', color: '#9CA3AF', fontWeight: 900 }}>
                                              {v.at ? new Date(v.at).toLocaleDateString() : '—'}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

