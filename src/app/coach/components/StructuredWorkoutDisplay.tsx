'use client';

import type {WorkoutBlock, WorkoutStep, RepeatBlock} from '@/lib/coachTypes';
import {isRepeatBlock, formatDuration} from '@/lib/workoutUtils';

const STEP_STYLE: Record<string, {border: string; bg: string; label: string}> = {
  warmup: {
    border: 'border-l-[var(--color-accent-orange)]',
    bg: 'bg-[color-mix(in_srgb,var(--color-accent-orange)_7%,transparent)]',
    label: 'text-[var(--color-accent-orange)]',
  },
  training: {
    border: 'border-l-[var(--color-accent-green)]',
    bg: 'bg-[color-mix(in_srgb,var(--color-accent-green)_7%,transparent)]',
    label: 'text-[var(--color-accent-green)]',
  },
  rest: {
    border: 'border-l-[var(--color-accent-blue)]',
    bg: 'bg-[color-mix(in_srgb,var(--color-accent-blue)_7%,transparent)]',
    label: 'text-[var(--color-accent-blue)]',
  },
  cooldown: {
    border: 'border-l-[#64d2ff]',
    bg: 'bg-[color-mix(in_srgb,#64d2ff_7%,transparent)]',
    label: 'text-[#64d2ff]',
  },
};

const STEP_LABELS: Record<string, string> = {
  warmup: 'Warm Up',
  training: 'Training',
  rest: 'Rest',
  cooldown: 'Cool Down',
};

function StepRow({step, nested}: {step: WorkoutStep; nested?: boolean}) {
  const sty = STEP_STYLE[step.stepType] ?? STEP_STYLE.training;
  return (
    <div
      className={`flex items-stretch px-3 py-2.5 ${
        nested ? '' : `border-l-[3px] ${sty.border} ${sty.bg} rounded-r-xl`
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[10px] uppercase tracking-widest font-semibold ${sty.label}`}>
            {STEP_LABELS[step.stepType] ?? step.stepType}
          </span>
          <span className="text-xs font-mono text-white/70 tabular-nums">
            {formatDuration(step.durationSeconds)}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0">
          <span className="text-xs text-white/80 font-medium">{step.zoneName}</span>
          <span className="text-[11px] text-white/45">
            {step.intensityMin}–{step.intensityMax}% LTHR
          </span>
          {step.bpmMin != null && step.bpmMax != null && (
            <span className="text-[11px] text-white/35">
              {step.bpmMin}–{step.bpmMax} bpm
            </span>
          )}
        </div>
        {step.notes && (
          <p className="mt-0.5 text-[11px] text-white/40 italic leading-snug">{step.notes}</p>
        )}
      </div>
    </div>
  );
}

function RepeatContainer({block}: {block: RepeatBlock}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] overflow-hidden relative">
      <div className="absolute top-2 right-2 z-10">
        <span className="text-[10px] font-bold text-white/50 bg-[var(--color-surface-2)] border border-[var(--color-border)] px-2 py-0.5 rounded-full">
          ×{block.repeatCount}
        </span>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {block.steps.map((step, i) => {
          const sty = STEP_STYLE[step.stepType] ?? STEP_STYLE.training;
          return (
            <div key={i} className={`border-l-[3px] ${sty.border} ${sty.bg}`}>
              <StepRow step={step} nested />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function totalSeconds(blocks: WorkoutBlock[]): number {
  return blocks.reduce((sum, b) => {
    if (isRepeatBlock(b)) {
      return sum + b.repeatCount * b.steps.reduce((s, step) => s + step.durationSeconds, 0);
    }
    return sum + b.durationSeconds;
  }, 0);
}

export function StructuredWorkoutDisplay({
  blocks,
  className,
}: {
  blocks: WorkoutBlock[];
  className?: string;
}) {
  const total = totalSeconds(blocks);
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      {blocks.map((block, i) =>
        isRepeatBlock(block) ? (
          <RepeatContainer key={i} block={block} />
        ) : (
          <StepRow key={i} step={block} />
        ),
      )}
      {total > 0 && (
        <div className="pt-0.5 flex items-center justify-end">
          <span className="text-[10px] text-white/30 font-mono tabular-nums">
            Total: {formatDuration(total)}
          </span>
        </div>
      )}
    </div>
  );
}
