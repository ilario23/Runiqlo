'use client';

import {useState, useEffect, useCallback} from 'react';
import {WorkoutCard} from './WorkoutCard';
import type {WeeklyPlan, PlannedDay} from '@/lib/coachTypes';

function getMonday(date: Date = new Date()): string {
  const d = new Date(date);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface WeekPlanProps {
  athleteId: number;
  initialWeekStart?: string;
}

export function WeekPlan({athleteId, initialWeekStart}: WeekPlanProps) {
  const [weekStart, setWeekStart] = useState(initialWeekStart ?? getMonday());
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().slice(0, 10);

  const fetchPlan = useCallback(async (ws: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/coach/week?athleteId=${athleteId}&weekStart=${ws}`);
      const data = await res.json();
      setPlan(data);
    } catch {
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => { fetchPlan(weekStart); }, [weekStart, fetchPlan]);

  const prevWeek = () => setWeekStart(addDays(weekStart, -7));
  const nextWeek = () => setWeekStart(addDays(weekStart, 7));

  const weekEnd = addDays(weekStart, 6);
  const isCurrentWeek = weekStart === getMonday();

  // Build 7-day skeleton even when no plan
  const days: Array<PlannedDay | null> = Array.from({length: 7}, (_, i) => {
    const date = addDays(weekStart, i);
    if (!plan) return null;
    return plan.days.find(d => d.date === date) ?? {date, dayOfWeek: i, workouts: [], dayNotes: null};
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-sm font-semibold text-white">
            {isCurrentWeek ? 'This Week' : 'Week of'} {new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}
            {' – '}
            {new Date(weekEnd + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}
          </span>
          {plan && (
            <span className="ml-2 text-xs text-white/40 capitalize">{plan.phase} phase · Week {plan.weekNumber}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={prevWeek} className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] flex items-center justify-center transition-colors">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button onClick={nextWeek} className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] flex items-center justify-center transition-colors">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>

      {/* Coach notes */}
      {plan?.coachNotes && (
        <div className="mb-3 rounded-xl bg-[#0a84ff]/10 border border-[#0a84ff]/20 px-3 py-2 text-xs text-white/70 leading-relaxed">
          <span className="text-[#0a84ff] font-medium">Coach: </span>{plan.coachNotes}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-7 gap-2">
          {Array.from({length: 7}).map((_, i) => (
            <div key={i} className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-2 min-h-[100px] animate-pulse" />
          ))}
        </div>
      ) : plan ? (
        <div className="grid grid-cols-7 gap-2">
          {days.map((day, i) => {
            const date = addDays(weekStart, i);
            const isToday = date === today;
            const workouts = day?.workouts ?? [];

            return (
              <div
                key={date}
                className={`rounded-xl border p-2 min-h-[100px] transition-colors ${
                  isToday
                    ? 'border-white/20 bg-white/[0.06]'
                    : 'border-white/[0.06] bg-white/[0.02]'
                }`}
              >
                <div className={`text-xs font-medium mb-2 ${isToday ? 'text-white' : 'text-white/40'}`}>
                  {DAY_NAMES[i]}
                  {isToday && <span className="ml-1 text-[#0a84ff]">·</span>}
                </div>
                {workouts.length === 0 ? (
                  <div className="text-xs text-white/20 text-center pt-2">Rest</div>
                ) : (
                  <div className="space-y-1.5">
                    {workouts.map((w, wi) => (
                      <WorkoutCard
                        key={wi}
                        workout={w}
                        date={date}
                        isToday={isToday}
                        compact
                        onMarkDone={() => {
                          const id = prompt('Enter your Strava activity ID:');
                          if (!id) return;
                          fetch('/api/coach/week', {
                            method: 'PUT',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({athleteId, weekStart, date, workoutIndex: wi, stravaActivityId: Number(id)}),
                          }).then(() => fetchPlan(weekStart));
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-6 text-center">
          <div className="text-2xl mb-2">📅</div>
          <p className="text-sm text-white/40 mb-1">No plan for this week yet</p>
          <p className="text-xs text-white/25">Ask the coach to generate your weekly schedule</p>
        </div>
      )}
    </div>
  );
}
