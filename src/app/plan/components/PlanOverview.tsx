'use client';

import {useState, useEffect, useRef} from 'react';
import type {TrainingPlan, TrainingPhase, WeekSketch, WorkoutType, GoalType} from '@/lib/coachTypes';
import {useTrainingPlan} from '@/hooks/useStrava';

// Phase palette — base / build / peak / taper movements (Apple system, bright).
const PHASE_COLORS: Record<string, {bg: string; activeBg: string; border: string; text: string; label: string; hex: string}> = {
  base:  {bg: 'bg-accent-green/25',  activeBg: 'bg-accent-green/55',  border: 'border-accent-green',  text: 'text-accent-green',  label: 'Base',  hex: '#30d158'},
  build: {bg: 'bg-accent-yellow/25', activeBg: 'bg-accent-yellow/55', border: 'border-accent-yellow', text: 'text-accent-yellow', label: 'Build', hex: '#ffd60a'},
  peak:  {bg: 'bg-accent-red/25',    activeBg: 'bg-accent-red/55',    border: 'border-accent-red',    text: 'text-accent-red',    label: 'Peak',  hex: '#ff453a'},
  taper: {bg: 'bg-accent-blue/25',   activeBg: 'bg-accent-blue/55',   border: 'border-accent-blue',   text: 'text-accent-blue',   label: 'Taper', hex: '#0a84ff'},
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
  const {plan} = useTrainingPlan();
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
    return <div className="h-40 rounded-2xl bg-[var(--color-surface-0)] border border-[var(--color-border)] animate-pulse" />;
  }

  if (!plan) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-0)] p-8 text-center">
        <div className="text-3xl mb-3">🗺️</div>
        <p className="text-sm text-[var(--faint)] mb-1">No training plan yet</p>
        <p className="text-xs text-[var(--faint)]">Ask the coach to create your periodized training plan</p>
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
      {/* Block nameplate */}
      <div className="mb-4">
        <div className="lbl" style={{color: 'var(--accent)'}}>A PLAN IN {phases.length} MOVEMENTS</div>
        <h2 style={{fontSize: 'var(--fs-xl)', fontWeight: 600, letterSpacing: '-0.02em', marginTop: 4, lineHeight: 1.05}}>
          The Block <span className="mono" style={{color: 'var(--accent)', fontSize: 16, fontWeight: 600}}>{totalWeeks} wks</span>
        </h2>
      </div>

      {/* Phase summary chips */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {phases.map((p, i) => {
          const cfg = PHASE_COLORS[p.phase] ?? PHASE_COLORS.base;
          return (
            <span key={i} className={`phase-tag phase-${p.phase}`} style={{border: '1px solid var(--line-2)', borderRadius: 980, padding: '4px 10px'}}>
              {cfg.label} · {p.weekCount}wk
            </span>
          );
        })}
        <span className="lbl ml-auto">{totalWeeks} weeks total</span>
      </div>

      {/* Phase timeline + Volume chart — shared grid so blocks align with bars */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-[var(--faint)]">Phase timeline</div>
          {sketches.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-[var(--faint)]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm" style={{background: 'rgba(255,255,255,0.32)'}} /> actual</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-[var(--color-accent)]/40" /> planned</span>
            </div>
          )}
        </div>

        {tooltip.visible && (
          <div
            className="fixed z-50 pointer-events-none px-2.5 py-1.5 rounded-lg border text-xs shadow-xl"
            style={{background: 'var(--color-surface-0)', borderColor: 'var(--color-border)', left: tooltip.x + 12, top: tooltip.y - 40}}
          >
            <div className={`font-semibold ${PHASE_COLORS[tooltip.phase]?.text ?? 'text-[var(--text)]'}`}>
              Wk {tooltip.weekNumber} · {PHASE_COLORS[tooltip.phase]?.label ?? tooltip.phase}
            </div>
            <div className="text-[var(--dim)] mt-0.5">
              Planned: <span className="text-[var(--text)]">{tooltip.targetKm} km</span>
            </div>
            {tooltip.actualKm != null && (
              <div className="text-[var(--dim)]">
                Actual: <span className="text-[var(--text)]">{tooltip.actualKm} km</span>
              </div>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          {/* Phase blocks row */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${totalWeeks}, 1fr)`,
              gap: '1px',
              height: 40,
            }}
          >
            {segments.map((seg, i) => {
              const cfg = PHASE_COLORS[seg.phase] ?? PHASE_COLORS.base;
              const isCurrent = currentWeekOffset >= seg.weekOffset && currentWeekOffset < seg.weekOffset + seg.weekCount;
              const progress = isCurrent
                ? Math.min(1, Math.max(0, (currentWeekOffset - seg.weekOffset) / seg.weekCount))
                : 0;
              return (
                <div
                  key={i}
                  className={`relative flex items-center justify-center cursor-pointer overflow-hidden transition-opacity ${cfg.bg} ${!isCurrent ? 'opacity-35 hover:opacity-55' : ''}`}
                  style={{gridColumn: `span ${seg.weekCount}`}}
                  title={`${cfg.label}: ${seg.startDate} → ${seg.endDate}`}
                  onClick={() => onWeekClick?.(seg.startDate)}
                >
                  {isCurrent && (
                    <div
                      className="absolute inset-y-0 left-0 pointer-events-none"
                      style={{width: `${progress * 100}%`, background: `color-mix(in srgb, ${cfg.hex} 38%, transparent)`}}
                    />
                  )}
                  {isCurrent && (
                    <div
                      className="absolute top-0 bottom-0 w-px pointer-events-none"
                      style={{left: `${progress * 100}%`, background: cfg.hex}}
                    />
                  )}
                  <span className={`relative z-10 text-xs font-bold uppercase tracking-wide ${cfg.text} select-none`}>
                    {seg.weekCount > 2 ? cfg.label : ''}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Weekly volume bars — same grid columns so bars align with phase blocks above */}
          {sketches.length > 0 && (
            <>
              <div
                ref={chartRef}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${totalWeeks}, 1fr)`,
                  gap: '1px',
                  height: CHART_H + 20,
                  alignItems: 'end',
                  marginTop: 8,
                }}
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
                      className="relative cursor-pointer group"
                      style={{height: CHART_H}}
                      onClick={() => onWeekClick?.(s.weekStart)}
                      onMouseMove={e => setTooltip({visible: true, x: e.clientX, y: e.clientY, weekNumber: s.weekNumber, phase: s.phase, targetKm: s.targetKm, actualKm: actual ?? null, weekStart: s.weekStart})}
                      onMouseLeave={() => setTooltip(t => ({...t, visible: false}))}
                    >
                      <div
                        className={`absolute bottom-0 left-0 right-0 rounded-t-[2px] transition-opacity group-hover:opacity-80 ${isCurrent ? 'ring-1 ring-inset ' + cfg.border : ''}`}
                        style={{height: planH, backgroundColor: cfg.hex}}
                      />
                      {isPast && actH > 0 && (
                        <div
                          className="absolute bottom-0 left-0 right-0 rounded-t-[2px]"
                          style={{height: actH, backgroundColor: 'rgba(255,255,255,0.3)'}}
                        />
                      )}
                      {isCurrent && (
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--bg)]/70" />
                      )}
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${totalWeeks}, 1fr)`,
                  gap: '1px',
                }}
              >
                {sketches.map(s => (
                  <div key={s.weekNumber} className="text-center">
                    {s.weekNumber % 4 === 1 && (
                      <span className="text-[10px] text-[var(--faint)]">W{s.weekNumber}</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-between mt-1">
          <span className="text-xs text-[var(--faint)]">{plan.startDate}</span>
          {plan.targetDate && <span className="text-xs text-[var(--faint)]">{plan.targetDate}</span>}
        </div>
      </div>

      {/* Week-by-week table */}
      {sketches.length > 0 && (
        <div className="mb-6">
          <div className="text-xs text-[var(--faint)] mb-2">Block overview · all weeks</div>
          <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0" style={{background: 'var(--color-surface-0)'}}>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="text-left px-3 py-2 text-[var(--faint)] font-medium w-12">Wk</th>
                    <th className="text-left px-3 py-2 text-[var(--faint)] font-medium">Phase</th>
                    <th className="text-left px-3 py-2 text-[var(--faint)] font-medium hidden sm:table-cell">Date</th>
                    <th className="text-right px-3 py-2 text-[var(--faint)] font-medium">Target</th>
                    <th className="text-right px-3 py-2 text-[var(--faint)] font-medium">Actual</th>
                    <th className="text-left px-3 py-2 text-[var(--faint)] font-medium hidden md:table-cell">Key sessions</th>
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
                        className={`border-b border-[var(--color-border)] transition-colors cursor-pointer ${isCurrent ? 'bg-[var(--color-surface-1)]' : 'hover:bg-[var(--color-surface-1)]/50'}`}
                        onClick={() => !isEditing && onWeekClick?.(s.weekStart)}
                      >
                        <td className="px-3 py-2 font-medium text-[var(--text)] tabular-nums">
                          {isCurrent && <span className="mr-1 text-[var(--faint)]">›</span>}{s.weekNumber}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`flex items-center gap-1.5 ${cfg.text}`}>
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.bg}`} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[var(--faint)] hidden sm:table-cell tabular-nums">{s.weekStart}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {isEditing ? (
                            <input
                              autoFocus
                              className="w-14 text-right bg-[var(--panel)] border border-[var(--line)] rounded px-1 py-0.5 text-[var(--text)] outline-none"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => handleEditSave(s.weekStart)}
                              onKeyDown={e => { if (e.key === 'Enter') handleEditSave(s.weekStart); if (e.key === 'Escape') setEditingWeek(null); }}
                              onClick={e => e.stopPropagation()}
                            />
                          ) : (
                            <span
                              className={`text-[var(--text)] ${isFuture ? 'cursor-text hover:text-[var(--faint)]0 hover:underline' : ''}`}
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
                            <span className={`${adherencePct != null && adherencePct >= 90 ? 'text-accent-green' : adherencePct != null && adherencePct < 70 ? 'text-accent-red/70' : 'text-[var(--dim)]'}`}>
                              {actual} km
                            </span>
                          ) : isPast ? (
                            <span className="text-[var(--faint)]">—</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 hidden md:table-cell">
                          <div className="flex gap-1 flex-wrap">
                            {(s.keyWorkoutTypes as WorkoutType[]).slice(0, 3).map(w => (
                              <span key={w} className="px-1.5 py-0.5 rounded bg-[var(--color-surface-1)] text-[var(--faint)]">
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
          <p className="text-[10px] text-[var(--faint)] mt-1.5">Click a future week's target to edit it. Click any row to jump to that week.</p>
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
              className={`rounded-2xl border p-4 ${isCurrentPhase ? `${cfg.border}/40 bg-[var(--color-surface-1)]` : 'border-[var(--color-border)] bg-[var(--color-surface-0)]'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${cfg.text}`}>{cfg.label}</span>
                  {isCurrentPhase && (
                    <span className="text-xs bg-[var(--color-surface-2)] text-[var(--dim)] px-2 py-0.5 rounded-full">Current</span>
                  )}
                </div>
                <span className="text-xs text-[var(--faint)]">{p.weekCount} weeks · {p.startDate} → {p.endDate}</span>
              </div>
              <p className="text-sm text-[var(--text)] mb-2">{p.focusDescription}</p>
              <div className="flex items-center justify-between">
                <div className="text-xs text-[var(--faint)]">
                  Target: {p.targetWeeklyKmRange[0]}–{p.targetWeeklyKmRange[1]} km/week
                </div>
                <div className="flex gap-1 flex-wrap justify-end">
                  {p.keyWorkouts.slice(0, 3).map(w => (
                    <span key={w} className="text-xs bg-[var(--color-surface-1)] text-[var(--dim)] px-2 py-0.5 rounded-full">{w}</span>
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
    <div className="border-t border-[var(--color-border)] pt-6">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between text-left group mb-3"
      >
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-[var(--faint)]" strokeWidth="1.5">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l4 2" />
          </svg>
          <span className="text-xs font-medium text-[var(--faint)] group-hover:text-[var(--dim)] transition-colors">
            Past training plans
          </span>
          {!loading && pastPlans.length > 0 && (
            <span className="text-[10px] bg-[var(--color-surface-1)] text-[var(--faint)] px-1.5 py-0.5 rounded-full tabular-nums">
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
          className={`text-[var(--faint)] transition-transform ${show ? 'rotate-180' : ''}`}
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {show && (
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-4 h-4 rounded-full border-2 border-[var(--line)] border-t-white/50 animate-spin" />
            </div>
          ) : pastPlans.length === 0 ? (
            <p className="text-xs text-[var(--faint)] text-center py-4">No previous plans</p>
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
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-3 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-[var(--text)]">
                        {GOAL_LABELS[p.goalType as GoalType] ?? p.goalType}
                      </span>
                      <span className="text-[10px] text-[var(--faint)] tabular-nums">{totalWeeks}wk</span>
                    </div>
                    <div className="text-[11px] text-[var(--faint)] tabular-nums">
                      {p.startDate}
                      {p.targetDate ? ` → ${p.targetDate}` : ''}
                    </div>
                    <div className="text-[10px] text-[var(--faint)] mt-0.5">Generated {generatedDate}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => onRestore(p.id)}
                      disabled={isRestoring || isDeleting}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] text-[var(--dim)] hover:text-[var(--text)] border border-[var(--color-border)] transition-colors disabled:opacity-40"
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
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--color-accent-dim)] text-[var(--faint)] hover:text-[var(--color-accent-red)] border border-[var(--line)] hover:border-[var(--color-accent-red)] transition-colors disabled:opacity-40"
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
