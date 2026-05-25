'use client';

import {useEffect, useState} from 'react';
import {motion} from 'framer-motion';
import type {SessionSummary} from '@/app/api/coach/chat/route';

interface SessionHistoryDrawerProps {
  athleteId: number;
  currentSessionId: string | null | undefined;
  onSelect: (sessionId: string | null) => void;
  onDelete?: (sessionId: string | null) => void;
  onClose: () => void;
}

function formatSessionDate(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return 'Today · ' + date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString([], {weekday: 'long'});
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    ...(diffDays > 365 ? {year: 'numeric'} : {}),
  });
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

  useEffect(() => {
    fetch(`/api/coach/chat?athleteId=${athleteId}&listSessions=1`)
      .then(r => r.json())
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [athleteId]);

  const handleDelete = async (e: React.MouseEvent, sessionId: string | null) => {
    e.stopPropagation();
    setDeletingId(sessionId);
    const param = sessionId === null ? 'null' : sessionId;
    await fetch(`/api/coach/chat?athleteId=${athleteId}&sessionId=${param}`, {method: 'DELETE'});
    setSessions(prev => prev?.filter(s => s.id !== sessionId) ?? prev);
    onDelete?.(sessionId);
    setDeletingId(undefined);
  };

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col bg-[#070708]"
      initial={{opacity: 0, x: -16}}
      animate={{opacity: 1, x: 0}}
      exit={{opacity: 0, x: -16}}
      transition={{duration: 0.16, ease: 'easeOut'}}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/[0.07] flex items-center gap-2">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-white/40" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span className="text-sm font-semibold text-white flex-1">Conversations</span>
        {sessions && (
          <span className="text-xs bg-white/[0.08] text-white/40 px-1.5 py-0.5 rounded-full tabular-nums">
            {sessions.length}
          </span>
        )}
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-white/70 transition-colors ml-1"
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
            <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-white/20" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm text-white/40">No previous conversations</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {sessions.map(session => {
              const isActive =
                session.id === currentSessionId ||
                (session.id === null && (currentSessionId === null || currentSessionId === undefined));
              const isDeleting = deletingId !== undefined && deletingId === session.id;

              return (
                <div
                  key={session.id ?? 'legacy'}
                  className={[
                    'group relative rounded-xl border transition-colors',
                    isActive
                      ? 'bg-accent-blue/[0.12] border-accent-blue/30'
                      : 'hover:bg-white/[0.05] border-transparent',
                  ].join(' ')}
                >
                  <button
                    onClick={() => onSelect(session.id)}
                    className="w-full text-left px-3 py-2.5 pr-8"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-white/30 tabular-nums">
                        {formatSessionDate(session.createdAt)}
                      </span>
                      <span className="text-[11px] text-white/20 tabular-nums">
                        {session.messageCount} msgs
                      </span>
                    </div>
                    <p className="text-sm text-white/70 leading-snug line-clamp-2">{session.preview}</p>
                    {isActive && (
                      <span className="text-[10px] text-accent-blue/60 mt-1 block">Current session</span>
                    )}
                  </button>
                  <button
                    onClick={e => handleDelete(e, session.id)}
                    disabled={isDeleting}
                    title="Delete conversation"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-all disabled:opacity-30"
                  >
                    {isDeleting ? (
                      <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
