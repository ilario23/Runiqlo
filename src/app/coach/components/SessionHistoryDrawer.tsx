'use client';

import {useEffect, useState} from 'react';
import {motion} from 'framer-motion';
import type {SessionSummary} from '@/app/api/coach/chat/route';

// ── Date grouping ──────────────────────────────────────────────────────────────

type Group = {label: string; sessions: SessionSummary[]};

function groupSessions(sessions: SessionSummary[]): Group[] {
  const now = new Date();
  const todayStr = now.toDateString();
  const yestDate = new Date(now); yestDate.setDate(yestDate.getDate() - 1);
  const yestStr = yestDate.toDateString();
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: Record<string, SessionSummary[]> = {
    Today: [],
    Yesterday: [],
    'This week': [],
    Older: [],
  };

  for (const s of sessions) {
    const d = new Date(s.createdAt);
    const ds = d.toDateString();
    if (ds === todayStr) groups['Today'].push(s);
    else if (ds === yestStr) groups['Yesterday'].push(s);
    else if (d >= weekAgo) groups['This week'].push(s);
    else groups['Older'].push(s);
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, sessions]) => ({label, sessions}));
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) return d.toLocaleDateString([], {weekday: 'long'});
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    ...(diffDays > 365 ? {year: 'numeric'} : {}),
  });
}

// ── Session item ───────────────────────────────────────────────────────────────

interface SessionItemProps {
  session: SessionSummary;
  isActive: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  isDeleting: boolean;
  isConfirming: boolean;
  onDeleteClick: (e: React.MouseEvent) => void;
}

function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
  isDeleting,
  isConfirming,
  onDeleteClick,
}: SessionItemProps) {
  const d = new Date(session.createdAt);
  const todayStr = new Date().toDateString();
  const timeStr = d.toDateString() === todayStr ? formatTime(session.createdAt) : formatDate(session.createdAt);

  return (
    <div
      className={[
        'group relative rounded-xl transition-colors cursor-pointer',
        isActive
          ? 'bg-[var(--color-surface-2)] border border-[var(--color-accent)]/30'
          : 'hover:bg-[var(--color-surface-1)] border border-transparent',
      ].join(' ')}
    >
      <button onClick={onSelect} className="w-full text-left px-3 py-3 pr-10">
        {/* Preview */}
        <p className="text-sm text-[var(--color-text-1)] leading-snug line-clamp-2 mb-1.5">
          {session.preview || 'New conversation'}
        </p>
        {/* Meta row */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-text-2)]">{timeStr}</span>
          <span className="text-[10px] text-[var(--color-text-3)] opacity-60">·</span>
          <span className="text-[11px] text-[var(--color-text-2)]">{session.messageCount} msgs</span>
          {isActive && (
            <>
              <span className="text-[10px] text-[var(--color-text-3)] opacity-60">·</span>
              <span className="text-[11px] text-[var(--color-accent)]">Active</span>
            </>
          )}
        </div>
      </button>

      {/* Delete control */}
      {isConfirming ? (
        <button
          onClick={onDelete}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-2 h-6 flex items-center justify-center rounded-md bg-red-500/20 text-red-400 text-[10px] font-semibold hover:bg-red-500/30 transition-colors"
        >
          Delete?
        </button>
      ) : (
        <button
          onClick={onDeleteClick}
          disabled={isDeleting}
          title="Delete"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:text-red-400 transition-all disabled:opacity-30"
        >
          {isDeleting ? (
            <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}

// ── Drawer ─────────────────────────────────────────────────────────────────────

interface SessionHistoryDrawerProps {
  athleteId: number;
  currentSessionId: string | null | undefined;
  onSelect: (sessionId: string | null) => void;
  onDelete?: (sessionId: string | null) => void;
  onClose: () => void;
}

export function SessionHistoryDrawer({
  athleteId,
  currentSessionId,
  onSelect,
  onDelete,
  onClose,
}: SessionHistoryDrawerProps) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null | undefined>(undefined);
  const [confirmId, setConfirmId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    fetch(`/api/coach/chat?athleteId=${athleteId}&listSessions=1`)
      .then(r => r.json())
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [athleteId]);

  const handleDeleteClick = (e: React.MouseEvent, sessionId: string | null) => {
    e.stopPropagation();
    if (confirmId !== sessionId) {
      setConfirmId(sessionId);
      return;
    }
    handleDeleteConfirm(e, sessionId);
  };

  const handleDeleteConfirm = async (e: React.MouseEvent, sessionId: string | null) => {
    e.stopPropagation();
    setConfirmId(undefined);
    setDeletingId(sessionId);
    const param = sessionId === null ? 'null' : sessionId;
    await fetch(`/api/coach/chat?athleteId=${athleteId}&sessionId=${param}`, {method: 'DELETE'});
    setSessions(prev => prev?.filter(s => s.id !== sessionId) ?? prev);
    onDelete?.(sessionId);
    setDeletingId(undefined);
  };

  const groups = sessions ? groupSessions(sessions) : [];

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col"
      style={{background: 'var(--color-surface-0)'}}
      initial={{opacity: 0, x: -12}}
      animate={{opacity: 1, x: 0}}
      exit={{opacity: 0, x: -12}}
      transition={{duration: 0.18, ease: 'easeOut'}}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-[var(--color-text-3)]" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span className="text-sm font-semibold text-[var(--color-ink)] flex-1">Conversations</span>
        {sessions && (
          <span className="text-[11px] bg-[var(--color-surface-2)] text-[var(--color-text-3)] px-1.5 py-0.5 rounded-full tabular-nums">
            {sessions.length}
          </span>
        )}
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:text-[var(--color-text-1)] transition-colors ml-1"
          title="Close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto">
        {sessions === null ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 rounded-full border-2 border-[var(--color-rule)] border-t-white/60 animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-[var(--color-text-3)] opacity-40" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm text-[var(--color-text-2)]">No previous conversations</p>
          </div>
        ) : (
          <div className="p-2 space-y-4">
            {groups.map(({label, sessions: groupSessions}) => (
              <div key={label}>
                {/* Group label */}
                <div className="px-3 py-1 mb-1">
                  <span className="text-[10px] font-semibold text-[var(--color-text-3)] uppercase tracking-wider">
                    {label}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {groupSessions.map(session => {
                    const isActive =
                      session.id === currentSessionId ||
                      (session.id === null && (currentSessionId === null || currentSessionId === undefined));
                    return (
                      <SessionItem
                        key={session.id ?? 'legacy'}
                        session={session}
                        isActive={isActive}
                        onSelect={() => onSelect(session.id)}
                        onDelete={(e) => handleDeleteConfirm(e, session.id)}
                        isDeleting={deletingId !== undefined && deletingId === session.id}
                        isConfirming={confirmId === session.id}
                        onDeleteClick={(e) => handleDeleteClick(e, session.id)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
