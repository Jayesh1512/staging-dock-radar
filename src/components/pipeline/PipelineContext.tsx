'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import type { PipelineCardData } from './PipelineCard';

// ─── Color helper (deterministic from company name) ─────────────────────────

const AVATAR_COLORS = [
  '#6366F1', '#3B82F6', '#10B981', '#F59E0B',
  '#EC4899', '#8B5CF6', '#14B8A6', '#F97316',
];

export function generateColor(name: string): string {
  const index = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

// ─── DB ↔ Card Mappers ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbLeadToCard(lead: any): PipelineCardData {
  return {
    id:              lead.id,
    dealName:        lead.deal_name,
    companyName:     lead.company_name,
    companyInitials: lead.company_name.slice(0, 2).toUpperCase(),
    companyColor:    generateColor(lead.company_name),
    score:           lead.score ?? 'MED',
    region:          lead.region ?? 'Unknown',
    signal:          lead.signal ?? 'DEPLOYMENT',
    daysAgo:         Math.max(0, Math.floor(
                       (Date.now() - new Date(lead.created_at).getTime()) / 86_400_000
                     )),
    createdAt:       lead.created_at,
    isKnownPartner:  lead.is_known_partner ?? false,
    isAiSdr:         lead.is_ai_sdr ?? false,
    source:          lead.source ?? 'LinkedIn',
    stage:           lead.stage,
  };
}

export function cardToDbPayload(card: PipelineCardData) {
  return {
    deal_name:        card.dealName,
    company_name:     card.companyName,
    score:            card.score,
    region:           card.region,
    signal:           card.signal,
    source:           card.source,
    is_known_partner: card.isKnownPartner ?? false,
  };
}

// ─── Undo Toast ─────────────────────────────────────────────────────────────

export interface UndoToast {
  cardId: string;
  name: string;
}

// ─── Context Type ───────────────────────────────────────────────────────────

interface PipelineContextType {
  cards: PipelineCardData[];
  loading: boolean;
  addCard: (card: PipelineCardData) => void;
  moveStage: (cardId: string, newStage: string) => void;
  renameDeal: (cardId: string, newName: string) => void;
  archiveCard: (cardId: string) => void;
  isInPipeline: (companyName: string) => boolean;
  undoToast: UndoToast | null;
  undoArchive: () => void;
  crmReady: (cardId: string) => void;
  refreshPipeline: () => Promise<void>;
}

const PipelineContext = createContext<PipelineContextType | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────

