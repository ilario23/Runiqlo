'use client';

import type {WorkoutBlock, WorkoutStep, RepeatBlock} from '@/lib/coachTypes';
import type {UserSettings} from '@/lib/activityModel';
import {isRepeatBlock, formatDuration, bpmRangeFromIntensity} from '@/lib/workoutUtils';
import {useSettings} from '@/contexts/SettingsContext';

const STEP_STYLE: Record<string, {dot: string; bg: string; label: string}> = {
  warmup: {
    dot: 'bg-[var(--color-accent-orange)]',
    bg: 'bg-[color-mix(in_srgb,var(--color-accent-orange)_8%,transparent)]',
    label: 'text-[var(--color-accent-orange)]',
  },
  training: {
    dot: 'bg-[var(--color-accent-green)]',
    bg: 'bg-[color-mix(in_srgb,var(--color-accent-green)_8%,transparent)]',
    label: 'text-[var(--color-accent-green)]',
  },
  rest: {
    dot: 'bg-[var(--color-accent-blue)]',
    bg: 'bg-[color-mix(in_srgb,var(--color-accent-blue)_8%,transparent)]',
    label: 'text-[var(--color-accent-blue)]',
  },
  cooldown: {
    dot: 'bg-[var(--color-accent-cyan)]',
    bg: 'bg-[color-mix(in_srgb,var(--color-accent-cyan)_8%,transparent)]',
    label: 'text-[var(--color-accent-cyan)]',
  },
};

const STEP_LABELS: Record<string, string> = {
  warmup: 'Warm Up',
  training: 'Training',
  rest: 'Rest',
  cooldown: 'Cool Down',
};

function StepRow({
  step,
  nested,
  zones,
}: {
  step: WorkoutStep;
  nested?: boolean;
  zones?: UserSettings['zones'];
}) {
  const sty = STEP_STYLE[step.stepType] ?? STEP_STYLE.training;
  const bpm = bpmRangeFromIntensity(step.intensityMin, step.intensityMax, zones);
  return (
    <div className={`flex items-stretch rounded-xl px-3 py-2.5 ${nested ? '' : sty.bg}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {!nested && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sty.dot}`} />}
            <span className={`text-[10px] uppercase tracking-widest font-semibold ${sty.label}`}>
              {STEP_LABELS[step.stepType] ?? step.stepType}
            </span>
          </div>
          <span className="text-xs font-mono text-[var(--text)] tabular-nums">
            {formatDuration(step.durationSeconds)}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0">
          <span className="text-xs text-[var(--text)] font-medium">{step.zoneName}</span>
          {bpm && (
            <span className="text-[11px] text-[var(--faint)]">
              {bpm.bpmMin}–{bpm.bpmMax} bpm
            </span>
          )}
        </div>
        {step.notes && (
          <p className="mt-0.5 text-[11px] text-[var(--faint)] italic leading-snug">{step.notes}</p>
        )}
      </div>
    </div>
  );
}

function RepeatContainer({block, zones}: {block: RepeatBlock; zones?: UserSettings['zones']}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-surface-2)] border-b border-[var(--color-border)]">
        <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--faint)]">
          Repeat
        </span>
        <span className="text-[11px] font-bold font-mono tabular-nums text-[var(--dim)]">
          ×{block.repeatCount}
        </span>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {block.steps.map((step, i) => {
          const sty = STEP_STYLE[step.stepType] ?? STEP_STYLE.training;
          return (
            <div key={i} className={sty.bg}>
              <StepRow step={step} nested zones={zones} />
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
  zones,
}: {
  blocks: WorkoutBlock[];
  className?: string;
  zones?: UserSettings['zones'];
}) {
  const {settings} = useSettings();
  const resolvedZones = zones ?? settings.zones;
  const total = totalSeconds(blocks);
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      {blocks.map((block, i) =>
        isRepeatBlock(block) ? (
          <RepeatContainer key={i} block={block} zones={resolvedZones} />
        ) : (
          <StepRow key={i} step={block} zones={resolvedZones} />
        ),
      )}
      {total > 0 && (
        <div className="pt-0.5 flex items-center justify-end">
          <span className="text-[10px] text-[var(--dim)] font-mono tabular-nums">
            Total: {formatDuration(total)}
          </span>
        </div>
      )}
    </div>
  );
}
