'use client';

import React, { useState } from 'react';
import { PipelineCard, type PipelineCardData } from './PipelineCard';

export interface StageConfig {
  id: string;
  label: string;
  color: string;
  bgColor: string;
  aiSdr?: boolean;
  terminal?: boolean;
}

interface KanbanColumnProps {
  stage: StageConfig;
  cards: PipelineCardData[];
  allStages: StageConfig[];
  hasActiveFilter?: boolean;
  onStageChange: (cardId: string, newStageId: string) => void;
  onDealNameChange: (cardId: string, newName: string) => void;
  onCrmReady: (cardId: string) => void;
}

export function KanbanColumn({ stage, cards, allStages, hasActiveFilter, onStageChange, onDealNameChange, onCrmReady }: KanbanColumnProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // For terminal columns: confirm before accepting drop
  const [pendingDropId, setPendingDropId] = useState<string | null>(null);
  // For CRM column: confirm before accepting drop
  const [pendingCrmDropId, setPendingCrmDropId] = useState<string | null>(null);

  const computeDays = (c: PipelineCardData) =>
    c.createdAt
      ? Math.max(0, Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 86_400_000))
      : c.daysAgo;
  const avgDays = cards.length > 0
    ? (cards.reduce((sum, c) => sum + computeDays(c), 0) / cards.length).toFixed(1)
    : '—';

  // ─── Drop handlers ──────────────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const cardId = e.dataTransfer.getData('application/pipeline-card-id');
    if (!cardId) return;

    // Don't allow drop on same column
    const card = cards.find(c => c.id === cardId);
    if (card) return; // already in this column

    if (stage.terminal) {
      // Archive: require confirmation
      setPendingDropId(cardId);
      return;
    }
    if (stage.id === 'sent_to_crm') {
      // CRM: require confirmation
      setPendingCrmDropId(cardId);
      return;
    }
    onStageChange(cardId, stage.id);
  };

  const handleConfirmArchiveDrop = () => {
    if (pendingDropId) onStageChange(pendingDropId, stage.id);
    setPendingDropId(null);
  };

  const handleConfirmCrmDrop = () => {
    if (pendingCrmDropId) {
      onStageChange(pendingCrmDropId, stage.id);
      onCrmReady(pendingCrmDropId);
    }
    setPendingCrmDropId(null);
  };

  // ─── Collapsed state ───────────────────────────────────────────────────

  if (collapsed) {
    return (
      <div
        style={{
          minWidth: 44, width: 44, background: stage.bgColor,
          borderRadius: 10, padding: '12px 6px', flexShrink: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          border: '1px solid #E5E7EB', cursor: 'pointer',
        }}
        onClick={() => setCollapsed(false)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(e) => { setCollapsed(false); handleDrop(e); }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
        <span style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', fontSize: 12, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>
          {stage.label}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', background: '#E5E7EB', borderRadius: 10, padding: '1px 6px' }}>
          {cards.length}
        </span>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        minWidth: 260, width: 260, background: dragOver ? '#EEF2FF' : stage.bgColor,
        borderRadius: 10, padding: 10, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        border: dragOver ? '2px dashed #6366F1' : '1px solid #E5E7EB',
        transition: 'background 0.15s, border 0.15s',
      }}
    >
      {/* Column Header */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#374151', flex: 1 }}>
            {stage.label}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', background: '#E5E7EB', borderRadius: 10, padding: '1px 8px' }}>
            {cards.length}
          </span>
          <span
            style={{ fontSize: 12, color: '#9CA3AF', cursor: 'pointer', padding: '0 4px', userSelect: 'none' }}
            onClick={() => setCollapsed(true)}
            title="Collapse column"
          >
            ‹
          </span>
        </div>
        {stage.aiSdr && (
          <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#FEF3C7', color: '#92400E', marginBottom: 6 }}>
            ⚡ AI SDR
          </span>
        )}
        <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.6 }}>
          {hasActiveFilter
            ? `Showing: ${cards.length} ${cards.length === 1 ? 'lead' : 'leads'}`
            : `Added: ${cards.length} ${cards.length === 1 ? 'lead' : 'leads'}`
          }
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.6 }}>
          Avg: {avgDays} days in stage
        </div>
        <div style={{ borderBottom: '1px solid #E5E7EB', marginTop: 8 }} />
      </div>

      {/* Drop-to-archive confirmation */}
      {pendingDropId && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6,
          padding: '8px 10px', marginBottom: 8, fontSize: 12, color: '#991B1B',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Archive this deal?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleConfirmArchiveDrop} style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 5, border: 'none', background: '#EF4444', color: '#fff', cursor: 'pointer' }}>
              Yes, archive
            </button>
            <button onClick={() => setPendingDropId(null)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: '1px solid #D1D5DB', background: '#fff', color: '#6B7280', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Drop-to-CRM confirmation */}
      {pendingCrmDropId && (
        <div style={{
          background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 6,
          padding: '8px 10px', marginBottom: 8, fontSize: 12, color: '#15803D',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Ready to hand off?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleConfirmCrmDrop} style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 5, border: 'none', background: '#16A34A', color: '#fff', cursor: 'pointer' }}>
              Confirm → CRM
            </button>
            <button onClick={() => setPendingCrmDropId(null)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: '1px solid #D1D5DB', background: '#fff', color: '#6B7280', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Card List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {cards.length > 0 ? (
          cards.map((card) => (
            <PipelineCard
              key={card.id}
              card={card}
              stages={allStages}
              onStageChange={onStageChange}
              onDealNameChange={onDealNameChange}
              onCrmReady={onCrmReady}
            />
          ))
        ) : hasActiveFilter ? (
          <div style={{ border: '2px dashed #D1D5DB', borderRadius: 8, padding: '20px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>No results for this filter</div>
          </div>
        ) : stage.terminal ? (
          <div style={{ border: '2px dashed #D1D5DB', borderRadius: 8, padding: '20px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#9CA3AF', marginBottom: 6 }}>No lost deals</div>
            <div style={{ fontSize: 11, fontStyle: 'italic', color: '#C7CED6', lineHeight: 1.5 }}>
              Leads moved here are excluded from active pipeline metrics
            </div>
          </div>
        ) : (
          <div style={{ border: '2px dashed #D1D5DB', borderRadius: 8, padding: '20px 14px', textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: '#9CA3AF', cursor: 'pointer' }}>+ Add from Hit List</span>
          </div>
        )}
      </div>
    </div>
  );
}
