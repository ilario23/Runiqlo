'use client';

import Link from 'next/link';

interface AskCoachBarProps {
  view: 'week' | 'plan';
  weekStart?: string;
}

export function AskCoachBar({view, weekStart}: AskCoachBarProps) {
  const prompt =
    view === 'week'
      ? weekStart
        ? `Let's talk about my training week starting ${weekStart}.`
        : `Let's talk about my training this week.`
      : `Let's review my training plan and upcoming phases.`;

  return (
    <div
      className={[
        'fixed left-0 right-0 z-40 h-[52px]',
        'flex items-center justify-between px-5',
        'bottom-[calc(56px_+_env(safe-area-inset-bottom))] md:bottom-0',
        'border-t border-[var(--color-border)] bg-[var(--color-surface-0)]',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 text-xs text-[var(--color-ink-3)]">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="flex-shrink-0 text-[var(--color-accent)]"
        >
          <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
        </svg>
        <span>Questions about your plan?</span>
      </div>
      <Link
        href={`/coach?q=${encodeURIComponent(prompt)}`}
        className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-accent)] transition-opacity hover:opacity-80"
      >
        Talk to your coach
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </Link>
    </div>
  );
}