export function PipelineProvider({ children }: { children: ReactNode }) {
  const [cards, setCards] = useState<PipelineCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoToast, setUndoToast] = useState<UndoToast | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track temp IDs that haven't been replaced by DB UUIDs yet
  const pendingIdsRef = useRef<Set<string>>(new Set());

  // ── Initial load from DB ──────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/pipeline')
      .then(r => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCards(data.map(dbLeadToCard));
        }
      })
      .catch((err) => console.error('[PipelineContext] Failed to load leads:', err))
      .finally(() => setLoading(false));
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); };
  }, []);

  // ── addCard: POST to API, optimistic update, reactivate archived ──────────
  const addCard = useCallback((card: PipelineCardData) => {
    // Optimistic: update UI immediately
    const tempId = card.id;
    setCards(prev => {
      const lcName = card.companyName.toLowerCase();
      if (prev.some(c => c.companyName.toLowerCase() === lcName && c.stage !== 'lost_archived')) {
        return prev;
      }
      const archivedIdx = prev.findIndex(
        c => c.companyName.toLowerCase() === lcName && c.stage === 'lost_archived'
      );
      if (archivedIdx !== -1) {
        // Reactivate — no pending ID needed (existing DB UUID)
        const reactivated = { ...prev[archivedIdx], stage: 'prospect', prevStage: undefined };
        return [reactivated, ...prev.filter((_, i) => i !== archivedIdx)];
      }
      // Mark this temp ID as pending so moveStage/rename skip API calls for it
      pendingIdsRef.current.add(tempId);
      return [card, ...prev];
    });

    // Persist to DB (fire-and-forget, DB handles dedup + reactivation)
    fetch('/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cardToDbPayload(card)),
    }).then(async (res) => {
      pendingIdsRef.current.delete(tempId);
      if (res.ok) {
        // Replace the optimistic card with the DB-generated one (has real UUID)
        const lead = await res.json();
        const dbCard = dbLeadToCard(lead);
        setCards(prev => prev.map(c =>
          c.id === tempId ? dbCard : c
        ));
      } else if (res.status !== 409) {
        console.error('[PipelineContext] addCard failed:', res.status);
      }
    }).catch(err => {
      pendingIdsRef.current.delete(tempId);
      console.error('[PipelineContext] addCard error:', err);
    });
  }, []);

  // ── moveStage: optimistic update + PATCH ──────────────────────────────────
  const moveStage = useCallback((cardId: string, newStage: string) => {
    let movedCard: PipelineCardData | undefined;

    setCards(prev => prev.map(c => {
      if (c.id !== cardId) return c;
      movedCard = c;
      return { ...c, prevStage: c.stage, stage: newStage };
    }));

    // Show undo toast when archiving
    if (newStage === 'lost_archived') {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setTimeout(() => {
        setUndoToast({ cardId, name: movedCard?.dealName ?? 'Deal' });
      }, 0);
      undoTimerRef.current = setTimeout(() => setUndoToast(null), 5000);
    }

    // Persist (skip if card still has a temp ID from optimistic add)
    if (!pendingIdsRef.current.has(cardId)) {
      fetch(`/api/pipeline/${cardId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      }).catch(err => console.error('[PipelineContext] moveStage error:', err));
    }
  }, []);

  // ── undoArchive: restore from prevStage ───────────────────────────────────
  const undoArchive = useCallback(() => {
    if (!undoToast) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const { cardId } = undoToast;
    setUndoToast(null);

    let prevStage = 'prospect';
    setCards(prev => prev.map(c => {
      if (c.id !== cardId) return c;
      prevStage = c.prevStage ?? 'prospect';
      return { ...c, stage: prevStage, prevStage: undefined };
    }));

    // Persist the undo
    fetch(`/api/pipeline/${cardId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: prevStage, note: 'Undo archive' }),
    }).catch(err => console.error('[PipelineContext] undoArchive error:', err));
  }, [undoToast]);

  // ── renameDeal: optimistic update + PATCH ─────────────────────────────────
  const renameDeal = useCallback((cardId: string, newName: string) => {
    if (!newName.trim()) return;
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, dealName: newName.trim() } : c
    ));

    if (!pendingIdsRef.current.has(cardId)) {
      fetch(`/api/pipeline/${cardId}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal_name: newName.trim() }),
      }).catch(err => console.error('[PipelineContext] renameDeal error:', err));
    }
  }, []);

  const archiveCard = useCallback((cardId: string) => {
    moveStage(cardId, 'lost_archived');
  }, [moveStage]);

  const isInPipeline = useCallback((companyName: string) => {
    return cards.some(
      c => c.companyName.toLowerCase() === companyName.toLowerCase()
        && c.stage !== 'lost_archived'
    );
  }, [cards]);

  const refreshPipeline = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline');
      const data = await res.json();
      if (Array.isArray(data)) setCards(data.map(dbLeadToCard));
    } catch (err) {
      console.error('[PipelineContext] refresh failed:', err);
    }
  }, []);

  const crmReady = useCallback((_cardId: string) => {
    // TODO P5: trigger Slack webhook
  }, []);

  return (
    <PipelineContext.Provider value={{
      cards, loading, addCard, moveStage, renameDeal, archiveCard,
      isInPipeline, undoToast, undoArchive, crmReady, refreshPipeline,
    }}>
      {children}
    </PipelineContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function usePipeline() {
  const ctx = useContext(PipelineContext);
  if (!ctx) throw new Error('usePipeline must be used inside PipelineProvider');
  return ctx;
}
