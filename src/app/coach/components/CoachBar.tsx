'use client';

import {useState, useCallback} from 'react';
import {motion, AnimatePresence} from 'framer-motion';
import {ChatPanel} from './ChatPanel';

interface CoachBarProps {
  athleteId: number;
  onPlanSaved?: () => void;
  initialMessage?: string;
}

const CoachIcon = ({size = 12}: {size?: number}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
  </svg>
);

export function CoachBar({athleteId, onPlanSaved, initialMessage}: CoachBarProps) {
  const [open, setOpen] = useState(false);

  const handleClose = useCallback(() => setOpen(false), []);
  const handleOpen = useCallback(() => setOpen(true), []);

  return (
    <>
      {/* ── Chat overlay ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="coach-overlay"
            initial={{opacity: 0, y: 16}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: 16}}
            transition={{duration: 0.2, ease: [0.16, 1, 0.3, 1]}}
            className="fixed inset-x-0 bottom-0 top-14 z-40 flex flex-col"
            style={{background: 'var(--color-base)'}}
          >
            {/* Overlay strip header */}
            <div
              className="flex-shrink-0 flex items-center justify-between px-5 border-b border-[var(--color-border)]"
              style={{height: '44px', background: 'var(--color-surface-0)'}}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{background: 'var(--color-accent-dim)', color: 'var(--color-accent)'}}
                >
                  <CoachIcon size={12} />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink)]">
                  Coach
                </span>
              </div>

              <button
                onClick={handleClose}
                className="flex items-center gap-1.5 text-xs text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)] transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
                Close
              </button>
            </div>

            {/* Chat fills remaining height */}
            <div className="flex-1 overflow-hidden">
              <ChatPanel
                athleteId={athleteId}
                initialMessage={initialMessage}
                onPlanSaved={() => { onPlanSaved?.(); }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Desktop command bar (fixed bottom, md+) ──────────────────────────── */}
      <div
        className="hidden md:flex fixed bottom-0 left-0 right-0 z-30 items-center gap-3 px-5 border-t border-[var(--color-border)]"
        style={{height: '52px', background: 'var(--color-base)'}}
      >
        {/* Icon */}
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
          style={{background: 'var(--color-accent-dim)', color: 'var(--color-accent)'}}
        >
          <CoachIcon size={11} />
        </div>

        {/* Click target — "typewriter" placeholder */}
        <button
          onClick={handleOpen}
          className="flex-1 text-left text-sm text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)] transition-colors truncate"
        >
          Ask your coach…
        </button>

        {/* Keyboard hints */}
        <div className="hidden lg:flex items-center gap-2 text-[10px] text-[var(--color-ink-3)] font-mono">
          <span className="px-1.5 py-0.5 rounded border border-[var(--color-rule)] bg-[var(--color-paper-2)]">/</span>
          <span className="text-[var(--color-ink-3)]">commands</span>
          <span className="ml-1 px-1.5 py-0.5 rounded border border-[var(--color-rule)] bg-[var(--color-paper-2)]">@</span>
          <span className="text-[var(--color-ink-3)]">refs</span>
        </div>

        {/* Open button */}
        <button
          onClick={handleOpen}
          className="h-8 px-4 rounded-xl text-[var(--color-ink)] text-xs font-semibold transition-colors flex-shrink-0"
          style={{background: 'var(--color-accent)'}}
        >
          Chat
        </button>
      </div>

      {/* ── Mobile FAB (above tab bar) ────────────────────────────────────────── */}
      <button
        onClick={handleOpen}
        className="md:hidden fixed z-30 w-12 h-12 rounded-full shadow-lg flex items-center justify-center"
        style={{
          bottom: 'calc(56px + env(safe-area-inset-bottom) + 12px)',
          right: '16px',
          background: 'var(--color-accent)',
          color: 'white',
        }}
        aria-label="Open coach chat"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    </>
  );
}
