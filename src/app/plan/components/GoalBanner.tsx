'use client';

import type {Goal} from '@/lib/coachTypes';

const GOAL_LABELS: Record<string, string> = {
  marathon: 'Marathon', half_marathon: 'Half Marathon',
  '10k': '10K', '5k': '5K', general_fitness: 'General Fitness',
};

const PHASE_DOT: Record<string, string> = {
  base: 'bg-accent-blue',
  build: 'bg-accent-yellow',
  peak: 'bg-accent-red',
  taper: 'bg-accent-green',
};

const PHASE_TEXT: Record<string, string> = {
  base: 'text-accent-blue',
  build: 'text-accent-yellow',
  peak: 'text-accent-red',
  taper: 'text-accent-green',
};

interface GoalBannerProps {
  goal: Goal;
  currentPhase?: string;
}

export function GoalBanner({goal, currentPhase}: GoalBannerProps) {
  const weeksAway = goal.targetDate
    ? Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7))
    : null;

  return (
    <div
      className="flex-shrink-0 flex items-center gap-3 px-5 border-b border-[var(--color-border)]"
      style={{height: '40px', background: 'var(--color-surface-0)'}}
    >
      {/* Orange race indicator */}
      <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] flex-shrink-0" />

      {/* Goal type + event name */}
      <span className="text-xs font-semibold text-white">
        {GOAL_LABELS[goal.goalType] ?? goal.goalType}
      </span>
      {goal.targetEventName && (
        <span className="text-xs text-white/35 truncate max-w-[180px] hidden sm:block">
          — {goal.targetEventName}
        </span>
      )}

      {/* Pipe dividers */}
      <span className="text-[var(--color-border)] select-none">|</span>

      {/* Phase */}
      {currentPhase ? (
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PHASE_DOT[currentPhase] ?? 'bg-white/30'}`} />
          <span className={`text-[10px] font-semibold uppercase tracking-widest ${PHASE_TEXT[currentPhase] ?? 'text-white/40'}`}>
            {currentPhase}
          </span>
        </div>
      ) : (
        <span className="text-[10px] text-white/25 uppercase tracking-wider">No plan</span>
      )}

      <span className="text-[var(--color-border)] select-none">|</span>

      {/* Weeks away */}
      {weeksAway != null && (
        <span className={`text-xs tabular-nums ${weeksAway > 0 ? 'text-white/35' : 'text-[var(--color-accent)]'}`}>
          {weeksAway > 0 ? `${weeksAway}w out` : weeksAway === 0 ? 'Race week' : 'Race passed'}
        </span>
      )}

      {/* Experience level — far right, desktop only */}
      {goal.experienceLevel && (
        <span className="ml-auto text-[10px] text-white/20 uppercase tracking-wider hidden md:block">
          {goal.experienceLevel}
        </span>
      )}
    </div>
  );
}
