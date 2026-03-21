"use client";
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { ArticleWithScore, ArticleAction, Person, Entity } from '@/lib/types';
import { ArticleDetail, type EnrichmentStatus } from './ArticleDetail';
import { SlackCompose } from './SlackCompose';
import { ArticleActions } from './ArticleActions';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { ENTITY_TYPE_COLORS } from '@/lib/constants';
import { generateSlackMessage, formatDateIST } from '@/lib/utils';

interface ArticleDrawerProps {
  article: ArticleWithScore;
  isKnownPartner?: boolean;
  actions: ArticleAction[];
  onSlack: () => void;
  onBookmark: () => void;
  onMarkReviewed: () => void;
  onDismiss: () => void;
}

export function ArticleDrawer({ article, isKnownPartner = false, actions, onSlack, onBookmark, onMarkReviewed, onDismiss }: ArticleDrawerProps) {
  // Temporary: disable auto-enrichment on drawer open.
  // Enrichment can be re-enabled later by flipping this flag.
  const AUTO_ENRICH_ON_OPEN = false;

  function norm(s: unknown) { return String(s ?? '').trim().toLowerCase(); }
  function mergePersons(base: Person[], incoming: Person[]): Person[] {
    const out: Person[] = [];
    const seen = new Set<string>();
    const add = (p: Person) => {
      const key = `${norm(p.name)}|${norm(p.organization)}|${norm((p as any).linkedin_url)}`;
      if (!norm(p.name)) return;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(p);
    };
    for (const p of base) add(p);
    for (const p of incoming) {
      const keyNoLinkedIn = `${norm(p.name)}|${norm(p.organization)}|`;
      const idx = out.findIndex((x) => `${norm(x.name)}|${norm(x.organization)}|` === keyNoLinkedIn);
      if (idx >= 0) {
        const existing = out[idx];
        const existingLinkedIn = (existing as any).linkedin_url;
        const incomingLinkedIn = (p as any).linkedin_url;
        out[idx] = {
          ...existing,
          role: existing.role || p.role,
          organization: existing.organization || p.organization,
          ...(incomingLinkedIn && !existingLinkedIn ? { linkedin_url: incomingLinkedIn } : {}),
        };
      } else add(p);
    }
    return out;
  }
  function mergeEntities(base: Entity[], incoming: Entity[]): Entity[] {
    const out: Entity[] = [];
    const seen = new Set<string>();
    const add = (e: Entity) => {
      const key = `${norm(e.name)}|${norm(e.type)}|${norm((e as any).linkedin_url)}`;
      if (!norm(e.name)) return;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(e);
    };
    for (const e of base) add(e);
    for (const e of incoming) {
      const keyNoLinkedIn = `${norm(e.name)}|${norm(e.type)}|`;
      const idx = out.findIndex((x) => `${norm(x.name)}|${norm(x.type)}|` === keyNoLinkedIn);
      if (idx >= 0) {
        const existing = out[idx];
        const existingLinkedIn = (existing as any).linkedin_url;
        const incomingLinkedIn = (e as any).linkedin_url;
        out[idx] = { ...existing, ...(incomingLinkedIn && !existingLinkedIn ? { linkedin_url: incomingLinkedIn } : {}) };
      } else add(e);
    }
    return out;
  }

  // ── URL resolution state ──────────────────────────────────────────────────
  // Pre-initialize from DB if resolved_url was already persisted
  const preResolved = (() => {
    const r = article.article.resolved_url;
    return r && !r.includes('news.google.com') ? r : null;
  })();

  const [resolvedUrl, setResolvedUrl] = useState<string | null>(preResolved);
  const [resolveStatus, setResolveStatus] = useState<'idle' | 'resolving' | 'resolved' | 'failed'>(
    preResolved ? 'resolved' : 'idle',
  );
  const [ogImage, setOgImage] = useState<string | null>(null);

  // Slack message: use the real URL immediately if already resolved, so
  // the message is correct even when Effect 1 skips (resolvedUrl pre-initialized).
  const [slackMessage, setSlackMessage] = useState(() => {
    const msg = generateSlackMessage(article.article, article.scored);
    return preResolved ? msg.replace(article.article.url, preResolved) : msg;
  });
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // ── Enrichment state ──────────────────────────────────────────────────────
  const [enrichmentStatus, setEnrichmentStatus] = useState<EnrichmentStatus>(
    () => (article.scored.enriched_at ? 'done' : 'idle'),
  );
  const [enrichedPersons, setEnrichedPersons] = useState<Person[] | undefined>(
    () => (article.scored.enriched_at ? article.scored.persons : undefined),
  );
  const [enrichedEntities, setEnrichedEntities] = useState<Entity[] | undefined>(
    () => (article.scored.enriched_at ? article.scored.entities : undefined),
  );
  const enrichmentFiredRef = useRef(false);

  const isSlacked = actions.includes('slack');
  const isBookmarked = actions.includes('bookmarked');

  // ── LinkedIn Reply state ───────────────────────────────────────────────────
  const [replyStatus, setReplyStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [replyDraft, setReplyDraft] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);

  async function handleGenerateReply() {
    setReplyStatus('loading');
    setReplyError(null);
    try {
      const res = await fetch('/api/linkedin-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: article.scored.company || null,
          summary: article.scored.summary || null,
          use_case: article.scored.use_case || null,
          signal_type: article.scored.signal_type || null,
        }),
      });
      const data = await res.json() as { reply?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Generation failed');
      setReplyDraft(data.reply ?? '');
      setReplyStatus('done');
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to generate reply');
      setReplyStatus('error');
    }
  }

  // ── Effect 1: Lazy URL resolution (Google News redirect only) ─────────────
  useEffect(() => {
    const rawUrl = article.article.url;
    if (resolvedUrl) return; // DB already has the real URL
    if (!rawUrl.includes('news.google.com')) return; // Not a Google News URL

    setResolveStatus('resolving');
    const controller = new AbortController();

    fetch(`/api/resolve?url=${encodeURIComponent(rawUrl)}&articleId=${article.article.id}`, { signal: controller.signal })
      .then(res => res.json())
      .then((data: { resolvedUrl?: string; ogImage?: string | null }) => {
        if (data.resolvedUrl && !data.resolvedUrl.includes('news.google.com')) {
          setResolveStatus('resolved');
          setResolvedUrl(data.resolvedUrl);
          if (data.ogImage) setOgImage(data.ogImage);
          setSlackMessage(prev => prev.replace(rawUrl, data.resolvedUrl!));
        } else {
          setResolveStatus('failed');
        }
      })
      .catch(() => setResolveStatus('failed'));

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Effect 2: Lazy enrichment — sequenced after URL resolution ────────────
  // Non-Google News URLs: resolveStatus stays 'idle' → fires immediately.
  // Google News with resolved_url in DB: resolvedUrl pre-initialized → fires immediately.
  // Google News without resolved_url: waits until resolveStatus is 'resolved' or 'failed'.
  useEffect(() => {
    if (!AUTO_ENRICH_ON_OPEN) return;
    if (article.scored.enriched_at) return; // Already enriched (DB cache)
    if (enrichmentFiredRef.current) return; // Already fired this drawer session

    const isGoogleNewsUnresolved =
      article.article.url.includes('news.google.com') && !resolvedUrl;

    if (isGoogleNewsUnresolved && resolveStatus !== 'resolved' && resolveStatus !== 'failed') return;

    enrichmentFiredRef.current = true;
    setEnrichmentStatus('loading');

    const urlToEnrich = resolvedUrl ?? article.article.url;

    fetch('/api/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articleId: article.article.id,
        url: urlToEnrich,
        article: article.article,
      }),
    })
      .then(res => res.json())
      .then((data: { persons?: Person[]; entities?: Entity[]; error?: string }) => {
        if (data.error) { setEnrichmentStatus('failed'); return; }
        // Append (merge) rather than overwrite what scoring already found.
        // Prevents links/entities disappearing after enrichment completes.
        setEnrichedPersons(mergePersons(article.scored.persons, data.persons ?? []));
        setEnrichedEntities(mergeEntities(article.scored.entities, data.entities ?? []));
        setEnrichmentStatus('done');
      })
      .catch(() => setEnrichmentStatus('failed'));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveStatus, resolvedUrl]);

  // ── Manual URL resolve (triggered by user button when auto-resolve fails) ──
  async function handleManualResolve() {
    const rawUrl = article.article.url;
    setResolveStatus('resolving');
    try {
      const res = await fetch(`/api/resolve?url=${encodeURIComponent(rawUrl)}&articleId=${article.article.id}`);
      const data = await res.json() as { resolvedUrl?: string; ogImage?: string | null };
      if (data.resolvedUrl && !data.resolvedUrl.includes('news.google.com')) {
        setResolveStatus('resolved');
        setResolvedUrl(data.resolvedUrl);
        if (data.ogImage) setOgImage(data.ogImage);
        setSlackMessage(prev => prev.replace(rawUrl, data.resolvedUrl!));
      } else {
        setResolveStatus('failed');
      }
    } catch {
      setResolveStatus('failed');
    }
  }

  // ── Slack send ────────────────────────────────────────────────────────────
  async function handleSlackClick() {
    if (isSending || isSlacked) return;
    setIsSending(true);
    setSendError(null);
    try {
      const res = await fetch('/api/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: slackMessage,
          unfurlLinks: article.article.source !== 'linkedin',
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to send');
      onSlack();
      toast.success('Sent to #dock-radar');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send to Slack');
    } finally {
      setIsSending(false);
    }
  }

  const displayEntities = enrichedEntities ?? article.scored.entities;
  const uniqueDisplayEntities = (() => {
    const seen = new Set<string>();
    const out: Entity[] = [];
    for (const e of displayEntities) {
      const key = `${String(e.name ?? '').trim().toLowerCase()}|${String(e.type ?? '').trim().toLowerCase()}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
    return out;
  })();

  return (
    <div
      className="drawer-slide-down"
      style={{
        borderTop: '2px solid var(--dr-blue)',
        borderLeft: '3px solid var(--dr-blue)',
        background: '#FAFCFF',
        boxShadow: '0 4px 20px rgba(44, 123, 242, 0.09)',
      }}
    >
      {/* Drawer header strip */}
      <div
        className="flex items-center gap-2"
        style={{ padding: '8px 20px', background: 'var(--dr-blue)', borderBottom: '1px solid #2370DC' }}
      >
        <span className="font-semibold" style={{ fontSize: 11.5, color: '#fff', letterSpacing: 0.2 }}>
          Article Detail
        </span>
        {isKnownPartner && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC', whiteSpace: 'nowrap' }}>
            Known Partner
          </span>
        )}
        <span style={{ fontSize: 11, color: '#BFDBFE' }}>
          ·&nbsp; {article.scored.signal_type}
          {article.scored.industry && <>&nbsp;·&nbsp;{article.scored.industry}</>}
          &nbsp;·&nbsp;Score {article.scored.relevance_score}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#93C5FD', fontStyle: 'italic' }}>
          {article.article.publisher}
        </span>
      </div>

      {/* Main body */}
      <div style={{ padding: '20px 20px 0' }}>
        <div className="grid gap-6" style={{ gridTemplateColumns: '2fr 1fr' }}>
          {/* Left column */}
          <ArticleDetail
            article={article}
            enrichmentStatus={enrichmentStatus}
            enrichedPersons={enrichedPersons}
            enrichedEntities={enrichedEntities}
          />

          {/* Right column */}
          <div>
            {article.scored.industry && (
              <>
                <SectionLabel>Industry</SectionLabel>
                <div style={{ marginBottom: 20 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: 12, fontWeight: 600,
                      padding: '4px 12px', borderRadius: 20,
                      background: '#F0F9FF', color: '#0369A1',
                      border: '1px solid #BAE6FD',
                    }}
                  >
                    {article.scored.industry}
                  </span>
                </div>
              </>
            )}
            <SectionLabel>Organizations</SectionLabel>
            <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 20 }}>
              {uniqueDisplayEntities.length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--dr-text-muted)', fontStyle: 'italic' }}>None detected</span>
              ) : (
                uniqueDisplayEntities.map((entity) => {
                  const colors = ENTITY_TYPE_COLORS[entity.type] ?? { bg: '#F3F4F6', text: '#374151' };
                  return (
                    <span
                      key={`${entity.name}-${entity.type}`}
                      className="inline-flex items-center gap-1.5 font-semibold"
                      style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 20, background: colors.bg, color: colors.text }}
                    >
                      {entity.linkedin_url ? (
                        <a
                          href={entity.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                          style={{ color: colors.text }}
                        >
                          {entity.name}
                        </a>
                      ) : (
                        entity.name
                      )}
                      <span style={{ fontSize: 9.5, opacity: 0.65, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                        {entity.type}
                      </span>
                    </span>
                  );
                })
              )}
            </div>

            <SectionLabel>Source</SectionLabel>
            <div style={{ background: '#fff', border: '1px solid var(--dr-border)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ marginBottom: 8 }}>
                <SourceBadge source={article.article.source} />
              </div>
              <div className="font-semibold" style={{ fontSize: 13, color: 'var(--dr-text)' }}>
                {article.article.publisher}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--dr-text-muted)', marginTop: 2 }}>
                Published {formatDateIST(article.article.published_at)}
              </div>
              <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
                <a
                  href={resolvedUrl ?? article.article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium"
                  style={{ fontSize: 11.5, color: 'var(--dr-blue)', textDecoration: 'none' }}
                >
                  ↗ Open original article
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(resolvedUrl ?? article.article.url)
                      .then(() => toast.success('Link copied'))
                      .catch(() => toast.error('Copy failed'));
                  }}
                  title="Copy link"
                  style={{
                    background: 'none', border: '1px solid var(--dr-border)', borderRadius: 4,
                    padding: '2px 6px', cursor: 'pointer', fontSize: 11, color: 'var(--dr-text-muted)',
                    lineHeight: 1,
                  }}
                >
                  ⎘
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Slack compose */}
      <div style={{ padding: '16px 20px 0' }}>
        {resolveStatus === 'resolving' && (
          <div style={{ marginBottom: 8, padding: '5px 10px', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 6, fontSize: 11.5, color: '#0369A1', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #0369A1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            Resolving article link for Slack preview…
          </div>
        )}
        {resolveStatus === 'resolved' && (
          <div style={{ marginBottom: 8, padding: '5px 10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, fontSize: 11.5, color: '#15803D', display: 'flex', alignItems: 'center', gap: 6 }}>
            ✓ Link resolved — Slack will show the article image
            {ogImage && (
              <img src={ogImage} alt="Article preview" style={{ marginLeft: 'auto', height: 32, borderRadius: 4, objectFit: 'cover', border: '1px solid #BBF7D0', maxWidth: 80 }} />
            )}
          </div>
        )}
        {resolveStatus === 'failed' && (
          <div style={{ marginBottom: 8, padding: '5px 10px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, fontSize: 11.5, color: '#92400E', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⚠ Could not auto-resolve link —</span>
            <button
              onClick={handleManualResolve}
              style={{ fontSize: 11.5, fontWeight: 600, color: '#92400E', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 5, padding: '2px 10px', cursor: 'pointer' }}
            >
              ↺ Resolve now
            </button>
          </div>
        )}
        <SlackCompose message={slackMessage} onChange={setSlackMessage} />
        {sendError && (
          <div style={{ marginTop: 8, padding: '7px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, fontSize: 12, color: '#991B1B' }}>
            ✕ {sendError}
          </div>
        )}
      </div>

      {/* LinkedIn Reply */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ background: '#fff', border: '1px solid var(--dr-border)', borderRadius: 8, padding: '12px 14px' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: replyStatus === 'done' ? 10 : 0 }}>
            <span className="font-semibold" style={{ fontSize: 12.5, color: 'var(--dr-text)' }}>
              LinkedIn Reply
            </span>
            <div className="flex items-center gap-2">
              {replyStatus === 'done' && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(replyDraft)
                      .then(() => toast.success('Reply copied'))
                      .catch(() => toast.error('Copy failed'));
                  }}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '5px 14px', borderRadius: 6,
                    background: '#F0FDF4', color: '#166534', border: '1px solid #86EFAC',
                    cursor: 'pointer',
                  }}
                >
                  ⎘ Copy
                </button>
              )}
              <button
                onClick={handleGenerateReply}
                disabled={replyStatus === 'loading'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 600, padding: '5px 14px', borderRadius: 6,
                  background: replyStatus === 'loading' ? '#E0E7FF' : '#EEF2FF',
                  color: '#4338CA', border: '1px solid #C7D2FE',
                  cursor: replyStatus === 'loading' ? 'default' : 'pointer',
                  opacity: replyStatus === 'loading' ? 0.7 : 1,
                }}
              >
                {replyStatus === 'loading' ? (
                  <>
                    <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #4338CA', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    Generating…
                  </>
                ) : replyStatus === 'done' ? '↺ Regenerate' : '✦ Generate Reply'}
              </button>
            </div>
          </div>

          {replyStatus === 'error' && replyError && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, fontSize: 12, color: '#991B1B' }}>
              ✕ {replyError}
            </div>
          )}

          {replyStatus === 'done' && (
            <textarea
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              rows={3}
              style={{
                width: '100%', fontSize: 13, lineHeight: 1.6, color: 'var(--dr-text)',
                border: '1px solid var(--dr-border)', borderRadius: 6, padding: '8px 10px',
                resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
                background: '#FAFAFA',
              }}
            />
          )}
        </div>
      </div>

      {/* Action bar */}
      <ArticleActions
        isSlacked={isSlacked}
        isBookmarked={isBookmarked}
        isSending={isSending}
        onSlack={handleSlackClick}
        onBookmark={onBookmark}
        onOpen={() => window.open(resolvedUrl ?? article.article.url, '_blank')}
        onMarkReviewed={onMarkReviewed}
        onDismiss={onDismiss}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
      <span
        className="uppercase"
        style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.7, whiteSpace: 'nowrap' }}
      >
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--dr-border)' }} />
    </div>
  );
}
