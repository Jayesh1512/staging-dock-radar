'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { StageConfig } from './KanbanColumn';

export interface PipelineCardData {
  id: string;
  dealName: string;
  companyName: string;
  companyInitials: string;
  companyColor: string;
  score: 'HIGH' | 'MED';
  region: string;
  signal: string;
  daysAgo: number;
  createdAt?: string; // ISO timestamp — daysAgo computed at render when available
  isKnownPartner?: boolean;
  isAiSdr?: boolean;
  source: 'LinkedIn' | 'Google News';
  stage: string;
  prevStage?: string;
}

interface PipelineCardProps {
  card: PipelineCardData;
  stages: StageConfig[];
  onStageChange: (cardId: string, newStageId: string) => void;
  onDealNameChange: (cardId: string, newName: string) => void;
  onCrmReady: (cardId: string) => void;
}

const SCORE_COLORS: Record<string, { bg: string; text: string }> = {
  HIGH: { bg: '#DCFCE7', text: '#16A34A' },
  MED:  { bg: '#FEF3C7', text: '#D97706' },
};

const SIGNAL_COLORS: Record<string, { bg: string; text: string }> = {
  PARTNERSHIP: { bg: '#FFF7ED', text: '#C2410C' },
  DEPLOYMENT:  { bg: '#DBEAFE', text: '#1E40AF' },
  PRODUCT:     { bg: '#F3E8FF', text: '#6B21A8' },
  CONTRACT:    { bg: '#FEF9C3', text: '#854D0E' },
  EXPANSION:   { bg: '#DCFCE7', text: '#15803D' },
  FUNDING:     { bg: '#CFFAFE', text: '#0E7490' },
  REGULATION:  { bg: '#FEE2E2', text: '#991B1B' },
  OTHER:       { bg: '#F3F4F6', text: '#6B7280' },
};

