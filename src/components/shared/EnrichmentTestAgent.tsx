"use client";
import { useState } from 'react';
import type { Person, Entity } from '@/lib/types';
import type { LemlistEnrichResult, LemlistContact } from '@/lib/lemlist';

type Status = 'idle' | 'loading' | 'done' | 'error';
type ContactStatus = 'idle' | 'loading' | 'done' | 'error';

export function EnrichmentTestAgent() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [persons, setPersons] = useState<Person[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [cached, setCached] = useState(false);

  // Lemlist contact enrichment state
  const [companyDomain, setCompanyDomain] = useState('');
  const [contactStatus, setContactStatus] = useState<ContactStatus>('idle');
  const [enrichedContacts, setEnrichedContacts] = useState<LemlistEnrichResult[]>([]);
  const [additionalContacts, setAdditionalContacts] = useState<LemlistContact[]>([]);
  const [remainingCredits, setRemainingCredits] = useState<number | null>(null);
  const [contactError, setContactError] = useState('');

  async function runEnrichment() {
    if (!url.trim()) return;
    setStatus('loading');
    setPersons([]);
    setEntities([]);
    setErrorMsg('');
    setCached(false);
    setContactStatus('idle');
    setEnrichedContacts([]);
    setAdditionalContacts([]);
    setCompanyDomain('');

    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleId: `test-${Date.now()}`,
          url: url.trim(),
          article: { id: `test-${Date.now()}`, title: '', source: 'google_news', url: url.trim() },
        }),
      });
      const data = await res.json() as { persons?: Person[]; entities?: Entity[]; error?: string; cached?: boolean };
      if (!res.ok || data.error) {
        setErrorMsg(data.error ?? `HTTP ${res.status}`);
        setStatus('error');
        return;
      }
      setPersons(data.persons ?? []);
      setEntities(data.entities ?? []);
      setCached(data.cached ?? false);
      setStatus('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error');
      setStatus('error');
    }
  }

  async function runContactEnrichment() {
    if (persons.length === 0) return;
    setContactStatus('loading');
    setContactError('');

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persons, companyDomain: companyDomain.trim() || undefined }),
      });
      const data = await res.json() as {
        enriched?: LemlistEnrichResult[];
        additional?: LemlistContact[];
        credits?: number | null;
        error?: string;
      };
      if (!res.ok || data.error) {
        setContactError(data.error ?? `HTTP ${res.status}`);
        setContactStatus('error');
        return;
      }
      setEnrichedContacts(data.enriched ?? []);
      setAdditionalContacts(data.additional ?? []);
      setRemainingCredits(data.credits ?? null);
      setContactStatus('done');
    } catch (err) {
      setContactError(err instanceof Error ? err.message : 'Network error');
      setContactStatus('error');
    }
  }

  function reset() {
    setUrl('');
    setStatus('idle');
    setPersons([]);
    setEntities([]);
    setErrorMsg('');
    setContactStatus('idle');
    setEnrichedContacts([]);
    setAdditionalContacts([]);
    setRemainingCredits(null);
    setContactError('');
  }

  return (
    <>
      {/* Nav trigger button */}
      <button
        onClick={() => setOpen(true)}
        style={{
          fontSize: 11.5, fontWeight: 600, padding: '4px 11px', borderRadius: 6,
          border: '1px solid #E5E7EB', background: '#F9FAFB',
          color: '#374151', cursor: 'pointer', letterSpacing: 0.1,
        }}
      >
        ⚗ Enrichment Test
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); reset(); } }}
        >
          <div style={{
            background: '#fff', borderRadius: 12, width: 580,
            boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          }}>
            {/* Header */}
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid #E5E7EB',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>
                ⚗ Enrichment Test Agent
              </span>
              <button
                onClick={() => { setOpen(false); reset(); }}
                style={{ background: 'none', border: 'none', fontSize: 18, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
              {/* URL input */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Article URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runEnrichment(); }}
                  placeholder="https://dronelife.com/..."
                  style={{
                    width: '100%', padding: '8px 12px', fontSize: 13,
                    border: '1px solid #D1D5DB', borderRadius: 7,
                    outline: 'none', color: '#111827',
                    boxSizing: 'border-box',
                  }}
                  autoFocus
                />
              </div>

              <button
                onClick={runEnrichment}
                disabled={status === 'loading' || !url.trim()}
                style={{
                  width: '100%', padding: '9px 0', fontSize: 13, fontWeight: 600,
                  borderRadius: 7, border: 'none', cursor: status === 'loading' ? 'wait' : 'pointer',
                  background: status === 'loading' ? '#93C5FD' : '#2C7BF2',
                  color: '#fff', marginBottom: 20,
                  opacity: !url.trim() ? 0.5 : 1,
                }}
              >
                {status === 'loading' ? '⟳ Fetching & extracting...' : 'Run Enrichment'}
              </button>

              {/* Error */}
              {status === 'error' && (
                <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 7, fontSize: 12.5, color: '#991B1B', marginBottom: 16 }}>
                  ✕ {errorMsg}
                </div>
              )}

              {/* ── Step 1 Results: Persons + Entities ─────────────────────── */}
              {status === 'done' && (
                <>
                  {cached && (
                    <div style={{ padding: '6px 12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, fontSize: 11.5, color: '#15803D', marginBottom: 14 }}>
                      ⚡ Returned from cache (article was already enriched)
                    </div>
                  )}

                  {/* Persons */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                      People Extracted ({persons.length})
                    </div>
                    {persons.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: '#9CA3AF', fontStyle: 'italic' }}>No named individuals identified</div>
                    ) : (
                      persons.map((p, i) => (
                        <div key={i} style={{
                          padding: '8px 12px', marginBottom: 6, borderRadius: 7,
                          background: '#F0F9FF', border: '1px solid #BAE6FD',
                          fontSize: 12.5,
                        }}>
                          <span style={{ fontWeight: 600, color: '#0C4A6E' }}>{p.name}</span>
                          <span style={{ color: '#0369A1' }}> · {p.role}</span>
                          <span style={{ color: '#7DD3FC' }}>  {p.organization}</span>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Entities */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                      Entities Extracted ({entities.length})
                    </div>
                    {entities.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: '#9CA3AF', fontStyle: 'italic' }}>No entities identified</div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {entities.map((e, i) => (
                          <span key={i} style={{
                            fontSize: 11.5, padding: '3px 10px', borderRadius: 20,
                            background: '#F3F4F6', color: '#374151', fontWeight: 600,
                            border: '1px solid #E5E7EB',
                          }}>
                            {e.name}
                            <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 5, textTransform: 'uppercase' }}>{e.type}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Step 2: Lemlist Contact Enrichment ─────────────────── */}
                  {persons.length > 0 && contactStatus === 'idle' && (
                    <div style={{ marginBottom: 16, padding: '12px 14px', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 8 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                        Lemlist Email Lookup
                      </div>
                      <label style={{ fontSize: 11.5, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 5 }}>
                        Company Domain <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(required — e.g. kcpd.org)</span>
                      </label>
                      <input
                        type="text"
                        value={companyDomain}
                        onChange={(e) => setCompanyDomain(e.target.value)}
                        placeholder="kcpd.org"
                        style={{
                          width: '100%', padding: '7px 10px', fontSize: 13,
                          border: '1px solid #C4B5FD', borderRadius: 6,
                          outline: 'none', color: '#111827', marginBottom: 10,
                          boxSizing: 'border-box', background: '#fff',
                        }}
                      />
                      <button
                        onClick={runContactEnrichment}
                        disabled={!companyDomain.trim()}
                        style={{
                          width: '100%', padding: '8px 0', fontSize: 13, fontWeight: 600,
                          borderRadius: 7, border: 'none',
                          background: !companyDomain.trim() ? '#C4B5FD' : '#7C3AED',
                          color: '#fff', cursor: !companyDomain.trim() ? 'not-allowed' : 'pointer',
                        }}
                      >
                        🔍 Find Emails (5 credits/person)
                      </button>
                    </div>
                  )}

                  {contactStatus === 'loading' && (
                    <div style={{ padding: '10px 14px', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 7, fontSize: 12.5, color: '#5B21B6', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #7C3AED', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                      Querying Lemlist — this can take 20-30s per person…
                    </div>
                  )}

                  {contactStatus === 'error' && (
                    <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 7, fontSize: 12.5, color: '#991B1B', marginBottom: 16 }}>
                      ✕ Lemlist error: {contactError}
                    </div>
                  )}

                  {contactStatus === 'done' && (
                    <>
                      {/* Credit balance */}
                      {remainingCredits !== null && (
                        <div style={{ padding: '5px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, fontSize: 11.5, color: '#92400E', marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}>
                          <span>Lemlist credits remaining</span>
                          <span style={{ fontWeight: 700 }}>{remainingCredits}</span>
                        </div>
                      )}

                      {/* Enriched persons with emails */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                          Email Lookup Results
                        </div>
                        {enrichedContacts.map((c, i) => (
                          <div key={i} style={{
                            padding: '8px 12px', marginBottom: 6, borderRadius: 7,
                            background: c.emailStatus === 'found' ? '#F0FDF4' : '#F9FAFB',
                            border: `1px solid ${c.emailStatus === 'found' ? '#BBF7D0' : '#E5E7EB'}`,
                            fontSize: 12.5,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div>
                                <span style={{ fontWeight: 600, color: '#111827' }}>{c.name}</span>
                                <span style={{ color: '#6B7280' }}> · {c.role}</span>
                              </div>
                              {c.emailStatus === 'found' ? (
                                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#DCFCE7', color: '#15803D' }}>found</span>
                              ) : c.emailStatus === 'not_found' ? (
                                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#F3F4F6', color: '#9CA3AF' }}>not found</span>
                              ) : (
                                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#FEF2F2', color: '#EF4444' }}>error</span>
                              )}
                            </div>
                            {c.email && (
                              <div style={{ marginTop: 4, fontSize: 12, color: '#059669', fontWeight: 500 }}>
                                ✉ {c.email}
                              </div>
                            )}
                            {c.emailStatus === 'error' && c.errorDetail && (
                              <div style={{ marginTop: 4, fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                {c.errorDetail}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Additional contacts from Lemlist DB */}
                      {additionalContacts.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                            Also at this org (Lemlist DB)
                          </div>
                          {additionalContacts.map((c, i) => (
                            <div key={i} style={{
                              padding: '8px 12px', marginBottom: 6, borderRadius: 7,
                              background: '#FFF7ED', border: '1px solid #FED7AA',
                              fontSize: 12.5,
                            }}>
                              <span style={{ fontWeight: 600, color: '#9A3412' }}>{c.name}</span>
                              <span style={{ color: '#C2410C' }}> · {c.role}</span>
                              <span style={{ fontSize: 10.5, marginLeft: 8, color: '#9CA3AF' }}>via Lemlist</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {additionalContacts.length === 0 && (
                        <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginBottom: 16 }}>
                          No additional contacts found in Lemlist database for this org.
                        </div>
                      )}
                    </>
                  )}

                  <button
                    onClick={reset}
                    style={{
                      marginTop: 4, width: '100%', padding: '7px 0',
                      fontSize: 12.5, fontWeight: 500, borderRadius: 7,
                      border: '1px solid #E5E7EB', background: '#F9FAFB',
                      color: '#6B7280', cursor: 'pointer',
                    }}
                  >
                    Test another URL
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
