'use client';

import {useState, useEffect, useCallback, useRef} from 'react';
import {CalendarDays, Download} from 'lucide-react';
import {WorkoutCard} from './WorkoutCard';
import type {WeeklyPlan, PlannedDay, PlannedWorkout, WorkoutType} from '@/lib/coachTypes';
import {WorkoutDetailPanel} from './WorkoutDetailPanel';

function getMonday(date: Date = new Date()): string {
  const d = new Date(date);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface SelectedWorkout {
  date: string;
  dayIndex: number;
  workoutIndex: number;
  workout: PlannedWorkout;
}

interface WeekPlanProps {
  athleteId: number;
  initialWeekStart?: string;
}

export function WeekPlan({athleteId, initialWeekStart}: WeekPlanProps) {
  const [weekStart, setWeekStart] = useState(initialWeekStart ?? getMonday());
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<SelectedWorkout | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) {
      setTimeout(() => detailRef.current?.scrollIntoView({behavior: 'smooth', block: 'nearest'}), 50);
    }
  }, [selected]);
  const today = getMonday(new Date()) === weekStart
    ? (() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      })()
    : '';

  const fetchPlan = useCallback(async (ws: string, signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(false);
    setSelected(null);
    try {
      const res = await fetch(`/api/coach/week?athleteId=${athleteId}&weekStart=${ws}`, {signal});
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPlan(data);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setPlan(null);
      setLoadError(true);
    }
    setLoading(false);
  }, [athleteId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchPlan(weekStart, controller.signal);
    return () => controller.abort();
  }, [weekStart, fetchPlan]);

  const prevWeek = () => setWeekStart(addDays(weekStart, -7));
  const nextWeek = () => setWeekStart(addDays(weekStart, 7));

  const handleExport = async () => {
    if (!plan || exporting) return;
    setExporting(true);
    setExportError(false);
    try {
      const res = await fetch(`/api/coach/week/ics?athleteId=${athleteId}&weekStart=${weekStart}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `training-week-${weekStart}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setExportError(true);
      setTimeout(() => setExportError(false), 3000);
    } finally {
      setExporting(false);
    }
  };

  const weekEnd = addDays(weekStart, 6);
  const isCurrentWeek = weekStart === getMonday();

  const days: Array<PlannedDay | null> = Array.from({length: 7}, (_, i) => {
    const date = addDays(weekStart, i);
    if (!plan) return null;
    return plan.days.find(d => d.date === date) ?? {date, dayOfWeek: i, workouts: [], dayNotes: null};
  });

  const handleWorkoutClick = (dayIndex: number, workoutIndex: number, workout: PlannedWorkout) => {
    const date = addDays(weekStart, dayIndex);
    if (selected?.date === date && selected?.workoutIndex === workoutIndex) {
      setSelected(null);
    } else {
      setSelected({date, dayIndex, workoutIndex, workout});
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="lbl" style={{color: 'var(--accent)'}}>THE WEEK{plan ? ` · ${plan.phase.toUpperCase()} · WK ${plan.weekNumber}` : ''}</div>
          <h2 style={{fontSize: 'var(--fs-xl)', fontWeight: 600, letterSpacing: '-0.02em', marginTop: 4, lineHeight: 1.05}}>
            {isCurrentWeek ? 'This week ' : 'Week of '}
            <span style={{color: 'var(--accent)'}}>
              {new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}
              {' – '}
              {new Date(weekEnd + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {plan && (
            <>
              <button
                onClick={handleExport}
                disabled={exporting}
                title={exportError ? 'Export failed' : 'Export to calendar (.ics)'}
                className={`w-10 h-10 md:w-7 md:h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 ${exportError ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent-red)]' : 'bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]'}`}
              >
                <Download style={{width: '12px', height: '12px'}} />
              </button>
              <a
                href={`webcal://${typeof window !== 'undefined' ? window.location.host : ''}/api/coach/week/ics?athleteId=${athleteId}&mode=subscribe`}
                title="Subscribe to training calendar"
                className="w-10 h-10 md:w-7 md:h-7 rounded-lg bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] flex items-center justify-center transition-colors"
              >
                <CalendarDays style={{width: '12px', height: '12px'}} />
              </a>
            </>
          )}
          <button
            onClick={prevWeek}
            className="w-10 h-10 md:w-7 md:h-7 rounded-lg bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] flex items-center justify-center transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            onClick={nextWeek}
            className="w-10 h-10 md:w-7 md:h-7 rounded-lg bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] flex items-center justify-center transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Coach notes */}
      {plan?.coachNotes && (
        <div className="mb-4" style={{padding: '12px 14px', background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, lineHeight: 1.5, color: 'var(--text)'}}>
          <span className="lbl" style={{color: 'var(--accent)', marginRight: 8}}>COACH</span>
          {plan.coachNotes}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2 md:grid md:grid-cols-7">
          {Array.from({length: 7}).map((_, i) => (
            <div key={i} className="rounded-xl bg-[var(--color-surface-0)] border border-[var(--color-border)] p-2 min-h-12 md:min-h-[100px] animate-pulse" />
          ))}
        </div>
      ) : plan ? (
        <>
          <div className="flex flex-col gap-2 md:grid md:grid-cols-7">
            {days.map((day, i) => {
              const date = addDays(weekStart, i);
              const isToday = date === today;
              const workouts = day?.workouts ?? [];

              return (
                <div
                  key={date}
                  className="p-2.5 md:min-h-[120px] transition-colors"
                  style={{
                    border: `1px solid ${isToday ? 'color-mix(in srgb, var(--accent) 55%, transparent)' : 'var(--line)'}`,
                    borderRadius: 'var(--radius-sm)',
                    background: isToday
                      ? 'color-mix(in srgb, var(--accent) 9%, var(--panel))'
                      : workouts.length === 0
                        ? 'var(--panel)'
                        : 'var(--panel-2)',
                    opacity: workouts.length === 0 && !isToday ? 0.72 : 1,
                  }}
                >
                  <div className="flex items-center gap-3 md:block">
                    <div className="flex items-baseline justify-between w-12 flex-shrink-0 md:w-auto md:mb-2" style={{borderBottom: '1px solid var(--line)', paddingBottom: 4}}>
                      <span className="lbl" style={{color: isToday ? 'var(--accent)' : 'var(--faint)'}}>{DAY_NAMES[i]}</span>
                      <span className="num" style={{fontSize: 16, color: isToday ? 'var(--accent)' : 'var(--text)'}}>
                        {new Date(date + 'T00:00:00').getDate()}
                      </span>
                    </div>
                    {workouts.length === 0 ? (
                      <div className="md:text-center md:pt-3 lbl">REST</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 md:block md:space-y-1.5">
                        {workouts.map((w, wi) => (
                          <WorkoutCard
                            key={wi}
                            workout={w}
                            date={date}
                            isToday={isToday}
                            compact
                            selected={selected?.date === date && selected?.workoutIndex === wi}
                            onClick={() => handleWorkoutClick(i, wi, w)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Workout detail panel */}
          {selected && <div ref={detailRef}><WorkoutDetailPanel
              selected={selected}
              athleteId={athleteId}
              weekStart={weekStart}
              onClose={() => setSelected(null)}
              canLink={selected.date <= (today || new Date().toISOString().slice(0, 10))}
              onMarkDone={(stravaActivityId: number) => {
                fetch('/api/coach/week', {
                  method: 'PUT',
                  headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify({
                    athleteId,
                    weekStart,
                    date: selected.date,
                    workoutIndex: selected.workoutIndex,
                    stravaActivityId,
                  }),
                }).then(() => fetchPlan(weekStart));
              }}
              onConvert={(newType: WorkoutType, newDurationMinutes: number) => {
                setPlan(prev => {
                  if (!prev) return prev;
                  const days = prev.days.map(d => {
                    if (d.date !== selected.date) return d;
                    const workouts = d.workouts.map((w, wi) =>
                      wi === selected.workoutIndex
                        ? {...w, type: newType, durationMinutes: newDurationMinutes}
                        : w
                    );
                    return {...d, workouts};
                  });
                  return {...prev, days};
                });
                setSelected(prev =>
                  prev
                    ? {...prev, workout: {...prev.workout, type: newType, durationMinutes: newDurationMinutes}}
                    : prev
                );
              }}
            /></div>}
        </>
      ) : loadError ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-0)] p-6 text-center">
          <CalendarDays className="w-8 h-8 text-accent-red/60 mx-auto mb-2" />
          <p className="text-sm text-[var(--dim)] mb-1">Couldn&apos;t load this week&apos;s plan</p>
          <p className="text-xs text-[var(--faint)] mb-3">Check your connection and try again.</p>
          <button
            onClick={() => fetchPlan(weekStart)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] text-[var(--text)] transition-colors"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-0)] p-6 text-center">
          <CalendarDays className="w-8 h-8 text-[var(--faint)] mx-auto mb-2" />
          <p className="text-sm text-[var(--faint)] mb-1">No plan for this week yet</p>
          <p className="text-xs text-[var(--faint)]">Ask the coach to generate your weekly schedule</p>
        </div>
      )}
    </div>
  );
}