export function PipelineCard({ card, stages, onStageChange, onDealNameChange, onCrmReady }: PipelineCardProps) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(card.dealName);
  const [showCrmConfirm, setShowCrmConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sc = SCORE_COLORS[card.score] ?? SCORE_COLORS.MED;
  const sigC = SIGNAL_COLORS[card.signal] ?? SIGNAL_COLORS.OTHER;

  useEffect(() => { setDraftName(card.dealName); }, [card.dealName]);
  useEffect(() => { setShowCrmConfirm(false); setShowArchiveConfirm(false); }, [card.stage]);
  useEffect(() => {
    if (isEditing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [isEditing]);
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleStageSelect = (newStageId: string) => {
    setMenuOpen(false);
    if (newStageId === card.stage) return;
    if (newStageId === 'sent_to_crm') { setShowCrmConfirm(true); return; }
    if (newStageId === 'lost_archived') { setShowArchiveConfirm(true); return; }
    onStageChange(card.id, newStageId);
  };

  const handleCrmConfirm = () => { setShowCrmConfirm(false); onStageChange(card.id, 'sent_to_crm'); onCrmReady(card.id); };
  const handleArchiveConfirm = () => { setShowArchiveConfirm(false); onStageChange(card.id, 'lost_archived'); };

  const handleSaveName = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== card.dealName) { onDealNameChange(card.id, trimmed); } else { setDraftName(card.dealName); }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSaveName(); }
    if (e.key === 'Escape') { setDraftName(card.dealName); setIsEditing(false); }
  };

  // ─── Drag ─────────────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/pipeline-card-id', card.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable={!isEditing}
      onDragStart={handleDragStart}
      style={{
        background: '#fff', borderRadius: 8, padding: 12,
        boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.06)',
        border: '1px solid #E5E7EB', marginBottom: 8,
        transition: 'box-shadow 0.15s, opacity 0.15s', cursor: isEditing ? 'text' : 'grab',
        position: 'relative',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Top Row — deal name */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 10 }}>
        {isEditing ? (
          <div style={{ flex: 1 }}>
            <input
              ref={inputRef}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveName}
              style={{
                width: '100%', fontSize: 13, fontWeight: 700, color: '#1D4ED8',
                padding: '2px 6px', border: 'none', borderRadius: 4,
                outline: '2px solid #6366F1', background: '#fff',
              }}
            />
            <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 3 }}>
              Enter to save · Esc to cancel
            </div>
          </div>
        ) : (
          <div
            style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#1D4ED8', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            onDoubleClick={() => setIsEditing(true)}
          >
            {card.dealName}
          </div>
        )}
        {!isEditing && (
          <span
            style={{ opacity: hovered ? 0.5 : 0, transition: 'opacity 0.15s', fontSize: 12, color: '#9CA3AF', flexShrink: 0, cursor: 'pointer' }}
            title="Edit deal"
            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
          >
            ✏️
          </span>
        )}
      </div>

      {/* Body Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#9CA3AF', width: 44 }}>Score:</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 10, background: sc.bg, color: sc.text }}>
            {card.score}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#9CA3AF', width: 44 }}>Region:</span>
          <span style={{ fontSize: 12, color: '#374151' }}>{card.region}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#9CA3AF', width: 44 }}>Signal:</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10, background: sigC.bg, color: sigC.text }}>
            {card.signal}
          </span>
        </div>
      </div>

      {/* Conditional badges */}
      {card.isKnownPartner && (
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#DCFCE7', color: '#15803D' }}>
            Known Partner
          </span>
        </div>
      )}
      {card.isAiSdr && (
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#FEF3C7', color: '#92400E' }}>
            ⚡ AI SDR handling
          </span>
        </div>
      )}

      {/* CRM Confirmation Banner */}
      {showCrmConfirm && (
        <div style={{
          background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 6,
          padding: '8px 10px', marginBottom: 6, fontSize: 12, color: '#15803D',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Ready to hand off?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={(e) => { e.stopPropagation(); handleCrmConfirm(); }} style={sConfirmBtn}>
              Confirm → CRM
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowCrmConfirm(false); }} style={sCancelBtn}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Archive Confirmation Banner */}
      {showArchiveConfirm && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6,
          padding: '8px 10px', marginBottom: 6, fontSize: 12, color: '#991B1B',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Archive this deal?</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>
            This will exclude it from active pipeline metrics.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={(e) => { e.stopPropagation(); handleArchiveConfirm(); }}
              style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 5, border: 'none', background: '#EF4444', color: '#fff', cursor: 'pointer' }}
            >
              Yes, archive
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowArchiveConfirm(false); }} style={sCancelBtn}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ borderTop: '1px solid #F3F4F6', marginTop: 4, paddingTop: 8, display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            width: 24, height: 24, borderRadius: '50%',
            background: card.companyColor, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, flexShrink: 0,
          }}
        >
          {card.companyInitials}
        </div>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#9CA3AF' }}>
          {(() => {
            const days = card.createdAt
              ? Math.max(0, Math.floor((Date.now() - new Date(card.createdAt).getTime()) / 86_400_000))
              : card.daysAgo;
            return `${days} ${days === 1 ? 'day' : 'days'} ago`;
          })()}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          <span style={{ fontSize: 14, color: '#9CA3AF', cursor: 'pointer' }} title="Mark complete">✓</span>
          <span style={{ fontSize: 14, color: '#9CA3AF', cursor: 'pointer' }} title="View details">📄</span>
          {/* Move stage trigger */}
          <div style={{ position: 'relative' }} ref={menuRef}>
            <span
              style={{
                fontSize: 11, color: '#9CA3AF', cursor: 'pointer', padding: '0 2px',
                opacity: hovered || menuOpen ? 0.8 : 0, transition: 'opacity 0.15s',
              }}
              title="Move stage"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            >
              ···
            </span>
            {menuOpen && (
              <div style={{
                position: 'absolute', bottom: '100%', right: 0, marginBottom: 4,
                background: '#fff', border: '1px solid #E5E7EB', borderRadius: 6,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50,
                minWidth: 180, overflow: 'hidden',
              }}>
                <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: 0.5, borderBottom: '1px solid #F3F4F6' }}>
                  MOVE TO STAGE
                </div>
                {stages.map(s => {
                  const isCurrent = s.id === card.stage;
                  return (
                    <div
                      key={s.id}
                      onClick={(e) => { e.stopPropagation(); handleStageSelect(s.id); }}
                      style={{
                        padding: '6px 12px', fontSize: 12, cursor: isCurrent ? 'default' : 'pointer',
                        color: isCurrent ? s.color : '#374151',
                        fontWeight: isCurrent ? 700 : 400,
                        background: 'transparent',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                      onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = '#F3F4F6'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                      {s.label}
                      {isCurrent && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9CA3AF' }}>current</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared button styles ───────────────────────────────────────────────────

const sConfirmBtn: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 5,
  border: 'none', background: '#16A34A', color: '#fff', cursor: 'pointer',
};

const sCancelBtn: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5,
  border: '1px solid #D1D5DB', background: '#fff', color: '#6B7280', cursor: 'pointer',
};
