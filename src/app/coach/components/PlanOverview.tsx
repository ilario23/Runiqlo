'use client';

import {useState, useEffect} from 'react';
import type {TrainingPlan, TrainingPhase} from '@/lib/coachTypes';

const PHASE_COLORS: Record<string, {bg: string; border: string; text: string; label: string}> = {
  base:  {bg: 'bg-[#0a84ff]/40',  border: 'border-[#0a84ff]',  text: 'text-[#0a84ff]',  label: 'Base'},
  build: {bg: 'bg-[#ffd60a]/40',  border: 'border-[#ffd60a]',  text: 'text-[#ffd60a]',  label: 'Build'},
  peak:  {bg: 'bg-[#ff453a]/40',  border: 'border-[#ff453a]',  text: 'text-[#ff453a]',  label: 'Peak'},
  taper: {bg: 'bg-[#30d158]/40',  border: 'border-[#30d158]',  text: 'text-[#30d158]',  label: 'Taper'},
};

function getMonday(date: Date = new Date()): string {
  const d = new Date(date);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function weeksBetween(a: string, b: string): number {
  const diff = new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24 * 7));
}

interface PlanOverviewProps {
  athleteId: number;
  onWeekClick?: (weekStart: string) => void;
}

export function PlanOverview({athleteId, onWeekClick}: PlanOverviewProps) {
  const [plan, setPlan] = useState<TrainingPlan | null | undefined>(undefined);
  const currentMonday = getMonday();

  useEffect(() => {
    fetch(`/api/coach/plan?athleteId=${athleteId}`)
      .then(r => r.json())
      .then(setPlan)
      .catch(() => setPlan(null));
  }, [athleteId]);

  if (plan === undefined) {
    return <div className="h-40 rounded-2xl bg-white/[0.04] border border-white/[0.06] animate-pulse" />;
  }

  if (!plan) {
    return (
      <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-8 text-center">
        <div className="text-3xl mb-3">🗺️</div>
        <p className="text-sm text-white/40 mb-1">No training plan yet</p>
        <p className="text-xs text-white/25">Ask the coach to create your periodized training plan</p>
      </div>
    );
  }

  const phases = plan.phases as TrainingPhase[];
  const totalWeeks = phases.reduce((s, p) => s + p.weekCount, 0);
  const planStart = plan.startDate;

  // Build week segments for the timeline
  const segments: Array<{phase: string; startDate: string; endDate: string; weekCount: number; weekOffset: number}> = [];
  let weekOffset = 0;
  for (const phase of phases) {
    segments.push({...phase, weekOffset});
    weekOffset += phase.weekCount;
  }

  // Current week index
  const currentWeekOffset = weeksBetween(planStart, currentMonday);

  return (
    <div>
      {/* Phase summary pills */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {phases.map((p, i) => {
          const cfg = PHASE_COLORS[p.phase] ?? PHASE_COLORS.base;
          return (
            <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${cfg.border}/30 bg-white/[0.04]`}>
              <div className={`w-2 h-2 rounded-full ${cfg.bg}`} />
              <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
              <span className="text-xs text-white/30">{p.weekCount}wk</span>
            </div>
          );
        })}
        <span className="text-xs text-white/30 ml-auto">{totalWeeks} weeks total</span>
      </div>

      {/* Timeline blocks */}
      <div className="mb-6">
        <div className="text-xs text-white/30 mb-2">Phase timeline</div>
        <div className="flex rounded-xl overflow-hidden h-10 gap-0.5">
          {segments.map((seg, i) => {
            const cfg = PHASE_COLORS[seg.phase] ?? PHASE_COLORS.base;
            const widthPct = (seg.weekCount / totalWeeks) * 100;
            const isCurrent = currentWeekOffset >= seg.weekOffset && currentWeekOffset < seg.weekOffset + seg.weekCount;

            return (
              <div
                key={i}
                className={`relative flex items-center justify-center ${cfg.bg} ${isCurrent ? `ring-2 ring-inset ${cfg.border}` : ''} cursor-pointer hover:opacity-90 transition-opacity`}
                style={{width: `${widthPct}%`}}
                title={`${cfg.label}: ${seg.startDate} → ${seg.endDate}`}
                onClick={() => onWeekClick?.(seg.startDate)}
              >
                <span className={`text-xs font-bold uppercase tracking-wide ${cfg.text} select-none`}>
                  {seg.weekCount > 2 ? cfg.label : ''}
                </span>
                {isCurrent && (
                  <div className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${cfg.text.replace('text-', 'bg-')}`} />
                )}
              </div>
            );
          })}
        </div>
        {/* Date labels */}
        <div className="flex justify-between mt-1">
          <span className="text-xs text-white/25">{plan.startDate}</span>
          {plan.targetDate && <span className="text-xs text-white/25">{plan.targetDate}</span>}
        </div>
      </div>

      {/* Phase details */}
      <div className="space-y-3">
        {phases.map((p, i) => {
          const cfg = PHASE_COLORS[p.phase] ?? PHASE_COLORS.base;
          const isCurrentPhase = i === plan.currentPhaseIndex;

          return (
            <div
              key={i}
              className={`rounded-2xl border p-4 ${isCurrentPhase ? `border-${cfg.border.split('-')[1]}-500/40 bg-white/[0.06]` : 'border-white/[0.06] bg-white/[0.02]'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${cfg.text}`}>{cfg.label}</span>
                  {isCurrentPhase && (
                    <span className="text-xs bg-white/10 text-white/60 px-2 py-0.5 rounded-full">Current</span>
                  )}
                </div>
                <span className="text-xs text-white/30">{p.weekCount} weeks · {p.startDate} → {p.endDate}</span>
              </div>
              <p className="text-sm text-white/70 mb-2">{p.focusDescription}</p>
              <div className="flex items-center justify-between">
                <div className="text-xs text-white/40">
                  Target: {p.targetWeeklyKmRange[0]}–{p.targetWeeklyKmRange[1]} km/week
                </div>
                <div className="flex gap-1 flex-wrap justify-end">
                  {p.keyWorkouts.slice(0, 3).map(w => (
                    <span key={w} className="text-xs bg-white/[0.06] text-white/50 px-2 py-0.5 rounded-full">{w}</span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
