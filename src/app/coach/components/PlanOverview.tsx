'use client';

import {useState, useEffect, useRef} from 'react';
import type {TrainingPlan, TrainingPhase, WeekSketch, WorkoutType} from '@/lib/coachTypes';

const PHASE_COLORS: Record<string, {bg: string; border: string; text: string; label: string; hex: string}> = {
  base:  {bg: 'bg-accent-blue/40',   border: 'border-accent-blue',   text: 'text-accent-blue',   label: 'Base',  hex: 'rgba(96,165,250,0.65)'},
  build: {bg: 'bg-accent-yellow/40', border: 'border-accent-yellow', text: 'text-accent-yellow', label: 'Build', hex: 'rgba(251,191,36,0.65)'},
  peak:  {bg: 'bg-accent-red/40',    border: 'border-accent-red',    text: 'text-accent-red',    label: 'Peak',  hex: 'rgba(248,113,113,0.65)'},
  taper: {bg: 'bg-accent-green/40',  border: 'border-accent-green',  text: 'text-accent-green',  label: 'Taper', hex: 'rgba(74,222,128,0.65)'},
};

const WORKOUT_ICONS: Record<string, string> = {
  long_run: 'LR', tempo_run: 'T', interval_run: 'I', easy_run: 'E',
  recovery_run: 'R', gym: 'G', cycling: 'C', yoga: 'Y', cross_training: 'X', rest: '—',
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

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  weekNumber: number;
  phase: string;
  targetKm: number;
  actualKm: number | null;
  weekStart: string;
}

interface PlanOverviewProps {
  athleteId: number;
  onWeekClick?: (weekStart: string) => void;
}

