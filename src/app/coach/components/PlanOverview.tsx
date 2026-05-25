'use client';

import {useState, useEffect, useRef} from 'react';
import type {TrainingPlan, TrainingPhase, WeekSketch, WorkoutType, GoalType} from '@/lib/coachTypes';

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

const GOAL_LABELS: Record<GoalType, string> = {
  marathon: 'Marathon',
  half_marathon: 'Half Marathon',
  '10k': '10K',
  '5k': '5K',
  general_fitness: 'General Fitness',
};

interface PlanOverviewProps {
  athleteId: number;
  onWeekClick?: (weekStart: string) => void;
  onPlanRestored?: () => void;
  onPlanDeleted?: () => void;
}

export function PlanOverview({athleteId, onWeekClick, onPlanRestored, onPlanDeleted}: PlanOverviewProps) {
  const [plan, setPlan] = useState<TrainingPlan | null | undefined>(undefined);
  const [weekSketches, setWeekSketches] = useState<WeekSketch[] | null>(null);
  const [actualKmByWeek, setActualKmByWeek] = useState<Record<string, number>>({});
  const [editingWeek, setEditingWeek] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [tooltip, setTooltip] = useState<TooltipState>({visible: false, x: 0, y: 0, weekNumber: 0, phase: '', targetKm: 0, actualKm: null, weekStart: ''});
  const chartRef = useRef<HTMLDivElement>(null);
  const currentMonday = getMonday();
  const [allPlans, setAllPlans] = useState<TrainingPlan[] | null>(null);
  const [showPastPlans, setShowPastPlans] = useState(false);
  const [restoringPlanId, setRestoringPlanId] = useState<number | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<number | null>(null);

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

    fetch(`/api/coach/plan/history?athleteId=${athleteId}`)
      .then(r => r.json())
      .then(setAllPlans)
      .catch(() => setAllPlans([]));
  }, [athleteId]);

  const handleRestore = async (planId: number) => {
    if (restoringPlanId !== null) return;
    setRestoringPlanId(planId);
    try {
      await fetch('/api/coach/plan', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({athleteId, restorePlanId: planId}),
      });
      onPlanRestored?.();
    } finally {
      setRestoringPlanId(null);
    }
  };

  const handleDeletePlan = async (planId: number) => {
    if (deletingPlanId !== null) return;
    setDeletingPlanId(planId);
    try {
      await fetch(`/api/coach/plan?athleteId=${athleteId}&planId=${planId}`, {method: 'DELETE'});
      setAllPlans(prev => prev?.filter(p => p.id !== planId) ?? prev);
      onPlanDeleted?.();
    } finally {
      setDeletingPlanId(null);
    }
  };

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
      <div className="space-y-3 mb-8">
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

      {/* Past plans */}
      <PastPlansSection
        allPlans={allPlans}
        activePlanId={plan.id}
        show={showPastPlans}
        onToggle={() => setShowPastPlans(v => !v)}
        restoringPlanId={restoringPlanId}
        onRestore={handleRestore}
        deletingPlanId={deletingPlanId}
        onDelete={handleDeletePlan}
      />
    </div>
  );
}

// ── Past plans section ────────────────────────────────────────────────────────

function PastPlansSection({
  allPlans,
  activePlanId,
  show,
  onToggle,
  restoringPlanId,
  onRestore,
  deletingPlanId,
  onDelete,
}: {
  allPlans: TrainingPlan[] | null;
  activePlanId: number;
  show: boolean;
  onToggle: () => void;
  restoringPlanId: number | null;
  onRestore: (planId: number) => void;
  deletingPlanId: number | null;
  onDelete: (planId: number) => void;
}) {
  const pastPlans = allPlans?.filter(p => p.id !== activePlanId) ?? [];
  const loading = allPlans === null;

  return (
    <div className="border-t border-white/[0.06] pt-6">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between text-left group mb-3"
      >
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-white/30" strokeWidth="1.5">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l4 2" />
          </svg>
          <span className="text-xs font-medium text-white/40 group-hover:text-white/60 transition-colors">
            Past training plans
          </span>
          {!loading && pastPlans.length > 0 && (
            <span className="text-[10px] bg-white/[0.06] text-white/30 px-1.5 py-0.5 rounded-full tabular-nums">
              {pastPlans.length}
            </span>
          )}
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          className={`text-white/30 transition-transform ${show ? 'rotate-180' : ''}`}
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {show && (
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/50 animate-spin" />
            </div>
          ) : pastPlans.length === 0 ? (
            <p className="text-xs text-white/25 text-center py-4">No previous plans</p>
          ) : (
            pastPlans.map(p => {
              const phases = p.phases as TrainingPhase[];
              const totalWeeks = phases.reduce((s, ph) => s + ph.weekCount, 0);
              const isRestoring = restoringPlanId === p.id;
              const isDeleting = deletingPlanId === p.id;
              const generatedDate = new Date(p.generatedAt).toLocaleDateString([], {
                month: 'short', day: 'numeric', year: 'numeric',
              });
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-white/70">
                        {GOAL_LABELS[p.goalType as GoalType] ?? p.goalType}
                      </span>
                      <span className="text-[10px] text-white/30 tabular-nums">{totalWeeks}wk</span>
                    </div>
                    <div className="text-[11px] text-white/30 tabular-nums">
                      {p.startDate}
                      {p.targetDate ? ` → ${p.targetDate}` : ''}
                    </div>
                    <div className="text-[10px] text-white/20 mt-0.5">Generated {generatedDate}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => onRestore(p.id)}
                      disabled={isRestoring || isDeleting}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.10] text-white/50 hover:text-white/80 border border-white/[0.08] transition-colors disabled:opacity-40"
                    >
                      {isRestoring ? (
                        <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                        </svg>
                      )}
                      {isRestoring ? 'Restoring…' : 'Restore'}
                    </button>
                    <button
                      onClick={() => onDelete(p.id)}
                      disabled={isDeleting || isRestoring}
                      title="Delete plan"
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-white/30 hover:text-red-400 border border-white/[0.08] hover:border-red-500/30 transition-colors disabled:opacity-40"
                    >
                      {isDeleting ? (
                        <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
