'use client';

import type {Goal} from '@/lib/coachTypes';

const GOAL_LABELS: Record<string, string> = {
  marathon: 'Marathon', half_marathon: 'Half Marathon',
  '10k': '10K', '5k': '5K', general_fitness: 'General Fitness',
};

const PHASE_COLORS: Record<string, string> = {
  base: 'text-[#0a84ff] bg-[#0a84ff]/15',
  build: 'text-[#ffd60a] bg-[#ffd60a]/15',
  peak: 'text-[#ff453a] bg-[#ff453a]/15',
  taper: 'text-[#30d158] bg-[#30d158]/15',
};

interface GoalCardProps {
  goal: Goal;
  currentPhase?: string;
  onEdit: () => void;
}

export function GoalCard({goal, currentPhase, onEdit}: GoalCardProps) {
  const weeksAway = goal.targetDate
    ? Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7))
    : null;

  return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#0a84ff]/20 flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-semibold text-sm truncate">
                {GOAL_LABELS[goal.goalType] ?? goal.goalType}
              </span>
              {goal.targetEventName && (
                <span className="text-white/40 text-sm truncate">— {goal.targetEventName}</span>
              )}
              {currentPhase && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PHASE_COLORS[currentPhase] ?? 'text-white/50 bg-white/10'}`}>
                  {currentPhase}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {weeksAway != null && (
                <span className={`text-xs ${weeksAway > 0 ? 'text-white/50' : 'text-[#ff453a]'}`}>
                  {weeksAway > 0 ? `${weeksAway} weeks away` : 'Event passed'}
                </span>
              )}
              <span className="text-xs text-white/30">{goal.weeklyHoursAvailable}h/week · {goal.experienceLevel}</span>
            </div>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="text-xs text-white/40 hover:text-white/70 transition-colors flex-shrink-0 px-2 py-1 rounded-lg hover:bg-white/[0.06]"
        >
          Edit
        </button>
      </div>
    </div>
  );
}
