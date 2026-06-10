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
      {/* Header — broadsheet week nameplate */}
      <div className="flex items-end justify-between mb-4 pb-3" style={{borderBottom: '2px solid var(--color-ink)'}}>
        <div>
          <div className="kicker rust">The Week{plan ? ` · ${plan.phase} · Wk ${plan.weekNumber}` : ''}</div>
          <h2 className="h-display mt-1" style={{fontSize: 40}}>
            {isCurrentWeek ? 'This week' : 'Week of'}{' '}
            <em style={{color: 'var(--color-rust)'}}>
              {new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}
              {' – '}
              {new Date(weekEnd + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}
            </em>
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

      {/* Coach notes — marginalia */}
      {plan?.coachNotes && (
        <div className="mb-4 py-1 pl-4 body-serif" style={{borderLeft: '2px solid var(--color-rust)', fontStyle: 'italic', fontSize: 14, color: 'var(--color-ink)'}}>
          <span className="label" style={{color: 'var(--color-rust)', fontStyle: 'normal', marginRight: 6}}>Coach</span>
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
                    border: `1px solid ${isToday ? 'var(--color-rust)' : 'var(--color-ink)'}`,
                    borderWidth: isToday ? '2px' : '1px',
                    background: workouts.length === 0 && plan
                      ? 'repeating-linear-gradient(-45deg, var(--color-paper), var(--color-paper) 8px, var(--color-paper-2) 8px, var(--color-paper-2) 10px)'
                      : 'var(--color-paper)',
                  }}
                >
                  <div className="flex items-center gap-3 md:block">
                    <div className="flex items-baseline justify-between w-12 flex-shrink-0 md:w-auto md:mb-2" style={{borderBottom: '1px solid var(--color-rule)', paddingBottom: 4}}>
                      <span className="label" style={{color: isToday ? 'var(--color-rust)' : 'var(--color-ink-3)'}}>{DAY_NAMES[i]}</span>
                      <span className="num" style={{fontSize: 16, color: isToday ? 'var(--color-rust)' : 'var(--color-ink)'}}>
                        {new Date(date + 'T00:00:00').getDate()}
                      </span>
                    </div>
                    {workouts.length === 0 ? (
                      <div className="md:text-center md:pt-3 body-serif" style={{fontStyle: 'italic', fontSize: 12, color: 'var(--color-ink-3)'}}>Rest.</div>
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
          <p className="text-sm text-[var(--color-ink-2)] mb-1">Couldn&apos;t load this week&apos;s plan</p>
          <p className="text-xs text-[var(--color-ink-3)] mb-3">Check your connection and try again.</p>
          <button
            onClick={() => fetchPlan(weekStart)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] text-[var(--color-ink)] transition-colors"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-0)] p-6 text-center">
          <CalendarDays className="w-8 h-8 text-[var(--color-ink-3)] mx-auto mb-2" />
          <p className="text-sm text-[var(--color-ink-3)] mb-1">No plan for this week yet</p>
          <p className="text-xs text-[var(--color-ink-3)]">Ask the coach to generate your weekly schedule</p>
        </div>
      )}
    </div>
  );
}
