'use client';

import type {PlannedWorkout, WorkoutType} from '@/lib/coachTypes';

const TYPE_CONFIG: Record<WorkoutType, {label: string; color: string; icon: string}> = {
  easy_run:     {label: 'Easy Run',     color: 'text-[#30d158] border-[#30d158]/30 bg-[#30d158]/8',  icon: '🏃'},
  long_run:     {label: 'Long Run',     color: 'text-[#30d158] border-[#30d158]/30 bg-[#30d158]/8',  icon: '🏃'},
  tempo_run:    {label: 'Tempo Run',    color: 'text-[#ffd60a] border-[#ffd60a]/30 bg-[#ffd60a]/8',  icon: '⚡'},
  interval_run: {label: 'Intervals',    color: 'text-[#ff453a] border-[#ff453a]/30 bg-[#ff453a]/8',  icon: '🔥'},
  recovery_run: {label: 'Recovery Run', color: 'text-[#64d2ff] border-[#64d2ff]/30 bg-[#64d2ff]/8',  icon: '🌊'},
  gym:          {label: 'Gym',          color: 'text-[#ff9f0a] border-[#ff9f0a]/30 bg-[#ff9f0a]/8',  icon: '🏋️'},
  cycling:      {label: 'Cycling',      color: 'text-[#0a84ff] border-[#0a84ff]/30 bg-[#0a84ff]/8',  icon: '🚴'},
  yoga:         {label: 'Yoga',         color: 'text-[#bf5af2] border-[#bf5af2]/30 bg-[#bf5af2]/8',  icon: '🧘'},
  cross_training:{label: 'Cross Train', color: 'text-[#64d2ff] border-[#64d2ff]/30 bg-[#64d2ff]/8',  icon: '💪'},
  rest:         {label: 'Rest',         color: 'text-white/30 border-white/10 bg-white/4',            icon: '😴'},
};

interface WorkoutCardProps {
  workout: PlannedWorkout;
  date: string;
  onMarkDone?: () => void;
  isToday?: boolean;
  compact?: boolean;
  onClick?: () => void;
  selected?: boolean;
}

export function WorkoutCard({workout, date, onMarkDone, isToday, compact, onClick, selected}: WorkoutCardProps) {
  const cfg = TYPE_CONFIG[workout.type] ?? TYPE_CONFIG.rest;

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${cfg.color} ${workout.completed ? 'opacity-80' : ''} transition-all ${onClick ? 'cursor-pointer hover:brightness-110 active:scale-[0.98]' : ''} ${selected ? 'ring-2 ring-white/30' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm leading-none mt-0.5">{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold tracking-wide uppercase">{cfg.label}</span>
            {workout.distanceKm && (
              <span className="text-xs opacity-70">{workout.distanceKm}km</span>
            )}
            {!workout.distanceKm && workout.durationMinutes && (
              <span className="text-xs opacity-70">{workout.durationMinutes}min</span>
            )}
            {workout.completed && (
              <span className="ml-auto text-[#30d158] text-xs font-medium">✓ Done</span>
            )}
          </div>
          {!compact && (
            <p className="text-xs opacity-60 mt-0.5 leading-snug line-clamp-2">
              {workout.intensityDescription}
            </p>
          )}
        </div>
      </div>

      {workout.completed && workout.linkedStravaActivityId && (
        <a
          href={`https://www.strava.com/activities/${workout.linkedStravaActivityId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 flex items-center gap-1 text-xs text-[#fc4c02] hover:underline"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          View on Strava
        </a>
      )}

      {!workout.completed && isToday && onMarkDone && (
        <button
          onClick={onMarkDone}
          className="mt-1.5 text-xs text-white/50 hover:text-white/80 underline transition-colors"
        >
          Mark complete
        </button>
      )}
    </div>
  );
}
