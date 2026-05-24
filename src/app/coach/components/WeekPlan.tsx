'use client';

import {useState, useEffect, useCallback} from 'react';
import {WorkoutCard} from './WorkoutCard';
import type {WeeklyPlan, PlannedDay, PlannedWorkout} from '@/lib/coachTypes';
import {COLORS} from '@/lib/activityModel';

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
const DAY_NAMES_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const TYPE_LABELS: Record<string, string> = {
  easy_run: 'Easy Run', long_run: 'Long Run', tempo_run: 'Tempo Run',
  interval_run: 'Intervals', recovery_run: 'Recovery Run', gym: 'Gym',
  cycling: 'Cycling', yoga: 'Yoga', cross_training: 'Cross Training', rest: 'Rest',
};

interface SelectedWorkout {
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
  const [selected, setSelected] = useState<SelectedWorkout | null>(null);
  const today = getMonday(new Date()) === weekStart
    ? (() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      })()
    : '';

  const fetchPlan = useCallback(async (ws: string) => {
    setLoading(true);
    setSelected(null);
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
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-sm font-semibold text-white">
            {isCurrentWeek ? 'This Week' : 'Week of'}{' '}
            {new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}
            {' – '}
            {new Date(weekEnd + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}
          </span>
          {plan && (
            <span className="ml-2 text-xs text-white/40 capitalize">
              {plan.phase} phase · Week {plan.weekNumber}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={prevWeek}
            className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] flex items-center justify-center transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            onClick={nextWeek}
            className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] flex items-center justify-center transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Coach notes */}
      {plan?.coachNotes && (
        <div className="mb-3 rounded-xl bg-accent-blue/10 border border-accent-blue/20 px-3 py-2 text-xs text-white/70 leading-relaxed">
          <span className="text-accent-blue font-medium">Coach: </span>{plan.coachNotes}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-7 gap-2">
          {Array.from({length: 7}).map((_, i) => (
            <div key={i} className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-2 min-h-[100px] animate-pulse" />
          ))}
        </div>
      ) : plan ? (
        <>
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
                    {isToday && <span className="ml-1 text-accent-blue">·</span>}
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
                          selected={selected?.date === date && selected?.workoutIndex === wi}
                          onClick={() => handleWorkoutClick(i, wi, w)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Workout detail panel */}
          {selected && (
            <WorkoutDetailPanel
              selected={selected}
              athleteId={athleteId}
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
            />
          )}
        </>
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

interface MatchCandidate {
  id: number;
  name: string;
  type: string;
  date: string;
  distanceKm: number;
  durationMin: number;
  avgPace: string;
  startTime: string | null;
  matchScore: number;
  isBestMatch: boolean;
  alreadyLinked: boolean;
}

const ACTIVITY_TYPE_ICON: Record<string, string> = {
  Run: '🏃',
  Ride: '🚴',
  Hike: '🥾',
  Swim: '🏊',
};

function WorkoutDetailPanel({
  selected,
  athleteId,
  onClose,
  canLink,
  onMarkDone,
}: {
  selected: SelectedWorkout;
  athleteId: number;
  onClose: () => void;
  canLink: boolean;
  onMarkDone: (stravaActivityId: number) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [candidates, setCandidates] = useState<MatchCandidate[] | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [activityIdInput, setActivityIdInput] = useState('');
  const {workout, dayIndex} = selected;
  const label = TYPE_LABELS[workout.type] ?? workout.type;

  const TYPE_CONFIG: Record<string, {color: string; icon: string; accent: string}> = {
    easy_run:     {color: 'border-accent-green/30 bg-accent-green/5',   icon: '🏃', accent: COLORS.green},
    long_run:     {color: 'border-accent-green/30 bg-accent-green/5',   icon: '🏃', accent: COLORS.green},
    tempo_run:    {color: 'border-accent-yellow/30 bg-accent-yellow/5', icon: '⚡', accent: COLORS.yellow},
    interval_run: {color: 'border-accent-red/30 bg-accent-red/5',       icon: '🔥', accent: COLORS.red},
    recovery_run: {color: 'border-[#64d2ff]/30 bg-[#64d2ff]/5',         icon: '🌊', accent: '#64d2ff'},
    gym:          {color: 'border-accent-orange/30 bg-accent-orange/5', icon: '🏋️', accent: COLORS.orange},
    cycling:      {color: 'border-accent-blue/30 bg-accent-blue/5',     icon: '🚴', accent: COLORS.blue},
    yoga:         {color: 'border-accent-purple/30 bg-accent-purple/5', icon: '🧘', accent: COLORS.purple},
    cross_training:{color: 'border-[#64d2ff]/30 bg-[#64d2ff]/5',        icon: '💪', accent: '#64d2ff'},
    rest:         {color: 'border-white/10 bg-white/[0.02]',            icon: '😴', accent: '#ffffff60'},
  };

  const cfg = TYPE_CONFIG[workout.type] ?? TYPE_CONFIG.rest;

  return (
    <div className={`mt-3 rounded-2xl border p-4 ${cfg.color} animate-in slide-in-from-top-2 duration-200`}>
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{cfg.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{label}</span>
              {workout.completed && (
                <span className="text-xs text-accent-green font-medium bg-accent-green/10 px-2 py-0.5 rounded-full">✓ Done</span>
              )}
            </div>
            <div className="text-xs text-white/40 mt-0.5">
              {DAY_NAMES_FULL[dayIndex]}
              {workout.distanceKm && <span> · {workout.distanceKm} km</span>}
              {!workout.distanceKm && workout.durationMinutes && <span> · {workout.durationMinutes} min</span>}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.14] flex items-center justify-center transition-colors flex-shrink-0"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Intensity / effort */}
      {workout.intensityDescription && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-1">Effort Level</div>
          <p className="text-sm text-white/75 leading-relaxed">{workout.intensityDescription}</p>
        </div>
      )}

      {/* Specific instructions */}
      {workout.specificInstructions && (
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-3">
          <div className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-2">Session Instructions</div>
          <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{workout.specificInstructions}</p>
        </div>
      )}

      {/* Strava link */}
      {workout.completed && workout.linkedStravaActivityId && (
        <a
          href={`https://www.strava.com/activities/${workout.linkedStravaActivityId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-brand hover:underline"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          View on Strava
        </a>
      )}

      {/* Mark done */}
      {!workout.completed && canLink && !showPicker && (
        <button
          onClick={() => {
            setShowPicker(true);
            setLoadingCandidates(true);
            const params = new URLSearchParams({
              athleteId: String(athleteId),
              date: selected.date,
              plannedType: workout.type,
            });
            if (workout.distanceKm) params.set('plannedDistance', String(workout.distanceKm));
            if (workout.durationMinutes) params.set('plannedDuration', String(workout.durationMinutes));
            fetch(`/api/coach/match-candidates?${params.toString()}`)
              .then(r => r.json())
              .then((data: {candidates: MatchCandidate[]}) => setCandidates(data.candidates ?? []))
              .catch(() => setCandidates([]))
              .finally(() => setLoadingCandidates(false));
          }}
          className="mt-3 text-xs text-white/50 hover:text-white/80 underline transition-colors"
        >
          Mark complete
        </button>
      )}
      {!workout.completed && canLink && showPicker && (
        <div className="mt-3 space-y-2.5">
          {loadingCandidates ? (
            <div className="flex items-center gap-2 text-xs text-white/40">
              <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Finding your activities…
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-semibold">
                  {candidates && candidates.length > 0 ? 'Pick the matching activity' : 'No nearby activities'}
                </p>
                <button
                  onClick={() => { setShowPicker(false); setCandidates(null); setManualMode(false); setActivityIdInput(''); }}
                  className="text-[10px] text-white/30 hover:text-white/60 transition-colors uppercase tracking-wider"
                >
                  Cancel
                </button>
              </div>

              {candidates && candidates.length > 0 && !manualMode && (
                <div className="space-y-1.5">
                  {candidates.slice(0, 5).map(c => {
                    const icon = ACTIVITY_TYPE_ICON[c.type] ?? '🏃';
                    return (
                      <button
                        key={c.id}
                        onClick={() => { if (!c.alreadyLinked) onMarkDone(c.id); }}
                        disabled={c.alreadyLinked}
                        className={`w-full text-left rounded-xl border px-3 py-2 transition-all ${
                          c.alreadyLinked
                            ? 'border-white/[0.06] bg-white/[0.02] opacity-50 cursor-not-allowed'
                            : c.isBestMatch
                              ? 'border-accent-green/40 bg-accent-green/10 hover:bg-accent-green/15'
                              : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/15'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="text-base leading-none mt-0.5">{icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium text-white truncate">{c.name}</span>
                              {c.isBestMatch && (
                                <span className="text-[9px] uppercase tracking-wider text-accent-green font-bold bg-accent-green/15 px-1.5 py-0.5 rounded">Best match</span>
                              )}
                              {c.alreadyLinked && (
                                <span className="text-[9px] uppercase tracking-wider text-white/40 font-medium bg-white/[0.06] px-1.5 py-0.5 rounded">Already linked</span>
                              )}
                            </div>
                            <div className="text-xs text-white/50 mt-0.5 flex items-center gap-1.5 flex-wrap">
                              {c.distanceKm > 0 && <span>{c.distanceKm} km</span>}
                              {c.durationMin > 0 && <span>· {c.durationMin >= 60 ? `${Math.floor(c.durationMin/60)}h ${c.durationMin%60}m` : `${c.durationMin}min`}</span>}
                              {c.avgPace && <span>· {c.avgPace}</span>}
                              {c.startTime && <span className="text-white/30">· {c.startTime}</span>}
                              {c.date !== selected.date && <span className="text-white/30">· {c.date}</span>}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {!manualMode && (
                <button
                  onClick={() => setManualMode(true)}
                  className="text-xs text-white/40 hover:text-white/70 underline transition-colors"
                >
                  {candidates && candidates.length > 0 ? "Don't see it? Enter ID manually" : 'Enter ID manually'}
                </button>
              )}

              {manualMode && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="number"
                    placeholder="e.g. 14823650471"
                    value={activityIdInput}
                    onChange={e => setActivityIdInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && activityIdInput) {
                        onMarkDone(Number(activityIdInput));
                      }
                    }}
                    className="flex-1 bg-white/[0.06] border border-white/[0.10] rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-accent-blue/60 font-mono"
                    autoFocus
                  />
                  <button
                    onClick={() => { if (activityIdInput) onMarkDone(Number(activityIdInput)); }}
                    disabled={!activityIdInput}
                    className="px-3 py-1.5 rounded-lg bg-accent-green/20 border border-accent-green/30 text-accent-green text-xs font-semibold hover:bg-accent-green/30 transition-colors disabled:opacity-40"
                  >
                    Link
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