export function PlanOverview({athleteId, onWeekClick}: PlanOverviewProps) {
  const [plan, setPlan] = useState<TrainingPlan | null | undefined>(undefined);
  const [weekSketches, setWeekSketches] = useState<WeekSketch[] | null>(null);
  const [actualKmByWeek, setActualKmByWeek] = useState<Record<string, number>>({});
  const [editingWeek, setEditingWeek] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [tooltip, setTooltip] = useState<TooltipState>({visible: false, x: 0, y: 0, weekNumber: 0, phase: '', targetKm: 0, actualKm: null, weekStart: ''});
  const chartRef = useRef<HTMLDivElement>(null);
  const currentMonday = getMonday();

  useEffect(() => {
    fetch(`/api/coach/plan?athleteId=${athleteId}`)
      .then(r => r.json())
      .then(setPlan)
      .catch(() => setPlan(null));

    fetch(`/api/coach/plan/sketches?athleteId=${athleteId}`)
      .then(r => r.json())
      .then((data: {weekSketches: WeekSketch[] | null; actualKmByWeek: Record<string, number>}) => {
        setWeekSketches(data.weekSketches);
        setActualKmByWeek(data.actualKmByWeek);
      })
      .catch(() => {});
  }, [athleteId]);

  const handleEditSave = async (weekStart: string) => {
    const km = parseFloat(editValue);
    if (isNaN(km) || km <= 0) { setEditingWeek(null); return; }
    await fetch(`/api/coach/plan/sketches?athleteId=${athleteId}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({weekStart, targetKm: km}),
    });
    setWeekSketches(prev => prev?.map(s => s.weekStart === weekStart ? {...s, targetKm: km} : s) ?? prev);
    setEditingWeek(null);
  };

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

  const segments: Array<{phase: string; startDate: string; endDate: string; weekCount: number; weekOffset: number}> = [];
  let weekOffset = 0;
  for (const phase of phases) {
    segments.push({...phase, weekOffset});
    weekOffset += phase.weekCount;
  }

  const currentWeekOffset = weeksBetween(planStart, currentMonday);

  // Volume chart data
  const CHART_H = 112;
  const sketches = weekSketches ?? [];
  const maxKm = sketches.length > 0 ? Math.max(...sketches.map(s => {
    const actual = actualKmByWeek[s.weekStart] ?? 0;
    return Math.max(s.targetKm, actual);
  }), 1) : 0;

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

      {/* Phase timeline */}
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
        <div className="flex justify-between mt-1">
          <span className="text-xs text-white/25">{plan.startDate}</span>
          {plan.targetDate && <span className="text-xs text-white/25">{plan.targetDate}</span>}
        </div>
      </div>

      {/* Volume chart */}
      {sketches.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-white/30">Weekly volume (km)</div>
            <div className="flex items-center gap-3 text-xs text-white/25">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-white/30" /> actual</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-accent-blue/50" /> planned</span>
            </div>
          </div>

          {/* Tooltip */}
          {tooltip.visible && (
            <div
              className="fixed z-50 pointer-events-none px-2.5 py-1.5 rounded-lg bg-neutral-900/95 border border-white/10 text-xs shadow-xl"
              style={{left: tooltip.x + 12, top: tooltip.y - 40}}
            >
              <div className={`font-semibold ${PHASE_COLORS[tooltip.phase]?.text ?? 'text-white'}`}>
                Wk {tooltip.weekNumber} · {PHASE_COLORS[tooltip.phase]?.label ?? tooltip.phase}
              </div>
              <div className="text-white/60 mt-0.5">
                Planned: <span className="text-white/90">{tooltip.targetKm} km</span>
              </div>
              {tooltip.actualKm != null && (
                <div className="text-white/60">
                  Actual: <span className="text-white/90">{tooltip.actualKm} km</span>
                </div>
              )}
            </div>
          )}

          <div
            ref={chartRef}
            className="flex items-end gap-px overflow-x-auto pb-1"
            style={{height: CHART_H + 20}}
          >
            {sketches.map(s => {
              const isCurrent = s.weekStart === currentMonday;
              const isPast = s.weekStart < currentMonday;
              const planH = Math.round((s.targetKm / maxKm) * CHART_H);
              const actual = actualKmByWeek[s.weekStart];
              const actH = actual != null ? Math.min(Math.round((actual / maxKm) * CHART_H), CHART_H + 8) : 0;
              const cfg = PHASE_COLORS[s.phase] ?? PHASE_COLORS.base;
              return (
                <div
                  key={s.weekNumber}
                  className="relative flex-1 min-w-[10px] max-w-[32px] cursor-pointer group"
                  style={{height: CHART_H}}
                  onClick={() => onWeekClick?.(s.weekStart)}
                  onMouseMove={e => setTooltip({visible: true, x: e.clientX, y: e.clientY, weekNumber: s.weekNumber, phase: s.phase, targetKm: s.targetKm, actualKm: actual ?? null, weekStart: s.weekStart})}
                  onMouseLeave={() => setTooltip(t => ({...t, visible: false}))}
                >
                  {/* Planned bar */}
                  <div
                    className={`absolute bottom-0 left-0 right-0 rounded-t-[2px] transition-opacity group-hover:opacity-80 ${isCurrent ? 'ring-1 ring-inset ' + cfg.border : ''}`}
                    style={{height: planH, backgroundColor: cfg.hex}}
                  />
                  {/* Actual bar overlay — past weeks only */}
                  {isPast && actH > 0 && (
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-t-[2px]"
                      style={{height: actH, backgroundColor: 'rgba(255,255,255,0.28)'}}
                    />
                  )}
                  {/* Current week marker */}
                  {isCurrent && (
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/70" />
                  )}
                </div>
              );
            })}
          </div>

          {/* X-axis: show label every 4 weeks */}
          <div className="flex gap-px overflow-x-auto">
            {sketches.map(s => (
              <div key={s.weekNumber} className="flex-1 min-w-[10px] max-w-[32px] text-center">
                {s.weekNumber % 4 === 1 && (
                  <span className="text-[10px] text-white/20">W{s.weekNumber}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Week-by-week table */}
      {sketches.length > 0 && (
        <div className="mb-6">
          <div className="text-xs text-white/30 mb-2">Block overview — all weeks</div>
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-950/90 backdrop-blur-sm">
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-3 py-2 text-white/30 font-medium w-12">Wk</th>
                    <th className="text-left px-3 py-2 text-white/30 font-medium">Phase</th>
                    <th className="text-left px-3 py-2 text-white/30 font-medium hidden sm:table-cell">Date</th>
                    <th className="text-right px-3 py-2 text-white/30 font-medium">Target</th>
                    <th className="text-right px-3 py-2 text-white/30 font-medium">Actual</th>
                    <th className="text-left px-3 py-2 text-white/30 font-medium hidden md:table-cell">Key sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {sketches.map(s => {
                    const isCurrent = s.weekStart === currentMonday;
                    const isPast = s.weekStart < currentMonday;
                    const actual = actualKmByWeek[s.weekStart];
                    const cfg = PHASE_COLORS[s.phase] ?? PHASE_COLORS.base;
                    const adherencePct = actual != null && s.targetKm > 0 ? Math.round((actual / s.targetKm) * 100) : null;
                    const isEditing = editingWeek === s.weekStart;
                    const isFuture = !isPast && !isCurrent;

                    return (
                      <tr
                        key={s.weekNumber}
                        className={`border-b border-white/[0.04] transition-colors cursor-pointer ${isCurrent ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'}`}
                        onClick={() => !isEditing && onWeekClick?.(s.weekStart)}
                      >
                        <td className="px-3 py-2 font-medium text-white/70 tabular-nums">
                          {isCurrent && <span className="mr-1 text-white/30">›</span>}{s.weekNumber}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`flex items-center gap-1.5 ${cfg.text}`}>
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.bg}`} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-white/30 hidden sm:table-cell tabular-nums">{s.weekStart}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {isEditing ? (
                            <input
                              autoFocus
                              className="w-14 text-right bg-white/10 border border-white/20 rounded px-1 py-0.5 text-white/90 outline-none"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => handleEditSave(s.weekStart)}
                              onKeyDown={e => { if (e.key === 'Enter') handleEditSave(s.weekStart); if (e.key === 'Escape') setEditingWeek(null); }}
                              onClick={e => e.stopPropagation()}
                            />
                          ) : (
                            <span
                              className={`text-white/80 ${isFuture ? 'cursor-text hover:text-white/100 hover:underline' : ''}`}
                              title={isFuture ? 'Click to edit target km' : undefined}
                              onClick={e => {
                                if (!isFuture) return;
                                e.stopPropagation();
                                setEditingWeek(s.weekStart);
                                setEditValue(String(s.targetKm));
                              }}
                            >
                              {s.targetKm} km
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {actual != null ? (
                            <span className={`${adherencePct != null && adherencePct >= 90 ? 'text-accent-green' : adherencePct != null && adherencePct < 70 ? 'text-accent-red/70' : 'text-white/50'}`}>
                              {actual} km
                            </span>
                          ) : isPast ? (
                            <span className="text-white/20">—</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 hidden md:table-cell">
                          <div className="flex gap-1 flex-wrap">
                            {(s.keyWorkoutTypes as WorkoutType[]).slice(0, 3).map(w => (
                              <span key={w} className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40">
                                {WORKOUT_ICONS[w] ?? w.slice(0, 2).toUpperCase()}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-white/20 mt-1.5">Click a future week's target to edit it. Click any row to jump to that week.</p>
        </div>
      )}

      {/* Phase detail cards */}
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
