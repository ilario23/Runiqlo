'use client';

interface AskQuestionCardProps {
  question: string;
  options: Array<{value: string; label: string}>;
  disabled: boolean;
  onSelect: (label: string) => void;
}

export function AskQuestionCard({question, options, disabled, onSelect}: AskQuestionCardProps) {
  return (
    <div className="mt-3 mb-1 space-y-3">
      <p className="text-sm text-[var(--color-text-1)] leading-relaxed">{question}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            disabled={disabled}
            onClick={() => onSelect(opt.label)}
            className={[
              'px-3.5 py-2 rounded-xl text-sm font-medium border transition-all duration-150',
              disabled
                ? 'bg-[var(--color-surface-0)] border-[var(--color-border)] text-[var(--color-text-3)] cursor-not-allowed opacity-50'
                : 'bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text-2)] hover:border-[var(--color-accent)]/50 hover:text-white hover:bg-[var(--color-accent-dim)] cursor-pointer',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
