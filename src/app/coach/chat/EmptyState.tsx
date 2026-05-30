'use client';

interface EmptyStateProps {
  onSend: (text: string) => void;
  onPrefill: (text: string) => void;
}

const STARTER_PROMPTS = [
  'How is my fitness trending?',
  'Generate my plan for this week',
  'Create my training plan',
];

const COMMANDS = ['/modify', '/week', '/status'];

export function EmptyState({onSend, onPrefill}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-5">
      {/* Icon */}
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{background: 'var(--color-accent-dim)', color: 'var(--color-accent)'}}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
        </svg>
      </div>

      {/* Copy */}
      <div className="space-y-1.5">
        <h2 className="text-base font-semibold text-white">Your AI running coach</h2>
        <p className="text-sm text-[var(--color-text-3)] max-w-[220px] leading-relaxed">
          Ask about training, request a weekly plan, or share how you're feeling.
        </p>
      </div>

      {/* Starter prompts */}
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {STARTER_PROMPTS.map(s => (
          <button
            key={s}
            onClick={() => onSend(s)}
            className="text-sm text-[var(--color-text-2)] hover:text-white bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 transition-colors text-left"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Command chips */}
      <div className="flex flex-wrap gap-2 justify-center">
        {COMMANDS.map(cmd => (
          <button
            key={cmd}
            onClick={() => onPrefill(cmd + ' ')}
            className="text-xs font-mono text-[var(--color-accent)]/70 hover:text-[var(--color-accent)] bg-[var(--color-accent-dim)] hover:bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 hover:border-[var(--color-accent)]/40 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            {cmd}
          </button>
        ))}
      </div>
    </div>
  );
}
