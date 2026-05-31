'use client';

import {Activity, TrendingUp, Zap, Timer, Wind, Dumbbell, Bike, Leaf, Shuffle, Moon, Waves, Footprints, Mountain} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import type {PlannedWorkout, WorkoutType} from '@/lib/coachTypes';

const TYPE_CONFIG: Record<WorkoutType, {label: string; color: string; icon: LucideIcon}> = {
  easy_run:     {label: 'Easy Run',     color: 'text-accent-green border-accent-green/30 bg-accent-green/8',   icon: Activity},
  long_run:     {label: 'Long Run',     color: 'text-accent-green border-accent-green/30 bg-accent-green/8',   icon: TrendingUp},
  tempo_run:    {label: 'Tempo Run',    color: 'text-accent-yellow border-accent-yellow/30 bg-accent-yellow/8', icon: Zap},
  interval_run: {label: 'Intervals',    color: 'text-accent-red border-accent-red/30 bg-accent-red/8',          icon: Timer},
  recovery_run: {label: 'Recovery Run', color: 'text-accent-cyan border-accent-cyan/30 bg-accent-cyan/8',      icon: Wind},
  gym:          {label: 'Gym',          color: 'text-accent-orange border-accent-orange/30 bg-accent-orange/8', icon: Dumbbell},
  cycling:      {label: 'Cycling',      color: 'text-accent-blue border-accent-blue/30 bg-accent-blue/8',       icon: Bike},
  yoga:         {label: 'Yoga',         color: 'text-accent-purple border-accent-purple/30 bg-accent-purple/8', icon: Leaf},
  cross_training:{label: 'Cross Train', color: 'text-accent-cyan border-accent-cyan/30 bg-accent-cyan/8',      icon: Shuffle},
  rest:         {label: 'Rest',         color: 'text-white/30 border-white/10 bg-white/4',                     icon: Moon},
  swim:         {label: 'Swim',         color: 'text-accent-cyan border-accent-cyan/30 bg-accent-cyan/8',      icon: Waves},
  walk:         {label: 'Walk',         color: 'text-accent-green border-accent-green/30 bg-accent-green/8',   icon: Footprints},
  hike:         {label: 'Hike',         color: 'text-accent-green border-accent-green/30 bg-accent-green/8',   icon: Mountain},
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
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`rounded-xl border px-3 py-2.5 ${cfg.color} ${workout.completed ? 'opacity-80' : ''} transition-all ${onClick ? 'cursor-pointer hover:brightness-110 active:scale-[0.98]' : ''} ${selected ? 'ring-2 ring-white/30' : ''}`}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="flex items-start gap-2">
        <cfg.icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
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
              <span className="ml-auto text-accent-green text-xs font-medium">✓ Done</span>
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
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <a
            href={`/activities/${workout.linkedStravaActivityId}`}
            className="whitespace-nowrap text-xs text-brand hover:underline"
          >
            View details
          </a>
          <a
            href={`https://www.strava.com/activities/${workout.linkedStravaActivityId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 text-xs text-white/40 hover:text-brand hover:underline"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
            Strava
          </a>
        </div>
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
