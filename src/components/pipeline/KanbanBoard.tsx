'use client';

import React from 'react';
import { KanbanColumn, type StageConfig } from './KanbanColumn';
import type { PipelineCardData } from './PipelineCard';

export const PIPELINE_STAGES: StageConfig[] = [
  { id: 'prospect',            label: 'Prospect',            color: '#9CA3AF', bgColor: '#F3F4F6' },
  { id: 'connecting_linkedin', label: 'Connecting LinkedIn',  color: '#2563EB', bgColor: '#F3F4F6' },
  { id: 'connecting_email',    label: 'Connecting Email',     color: '#6366F1', bgColor: '#F3F4F6' },
  { id: 'scheduling_meeting',  label: 'Scheduling Meeting',   color: '#F59E0B', bgColor: '#F3F4F6', aiSdr: true },
  { id: 'sent_to_crm',         label: 'Sent to CRM',          color: '#16A34A', bgColor: '#F3F4F6' },
  { id: 'lost_archived',       label: 'Lost / Archived',      color: '#EF4444', bgColor: '#F5F5F5', terminal: true },
];

interface KanbanBoardProps {
  cards: PipelineCardData[];
  hasActiveFilter?: boolean;
  onStageChange: (cardId: string, newStageId: string) => void;
  onDealNameChange: (cardId: string, newName: string) => void;
  onCrmReady: (cardId: string) => void;
}

export function KanbanBoard({ cards, hasActiveFilter, onStageChange, onDealNameChange, onCrmReady }: KanbanBoardProps) {
  const cardsByStage = PIPELINE_STAGES.reduce((acc, s) => {
    acc[s.id] = cards.filter(c => c.stage === s.id);
    return acc;
  }, {} as Record<string, PipelineCardData[]>);

  return (
    <div
      style={{
        display: 'flex', gap: 12, overflowX: 'auto',
        paddingBottom: 16, marginTop: 16,
      }}
    >
      {PIPELINE_STAGES.map((stage) => (
        <KanbanColumn
          key={stage.id}
          stage={stage}
          cards={cardsByStage[stage.id] ?? []}
          allStages={PIPELINE_STAGES}
          hasActiveFilter={hasActiveFilter}
          onStageChange={onStageChange}
          onDealNameChange={onDealNameChange}
          onCrmReady={onCrmReady}
        />
      ))}
    </div>
  );
}
