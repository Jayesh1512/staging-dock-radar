"use client";
import { useState } from 'react';
import type { Person, Entity } from '@/lib/types';
import type { ContactResult, OrgResolution } from '@/app/api/contacts/route';

type Status = 'idle' | 'loading' | 'done' | 'error';
type ContactStatus = 'idle' | 'loading' | 'done' | 'error';

const TARGET_TYPES = new Set(['buyer', 'operator', 'partner', 'si']);

const WORKFLOW_STEPS = [
  { icon: '🤖', label: 'LLM Extraction', detail: 'Article body → persons (name/title/org) + entity classification (buyer, operator, OEM…)' },
  { icon: '🌐', label: 'Domain Resolution', detail: 'Per target org: Apollo Org Enrich (free) → Lemlist Company DB fallback → manual input' },
  { icon: '✉', label: 'Email + LinkedIn', detail: 'Apollo People Match (1 credit/person) → Lemlist Waterfall fallback (5 credits, charged on success only)' },
  { icon: '🔎', label: 'Contact Discovery', detail: 'Orgs with no extracted persons → Apollo People Search → 2 contacts with LinkedIn (no email credits)' },
];

export function EnrichmentTestAgent() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [persons, setPersons] = useState<Person[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [cached, setCached] = useState(false);

  const [contactStatus, setContactStatus] = useState<ContactStatus>('idle');
  const [contacts, setContacts] = useState<ContactResult[]>([]);
  const [orgResolutions, setOrgResolutions] = useState<OrgResolution[]>([]);
  const [lemlistCredits, setLemlistCredits] = useState<number | null>(null);
  const [contactError, setContactError] = useState('');
  const [manualDomain, setManualDomain] = useState('');

  const targetEntities = entities.filter(e => TARGET_TYPES.has(e.type.toLowerCase()));
  const referenceEntities = entities.filter(e => !TARGET_TYPES.has(e.type.toLowerCase()));

  // Orgs that have no auto-resolved domain after contacts run
  const unresolvableOrgs = orgResolutions.filter(r => !r.domain);

  async function runEnrichment() {
    if (!url.trim()) return;
    setStatus('loading');
    setPersons([]);
    setEntities([]);
    setErrorMsg('');
    setCached(false);
    setContactStatus('idle');
    setContacts([]);
    setOrgResolutions([]);
    setManualDomain('');

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
      if (!res.ok || data.error) { setErrorMsg(data.error ?? `HTTP ${res.status}`); setStatus('error'); return; }
      setPersons(data.persons ?? []);
      setEntities(data.entities ?? []);
      setCached(data.cached ?? false);
      setStatus('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error');
      setStatus('error');
    }
  }

  async function runContactEnrichment(domainOverride?: string) {
    setContactStatus('loading');
    setContactError('');
    setContacts([]);
    setOrgResolutions([]);

    const tOrgs = entities.filter(e => TARGET_TYPES.has(e.type.toLowerCase())).map(e => e.name);

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persons,
          targetOrgs: tOrgs,
          manualDomain: domainOverride,
        }),
      });
      const data = await res.json() as {
        contacts?: ContactResult[];
        orgResolutions?: OrgResolution[];
        lemlistCredits?: number | null;
        error?: string;
      };
      if (!res.ok || data.error) { setContactError(data.error ?? `HTTP ${res.status}`); setContactStatus('error'); return; }
      setContacts(data.contacts ?? []);
      setOrgResolutions(data.orgResolutions ?? []);
      setLemlistCredits(data.lemlistCredits ?? null);
      setContactStatus('done');
    } catch (err) {
      setContactError(err instanceof Error ? err.message : 'Network error');
      setContactStatus('error');
    }
  }

  function reset() {
    setUrl(''); setStatus('idle'); setPersons([]); setEntities([]); setErrorMsg(''); setCached(false);
    setContactStatus('idle'); setContacts([]); setOrgResolutions([]); setLemlistCredits(null); setContactError(''); setManualDomain('');
  }

  // Group contacts by organization for table rendering
  const allOrgs = [...new Set([
    ...targetEntities.map(e => e.name),
    ...contacts.map(c => c.organization),
  ])];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 11px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#374151', cursor: 'pointer', letterSpacing: 0.1 }}
      >
        ⚗ Enrichment Test
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); reset(); } }}
        >
          <div style={{ background: '#fff', borderRadius: 12, width: 700, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>⚗ Enrichment Test Agent</span>
              <button onClick={() => { setOpen(false); reset(); }} style={{ background: 'none', border: 'none', fontSize: 18, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>

              {/* ── Workflow explanation (always visible) ─────────────────── */}
              <div style={{ marginBottom: 18, padding: '12px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
                  Enrichment Approach — How this works
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {WORKFLOW_STEPS.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 13, flexShrink: 0, width: 20, textAlign: 'center' }}>{s.icon}</span>
                      <div>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1E293B' }}>{i + 1}. {s.label} </span>
                        <span style={{ fontSize: 11.5, color: '#64748B' }}>— {s.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 10.5, color: '#94A3B8', borderTop: '1px solid #E2E8F0', paddingTop: 8 }}>
                  Credits: Apollo 1/email match · Lemlist 5/email found (charged on success only) · Domain lookups free on both
                </div>
              </div>

              {/* URL input */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Article URL</label>
                <input
                  type="url" value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runEnrichment(); }}
                  placeholder="https://dronelife.com/..."
                  style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 7, outline: 'none', color: '#111827', boxSizing: 'border-box' }}
                  autoFocus
                />
              </div>

              <button
                onClick={runEnrichment}
                disabled={status === 'loading' || !url.trim()}
                style={{ width: '100%', padding: '9px 0', fontSize: 13, fontWeight: 600, borderRadius: 7, border: 'none', cursor: status === 'loading' ? 'wait' : 'pointer', background: status === 'loading' ? '#93C5FD' : '#2C7BF2', color: '#fff', marginBottom: 20, opacity: !url.trim() ? 0.5 : 1 }}
              >
                {status === 'loading' ? '⟳ Fetching & extracting...' : 'Run Enrichment'}
              </button>

              {status === 'error' && (
                <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 7, fontSize: 12.5, color: '#991B1B', marginBottom: 16 }}>✕ {errorMsg}</div>
              )}

              {status === 'done' && (
                <>
                  {cached && (
                    <div style={{ padding: '6px 12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, fontSize: 11.5, color: '#15803D', marginBottom: 14 }}>
                      ⚡ Returned from cache
                    </div>
                  )}

                  {/* ── People table — always shown, grouped by org ────────── */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                      People {contactStatus === 'done' ? `(${contacts.filter(c => c.isFromArticle).length} from article · ${contacts.filter(c => !c.isFromArticle && c.name).length} discovered)` : `Extracted (${persons.length})`}
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#F9FAFB' }}>
                          {['Name', 'Title', 'Organization', 'Email', 'LinkedIn'].map(col => (
                            <th key={col} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, fontSize: 10.5, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4, border: '1px solid #E5E7EB' }}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {contactStatus !== 'done' ? (
                          // Before contacts run: show extracted persons + blank rows for orgs with no persons
                          <>
                            {persons.map((p, i) => (
                              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#F9FAFB' }}>
                                <td style={tdStyle}><span style={{ fontWeight: 600, color: '#111827' }}>{p.name}</span></td>
                                <td style={tdStyle}>{p.role}</td>
                                <td style={tdStyle}><span style={{ color: '#6B7280' }}>{p.organization}</span></td>
                                <td style={tdStyle}>
                                  {contactStatus === 'loading'
                                    ? <Spinner />
                                    : <Dash />}
                                </td>
                                <td style={tdStyle}><Dash /></td>
                              </tr>
                            ))}
                            {/* Blank rows for target orgs with no persons */}
                            {targetEntities
                              .filter(e => !persons.some(p => p.organization === e.name))
                              .map((e, i) => (
                                <tr key={`blank-${i}`} style={{ background: '#FAFAFA' }}>
                                  <td style={{ ...tdStyle, color: '#D1D5DB', fontStyle: 'italic' }}>—</td>
                                  <td style={{ ...tdStyle, color: '#D1D5DB', fontStyle: 'italic' }}>—</td>
                                  <td style={tdStyle}><span style={{ color: '#6B7280' }}>{e.name}</span></td>
                                  <td style={tdStyle}>
                                    {contactStatus === 'loading' ? <Spinner /> : <Dash />}
                                  </td>
                                  <td style={tdStyle}><Dash /></td>
                                </tr>
                              ))}
                          </>
                        ) : (
                          // After contacts run: grouped by org
                          allOrgs.map(org => {
                            const orgContacts = contacts.filter(c => c.organization === org);
                            const resolution = orgResolutions.find(r => r.orgName === org);
                            return orgContacts.map((c, ci) => (
                              <tr key={`${org}-${ci}`} style={{ background: !c.isFromArticle ? '#FFF7ED' : ci % 2 === 0 ? '#fff' : '#F9FAFB' }}>
                                <td style={tdStyle}>
                                  {c.name
                                    ? <><span style={{ fontWeight: 600, color: c.isFromArticle ? '#111827' : '#9A3412' }}>{c.name}</span>
                                        {!c.isFromArticle && <span style={{ marginLeft: 5, fontSize: 9.5, color: '#C2410C', textTransform: 'uppercase', letterSpacing: 0.3 }}>via Apollo</span>}
                                      </>
                                    : <span style={{ color: '#D1D5DB', fontStyle: 'italic' }}>—</span>}
                                </td>
                                <td style={tdStyle}>{c.title || <Dash />}</td>
                                <td style={tdStyle}>
                                  <span style={{ color: '#6B7280' }}>{c.organization}</span>
                                  {resolution && (
                                    <span style={{ marginLeft: 5, fontSize: 9.5, color: resolution.domain ? '#7C3AED' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.2 }}>
                                      {resolution.domain ? `${resolution.domainSource}: ${resolution.domain}` : 'no domain'}
                                    </span>
                                  )}
                                </td>
                                <td style={tdStyle}>
                                  {c.email ? (
                                    <span>
                                      <span style={{ color: '#059669', fontWeight: 500 }}>{c.email}</span>
                                      <SourceBadge source={c.emailSource} />
                                    </span>
                                  ) : c.emailStatus === 'no_domain' ? (
                                    <span style={{ color: '#C2410C', fontSize: 11 }}>no domain</span>
                                  ) : c.emailStatus === 'not_found' ? (
                                    <span style={{ color: '#9CA3AF', fontSize: 11 }}>not found</span>
                                  ) : <Dash />}
                                </td>
                                <td style={tdStyle}>
                                  {c.linkedinUrl
                                    ? <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#0369A1', fontSize: 11.5, textDecoration: 'none' }}>↗ LinkedIn</a>
                                    : <Dash />}
                                </td>
                              </tr>
                            ));
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* ── Target orgs ───────────────────────────────────────── */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
                      Target Organizations ({targetEntities.length})
                      <span style={{ fontSize: 9.5, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#9CA3AF', marginLeft: 5 }}>operators, buyers, partners, SIs</span>
                    </div>
                    {targetEntities.length === 0
                      ? <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>None identified</div>
                      : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {targetEntities.map((e, i) => {
                            const colors: Record<string, { bg: string; text: string }> = {
                              buyer: { bg: '#DCFCE7', text: '#166534' }, operator: { bg: '#DBEAFE', text: '#1E40AF' },
                              partner: { bg: '#FFF7ED', text: '#C2410C' }, si: { bg: '#F3E8FF', text: '#6B21A8' },
                            };
                            const c = colors[e.type.toLowerCase()] ?? { bg: '#F3F4F6', text: '#374151' };
                            return (
                              <span key={i} style={{ fontSize: 11.5, padding: '3px 10px', borderRadius: 20, background: c.bg, color: c.text, fontWeight: 600, border: `1px solid ${c.bg}` }}>
                                {e.name}<span style={{ fontSize: 10, opacity: 0.65, marginLeft: 5, textTransform: 'uppercase', letterSpacing: 0.3 }}>{e.type}</span>
                              </span>
                            );
                          })}
                        </div>}
                  </div>

                  {/* ── Reference orgs ────────────────────────────────────── */}
                  {referenceEntities.length > 0 && (
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
                        Reference Only ({referenceEntities.length})
                        <span style={{ fontSize: 9.5, fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 5 }}>OEMs, regulators</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {referenceEntities.map((e, i) => (
                          <span key={i} style={{ fontSize: 11.5, padding: '3px 10px', borderRadius: 20, background: '#F3F4F6', color: '#9CA3AF', fontWeight: 500, border: '1px solid #E5E7EB' }}>
                            {e.name}<span style={{ fontSize: 10, opacity: 0.6, marginLeft: 5, textTransform: 'uppercase', letterSpacing: 0.3 }}>{e.type}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Find Emails button ────────────────────────────────── */}
                  {contactStatus === 'idle' && (
                    <button
                      onClick={() => runContactEnrichment()}
                      style={{ width: '100%', padding: '9px 0', fontSize: 13, fontWeight: 600, borderRadius: 7, border: '1px solid #7C3AED', background: '#F5F3FF', color: '#6D28D9', cursor: 'pointer', marginBottom: 12 }}
                    >
                      🔍 Find Emails + LinkedIn via Apollo & Lemlist
                    </button>
                  )}

                  {contactStatus === 'loading' && (
                    <div style={{ padding: '10px 14px', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 7, fontSize: 12.5, color: '#5B21B6', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #7C3AED', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                      Resolving domains → matching people via Apollo → Lemlist fallback…
                    </div>
                  )}

                  {contactStatus === 'error' && (
                    <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 7, fontSize: 12.5, color: '#991B1B', marginBottom: 12 }}>
                      ✕ {contactError}
                    </div>
                  )}

                  {/* Manual domain fallback for unresolvable orgs */}
                  {contactStatus === 'done' && unresolvableOrgs.length > 0 && (
                    <div style={{ marginBottom: 12, padding: '10px 12px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 7 }}>
                      <div style={{ fontSize: 11.5, color: '#C2410C', marginBottom: 8 }}>
                        ⚠ Domain not found for: <strong>{unresolvableOrgs.map(o => o.orgName).join(', ')}</strong> — enter domain to retry
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          type="text" value={manualDomain}
                          onChange={(e) => setManualDomain(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && manualDomain.trim()) runContactEnrichment(manualDomain.trim()); }}
                          placeholder="e.g. austintownfd.org"
                          style={{ flex: 1, padding: '6px 10px', fontSize: 13, border: '1px solid #FDBA74', borderRadius: 6, outline: 'none', color: '#111827' }}
                        />
                        <button
                          onClick={() => { if (manualDomain.trim()) runContactEnrichment(manualDomain.trim()); }}
                          disabled={!manualDomain.trim()}
                          style={{ padding: '6px 14px', fontSize: 12.5, fontWeight: 600, borderRadius: 6, border: 'none', background: manualDomain.trim() ? '#EA580C' : '#FED7AA', color: '#fff', cursor: manualDomain.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Credits */}
                  {contactStatus === 'done' && lemlistCredits !== null && (
                    <div style={{ padding: '5px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, fontSize: 11.5, color: '#92400E', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Lemlist credits remaining</span>
                      <span style={{ fontWeight: 700 }}>{lemlistCredits}</span>
                    </div>
                  )}

                  <button
                    onClick={reset}
                    style={{ marginTop: 4, width: '100%', padding: '7px 0', fontSize: 12.5, fontWeight: 500, borderRadius: 7, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#6B7280', cursor: 'pointer' }}
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

// ── Small shared components ──────────────────────────────────────────────────

const tdStyle: React.CSSProperties = { padding: '7px 8px', border: '1px solid #E5E7EB', verticalAlign: 'middle', color: '#374151' };

function Dash() { return <span style={{ color: '#D1D5DB' }}>—</span>; }
function Spinner() { return <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #7C3AED', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />; }

function SourceBadge({ source }: { source: 'apollo' | 'lemlist' | null }) {
  if (!source) return null;
  return (
    <span style={{
      marginLeft: 6, fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
      background: source === 'apollo' ? '#EFF6FF' : '#F5F3FF',
      color: source === 'apollo' ? '#1D4ED8' : '#6D28D9',
      textTransform: 'uppercase', letterSpacing: 0.3, verticalAlign: 'middle',
    }}>
      {source}
    </span>
  );
}
