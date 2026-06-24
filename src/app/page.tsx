'use client';

import {useState, useMemo, useEffect, useRef, useCallback} from 'react';
import Link from 'next/link';
import AppHeader from '@/components/AppHeader';
import {ConnectPrompt} from '@/components/ConnectPrompt';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useSettings} from '@/contexts/SettingsContext';
import {
  useDashboardActivities,
  useFitnessData,
  useForceRefreshActivities,
  useBestEffortsData,
  useWeekPlan,
  useZoneBreakdowns,
  usePerActivityZoneBreakdowns,
} from '@/hooks/useStrava';
import {formatPace, formatDuration} from '@/lib/activityModel';
import {calcPrimaryVdot} from '@/lib/vdot';
import {decodePolyline, polylineToSvgPath} from '@/lib/polyline';
import {WorkoutDetailPanel} from '@/app/plan/components/WorkoutDetailPanel';
import type {SelectedWorkout} from '@/app/plan/components/WeekPlan';
import {Skeleton} from '@/components/ui/skeleton';
import type {ActivitySummary} from '@/lib/activityModel';
import type {FitnessDataPoint} from '@/utils/trainingLoad';
import type {WeeklyPlan, PlannedWorkout, WorkoutType} from '@/lib/coachTypes';
import {
  Tile, Readout, Tag, Icon, Mini, WorkoutDot, buildZones, formState, signed, fmtDate, workoutCfg,
} from '@/components/rq2/ui';
import {FitnessChart, FormGauge, ZoneBars, ZoneStack, RouteTrace} from '@/components/rq2/charts';

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmtInt = (n: number | undefined) => (typeof n === 'number' ? Math.round(n) : '—');

function localDateISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function getMondayISO(d = new Date()): string {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return localDateISO(monday);
}

const WORKOUT_LABELS: Record<string, string> = {
  easy_run: 'Easy Run', long_run: 'Long Run', tempo_run: 'Tempo Run', interval_run: 'Intervals',
  recovery_run: 'Recovery Run', gym: 'Gym', cycling: 'Cycling', yoga: 'Yoga',
  cross_training: 'Cross Training', rest: 'Rest Day', swim: 'Swim', walk: 'Walk', hike: 'Hike',
};
const WORKOUT_SHORT: Record<string, string> = {
  easy_run: 'Easy', long_run: 'Long', tempo_run: 'Tempo', interval_run: 'Reps',
  recovery_run: 'Recov', gym: 'Gym', cycling: 'Bike', yoga: 'Yoga',
  cross_training: 'Cross', rest: 'Rest', swim: 'Swim', walk: 'Walk', hike: 'Hike',
};
// Coach plan workout type → rq2 WORKOUT colour bucket.
const TYPE_BUCKET: Record<string, string> = {
  easy_run: 'easy', recovery_run: 'recovery', long_run: 'long', tempo_run: 'tempo',
  interval_run: 'interval', rest: 'rest',
};
const QUALITY_TYPES = new Set(['tempo_run', 'interval_run']);
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function greetingWord(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// ── Today's Form: gauge + readouts ──

function FormBlock({last}: {last: FitnessDataPoint | undefined}) {
  if (!last) return <div className="lbl" style={{textAlign: 'center', padding: '20px 0'}}>No form data yet</div>;
  const st = formState(last.tsb);
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6}}>
      <div style={{position: 'relative', width: 168, display: 'grid', placeItems: 'center'}}>
        <FormGauge tsb={last.tsb} size={168} />
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 7, textAlign: 'center'}}>
          <div className="num" style={{fontSize: 38, fontWeight: 680, color: st.color, lineHeight: 1, letterSpacing: '-0.045em'}}>
            {signed(Math.round(last.tsb))}
          </div>
          <div className="lbl" style={{color: st.color, marginTop: 5, fontSize: 9.5}}>{st.label}</div>
        </div>
      </div>
      <div style={{fontSize: 11.5, color: 'var(--dim)', textAlign: 'center'}}>{st.note}</div>
    </div>
  );
}

function FitnessReadouts({series}: {series: FitnessDataPoint[] | undefined}) {
  if (!series || series.length === 0) return null;
  const last = series[series.length - 1];
  const prev = series[series.length - 8] ?? series[0];
  const items = [
    {label: 'FITNESS · CTL', value: Math.round(last.ctl), trend: Math.round(last.ctl - prev.ctl), color: 'var(--accent)'},
    {label: 'FATIGUE · ATL', value: Math.round(last.atl), trend: Math.round(last.atl - prev.atl), color: 'var(--z5)'},
    {label: 'FORM · TSB', value: signed(Math.round(last.tsb)), trend: null as number | null, color: formState(last.tsb).color},
  ];
  return (
    <div style={{display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--gap)'}}>
      {items.map((it, i) => (
        <div key={i} style={{display: 'flex', flexDirection: 'column', gap: 2}}>
          <span className="lbl">{it.label}</span>
          <div style={{display: 'flex', alignItems: 'baseline', gap: 6}}>
            <span className="num" style={{fontSize: 'var(--fs-xl)', fontWeight: 600, color: it.color, letterSpacing: '-0.03em'}}>{it.value}</span>
            {it.trend != null && (
              <span className="mono" style={{fontSize: 10.5, color: it.trend >= 0 ? 'var(--fresh)' : 'var(--fatigue)'}}>
                {it.trend >= 0 ? '▲' : '▼'} {Math.abs(it.trend)} <span style={{color: 'var(--faint)'}}>7d</span>
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Today's Session (coach prescription) ──

function SessionCard({plan, loading, error, onRetry}: {
  plan: WeeklyPlan | null | undefined; loading: boolean; error: boolean; onRetry: () => void;
}) {
  if (error) {
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
        <div style={{fontSize: 'var(--fs-lg)', fontWeight: 650}}>Couldn&apos;t reach the coach.</div>
        <div style={{fontSize: 12.5, color: 'var(--dim)'}}>Check your connection and try again.</div>
        <button className="btn" onClick={onRetry} style={{alignSelf: 'flex-start'}}>Retry <Icon name="arrow" size={13} /></button>
      </div>
    );
  }
  if (loading || plan === undefined) {
    return <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
      <Skeleton className="h-7 w-2/3" /><Skeleton className="h-16 w-full" /><Skeleton className="h-12 w-full" />
    </div>;
  }

  const todayISO = localDateISO();
  const todayEntry = plan?.days?.find((d) => d.date === todayISO);
  const first = todayEntry?.workouts?.find((w) => w.type !== 'rest');

  if (!plan) {
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
        <div>
          <div className="lbl" style={{color: 'var(--accent)'}}>NO PLAN YET</div>
          <div style={{fontSize: 'var(--fs-lg)', fontWeight: 650, marginTop: 3}}>Set up a block</div>
        </div>
        <div style={{fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.5}}>
          Sit down with the coach and lay out a training block around your goal and current form.
        </div>
        <Link href="/coach" className="btn btn-accent" style={{alignSelf: 'flex-start'}}><Icon name="bolt" size={13} /> Set up with coach</Link>
      </div>
    );
  }

  if (!first) {
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
        <div>
          <div className="lbl" style={{color: 'var(--faint)'}}>PRESCRIBED · TODAY</div>
          <div style={{fontSize: 'var(--fs-xl)', fontWeight: 680, marginTop: 3}}>Rest.</div>
        </div>
        <div style={{fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.5}}>
          Nothing today — that is the workout. Recovery is where the adaptation happens.
        </div>
        <Link href="/plan" className="btn" style={{alignSelf: 'flex-start'}}>View this week <Icon name="arrow" size={13} /></Link>
      </div>
    );
  }

  const wk = workoutCfg(TYPE_BUCKET[first.type] ?? first.type);
  const label = WORKOUT_LABELS[first.type] ?? first.type;
  const extras = (todayEntry?.workouts ?? []).slice(1).filter((w) => w.type !== 'rest');
  // STRUCTURE: first 1-2 clauses of the intensity note (split on separators, never mid-word).
  const structure = first.intensityDescription
    ? first.intensityDescription.split(/[·.,]/).map((s) => s.trim()).filter(Boolean).slice(0, 2).join(' · ')
    : label;
  const metrics: {k: string; v: string; u?: string}[] = [
    {k: 'STRUCTURE', v: structure},
    {k: 'DISTANCE', v: first.distanceKm ? String(first.distanceKm) : '—', u: 'km'},
    {k: 'DURATION', v: first.durationMinutes ? '~' + first.durationMinutes : '—', u: 'min'},
    {k: 'TYPE', v: label.split(' ')[0]},
  ];

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
        <span style={{width: 3, alignSelf: 'stretch', background: wk.color, borderRadius: 2}} />
        <div>
          <div className="lbl" style={{color: wk.color}}>PRESCRIBED · TODAY</div>
          <div style={{fontSize: 'var(--fs-lg)', fontWeight: 650, letterSpacing: '-0.015em', marginTop: 3, lineHeight: 1.1}}>{label}</div>
        </div>
      </div>

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', overflow: 'hidden'}}>
        {metrics.map((m, i) => (
          <div key={i} style={{background: 'var(--panel)', padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 4}}>
            <span className="lbl" style={{fontSize: 8.5}}>{m.k}</span>
            <div style={{display: 'flex', alignItems: 'baseline', gap: 3}}>
              <span className="num" style={{fontSize: m.v.length > 8 ? 13 : 18, fontWeight: 600}}>{m.v}</span>
              {m.u && <span className="mono" style={{fontSize: 10, color: 'var(--faint)'}}>{m.u}</span>}
            </div>
          </div>
        ))}
      </div>

      {first.intensityDescription && (
        <div style={{display: 'flex', gap: 11, alignItems: 'flex-start', padding: '14px 16px', background: 'var(--panel-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)'}}>
          <span style={{width: 22, height: 22, borderRadius: 7, background: 'var(--accent)', color: 'var(--accent-ink)', display: 'grid', placeItems: 'center', flexShrink: 0, fontWeight: 700, fontSize: 12}}>C</span>
          <div>
            <div className="lbl" style={{marginBottom: 3}}>COACH RATIONALE</div>
            <div style={{fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5}}>{first.intensityDescription}</div>
          </div>
        </div>
      )}

      {extras.length > 0 && (
        <div style={{fontSize: 11.5, color: 'var(--dim)'}}>
          <span className="lbl" style={{color: 'var(--accent)', marginRight: 6}}>ALSO TODAY</span>
          {extras.map((w) => WORKOUT_LABELS[w.type] ?? w.type).join(' · ')}
        </div>
      )}

      <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center'}}>
        <div style={{flex: 1}} />
        <Link href="/coach" className="btn btn-ghost">Ask coach <Icon name="arrow" size={13} /></Link>
        <Link href="/plan" className="btn btn-accent"><Icon name="bolt" size={13} /> Open workout</Link>
      </div>
    </div>
  );
}

// ── Last Run card ──

function LastRunCard({activity, zoneFractions}: {activity: ActivitySummary | undefined; zoneFractions: number[] | null}) {
  const {settings} = useSettings();
  const poly = activity?.polyline;
  const routeD = useMemo(() => {
    if (!poly) return null;
    try {
      const pts = decodePolyline(poly);
      return pts.length > 1 ? polylineToSvgPath(pts, 100, 100, 8) : null;
    } catch { return null; }
  }, [poly]);
  if (!activity) return <div className="lbl" style={{padding: '14px 0'}}>No activity synced yet.</div>;
  const a = activity;
  const zones = buildZones(settings.zones);

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
        <div>
          <div style={{fontSize: 14, fontWeight: 600}}>{a.name}</div>
          <div className="lbl" style={{marginTop: 2}}>
            {new Date(a.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})} · {a.type.toUpperCase()}
          </div>
        </div>
      </div>
      {routeD && <RouteTrace d={routeD} height={116} />}
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10}}>
        {[
          {v: a.distance > 0 ? a.distance.toFixed(1) : '—', u: 'km'},
          {v: a.avgPace > 0 ? formatPace(a.avgPace) : '—', u: '/km'},
          {v: a.avgHr > 0 ? Math.round(a.avgHr) : '—', u: 'bpm'},
          {v: Math.round(a.elevationGain), u: 'm ↑'},
        ].map((m, i) => (
          <div key={i} style={{display: 'flex', flexDirection: 'column'}}>
            <span className="num" style={{fontSize: 17, fontWeight: 600}}>{m.v}</span>
            <span className="lbl" style={{fontSize: 8.5}}>{m.u}</span>
          </div>
        ))}
      </div>
      {zoneFractions && <ZoneStack zones={zones} dist={zoneFractions} showPct={false} height={9} />}
      <Link href={`/activities/${a.id}`} className="btn btn-ghost" style={{alignSelf: 'flex-start'}}>Open analysis <Icon name="arrow" size={13} /></Link>
    </div>
  );
}

// ── This week strip (interactive — keeps WorkoutDetailPanel) ──

function workoutSummary(w: PlannedWorkout | undefined): {label: string; detail: string} | null {
  if (!w) return null;
  const label = WORKOUT_SHORT[w.type] ?? w.type;
  const parts: string[] = [];
  if (w.distanceKm) parts.push(`${w.distanceKm}k`);
  else if (w.durationMinutes) parts.push(`${w.durationMinutes}m`);
  return {label, detail: parts.join(' ')};
}

function WeekStrip({plan, loading, athleteId, weekStart, onMutated}: {
  plan: WeeklyPlan | null | undefined; loading: boolean; athleteId: number | undefined; weekStart: string; onMutated: () => void;
}) {
  const todayISO = localDateISO();
  const [selected, setSelected] = useState<SelectedWorkout | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const cells = useMemo(() => {
    const byDate = new Map((plan?.days ?? []).map((d) => [d.date, d]));
    return Array.from({length: 7}, (_, i) => {
      const d = new Date(weekStart + 'T00:00:00');
      d.setDate(d.getDate() + i);
      const iso = localDateISO(d);
      const day = byDate.get(iso);
      const workouts = (day?.workouts ?? []).filter((w) => w.type !== 'rest');
      return {iso, dayIndex: i, weekday: WEEKDAYS[i], dayNum: d.getDate(), isToday: iso === todayISO, isPast: iso < todayISO, isRest: workouts.length === 0, workouts};
    });
  }, [plan, weekStart, todayISO]);

  useEffect(() => {
    if (!selected) return;
    const day = plan?.days?.find((d) => d.date === selected.date);
    if (!day?.workouts?.[selected.workoutIndex]) setSelected(null);
  }, [plan, selected]);
  useEffect(() => {
    if (selected) setTimeout(() => detailRef.current?.scrollIntoView({behavior: 'smooth', block: 'nearest'}), 50);
  }, [selected]);

  const selectWorkout = (dayIndex: number, date: string, workoutIndex: number, workout: PlannedWorkout) => {
    setSelected((prev) => prev?.date === date && prev?.workoutIndex === workoutIndex ? null : {date, dayIndex, workoutIndex, workout});
  };

  if (loading && !plan) {
    return <div style={{display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 'var(--gap)'}}>
      {WEEKDAYS.map((d) => <Skeleton key={d} className="h-20 w-full rounded-xl" />)}
    </div>;
  }
  if (plan === null) {
    return <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap'}}>
      <span style={{fontSize: 12.5, color: 'var(--dim)'}}>No plan set. Build a block with the coach around your goal and form.</span>
      <Link href="/coach" className="btn btn-accent">Set up with coach</Link>
    </div>;
  }

  return (
    <>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 'var(--gap)'}}>
        {cells.map((c) => {
          const accent = c.isToday;
          const firstBucket = c.workouts[0] ? (TYPE_BUCKET[c.workouts[0].type] ?? c.workouts[0].type) : 'rest';
          return (
            <div key={c.iso} style={{
              border: '1px solid ' + (accent ? 'color-mix(in srgb, var(--accent) 55%, transparent)' : 'var(--line)'),
              borderRadius: 'var(--radius-sm)', padding: '11px 10px',
              background: accent ? 'color-mix(in srgb, var(--accent) 9%, var(--panel))' : 'var(--panel-2)',
              display: 'flex', flexDirection: 'column', gap: 7, minHeight: 84,
              opacity: c.isRest && c.isPast ? 0.6 : 1,
            }}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <span className="lbl" style={{color: accent ? 'var(--accent)' : 'var(--faint)'}}>{c.weekday}</span>
                {c.isToday ? <span className="live-dot" /> : c.isPast && c.workouts.some((w) => w.completed) ? <Icon name="check" size={12} stroke={2} /> : <span className="mono" style={{fontSize: 10, color: 'var(--faint)'}}>{c.dayNum}</span>}
              </div>
              <div style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 5}}>
                {c.isRest ? (
                  <div style={{display: 'flex', alignItems: 'center', gap: 5}}>
                    <WorkoutDot type="rest" size={7} />
                    <span className="mono" style={{fontSize: 10.5, color: 'var(--faint)'}}>REST</span>
                  </div>
                ) : c.workouts.map((w, wi) => {
                  const summary = workoutSummary(w);
                  const isSel = selected?.date === c.iso && selected?.workoutIndex === wi;
                  return (
                    <button key={wi} type="button" onClick={() => selectWorkout(c.dayIndex, c.iso, wi, w)}
                      className="text-left cursor-pointer" style={{background: isSel ? 'var(--panel-3)' : 'transparent', borderRadius: 6, padding: '2px 4px', margin: '0 -4px'}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: 5}}>
                        <WorkoutDot type={TYPE_BUCKET[w.type] ?? w.type} size={7} />
                        <span className="mono" style={{fontSize: 10.5, fontWeight: 600, color: accent ? 'var(--accent)' : 'var(--text)'}}>{summary?.label}</span>
                      </div>
                      {summary?.detail && <span className="mono" style={{fontSize: 9.5, color: 'var(--faint)', marginLeft: 12}}>{summary.detail}{w.completed ? ' ✓' : ''}</span>}
                    </button>
                  );
                })}
              </div>
              {/* dot keeps color reference */}
              <span style={{display: 'none'}}>{firstBucket}</span>
            </div>
          );
        })}
      </div>

      {selected && athleteId != null && (
        <div ref={detailRef} style={{marginTop: 'var(--gap)'}}>
          <WorkoutDetailPanel
            selected={selected}
            athleteId={athleteId}
            weekStart={weekStart}
            onClose={() => setSelected(null)}
            canLink={selected.date <= todayISO}
            onMarkDone={(stravaActivityId: number) => {
              fetch('/api/coach/week', {
                method: 'PUT', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({athleteId, weekStart, date: selected.date, workoutIndex: selected.workoutIndex, stravaActivityId}),
              }).then(() => onMutated());
            }}
            onConvert={(newType: WorkoutType, newDurationMinutes: number) => {
              setSelected((prev) => prev ? {...prev, workout: {...prev.workout, type: newType, durationMinutes: newDurationMinutes}} : prev);
              onMutated();
            }}
          />
        </div>
      )}
    </>
  );
}

// ── Recent ledger ──

function RecentLedger({activities, loading}: {activities: ActivitySummary[] | undefined; loading: boolean}) {
  const rows = (activities ?? []).slice(0, 8);
  if (loading && rows.length === 0) {
    return <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-7 w-full" />)}</div>;
  }
  if (rows.length === 0) return <div className="lbl">No activities synced yet.</div>;
  return (
    <table className="ledger">
      <thead>
        <tr><th>Date</th><th>Title</th><th style={{textAlign: 'right'}}>km</th><th style={{textAlign: 'right'}}>Pace</th><th style={{textAlign: 'right'}}>HR</th></tr>
      </thead>
      <tbody>
        {rows.map((a) => {
          const d = new Date(a.date);
          return (
            <tr key={a.id} style={{cursor: 'pointer'}} onClick={() => (window.location.href = `/activities/${a.id}`)}>
              <td className="mono">{`${String(d.getMonth() + 1).padStart(2, '0')}·${String(d.getDate()).padStart(2, '0')}`}</td>
              <td>{a.name}</td>
              <td className="num-cell">{a.distance > 0 ? a.distance.toFixed(1) : '—'}</td>
              <td className="num-cell">{a.avgPace > 0 ? formatPace(a.avgPace) : '—'}</td>
              <td className="num-cell">{a.avgHr > 0 ? Math.round(a.avgHr) : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Legend() {
  return (
    <div style={{display: 'flex', gap: 12}}>
      {[['FITNESS', 'var(--accent)'], ['FATIGUE', 'var(--z5)'], ['FORM', 'var(--fresh)']].map(([k, c]) => (
        <div key={k} style={{display: 'flex', alignItems: 'center', gap: 5}}>
          <span style={{width: 10, height: 2, background: c, borderRadius: 2}} />
          <span className="lbl">{k}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const {isAuthenticated, isLoading: authLoading, athlete} = useStravaAuth();
  const {settings} = useSettings();
  const forceRefresh = useForceRefreshActivities();

  const {data: activities, isLoading: activitiesLoading} = useDashboardActivities();
  const {data: fitnessData} = useFitnessData();
  const {data: zoneTotals} = useZoneBreakdowns(4);
  const {data: perActivityZones} = usePerActivityZoneBreakdowns(4);
  const {data: bestEfforts} = useBestEffortsData();

  const weekStart = getMondayISO();
  const {plan: planData, query: planQuery, invalidate: invalidatePlan} = useWeekPlan(weekStart);
  const plan = planQuery.isLoading ? undefined : (planData ?? null);
  const planError = planQuery.isError;
  const loadPlan = useCallback(() => { planQuery.refetch(); }, [planQuery]);

  const last = fitnessData?.[fitnessData.length - 1];
  const vdot = bestEfforts?.bests ? calcPrimaryVdot(bestEfforts.bests) : null;

  const zones = buildZones(settings.zones);
  const zoneMix = useMemo(() => {
    if (!zoneTotals || !zoneTotals.totalTime) return null;
    return ([1, 2, 3, 4, 5, 6] as const).map((z) => (zoneTotals.zones[z]?.time ?? 0) / zoneTotals.totalTime);
  }, [zoneTotals]);

  const lastRunZones = useMemo(() => {
    const a = activities?.[0];
    if (!a || !perActivityZones || typeof perActivityZones.get !== 'function') return null;
    const bd = perActivityZones.get(a.id);
    if (!bd) return null;
    const total = ([1, 2, 3, 4, 5, 6] as const).reduce((s, z) => s + (bd.zones[z]?.time ?? 0), 0);
    if (!total) return null;
    return ([1, 2, 3, 4, 5, 6] as const).map((z) => (bd.zones[z]?.time ?? 0) / total);
  }, [activities, perActivityZones]);

  const weekStats = useMemo(() => {
    if (!activities) return null;
    const monday = new Date(getMondayISO() + 'T00:00:00');
    const week = activities.filter((a) => new Date(a.date) >= monday);
    const km = week.reduce((s, a) => s + a.distance, 0);
    const quality = week.filter((a) => QUALITY_TYPES.has(a.type)).length;
    return {km, count: week.length, quality};
  }, [activities]);

  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{borderColor: 'var(--line-2)', borderTopColor: 'var(--accent)'}} />
      </div>
    );
  }
  if (!isAuthenticated) return <ConnectPrompt />;

  const firstName = athlete?.firstname || 'athlete';

  return (
    <>
      <AppHeader onRefresh={forceRefresh} />
      <main className="scroll" style={{minHeight: '100dvh', paddingTop: 52, paddingBottom: 96}}>
        <div className="rise" style={{padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)', maxWidth: 1320, margin: '0 auto'}}>
          {/* greeting */}
          <div style={{display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap'}}>
            <div style={{display: 'flex', flexDirection: 'column'}}>
              <h1 style={{fontSize: 'var(--fs-xl)', fontWeight: 600, letterSpacing: '-0.02em'}}>{greetingWord()}, {firstName}.</h1>
              <span className="lbl" style={{marginTop: 3}}>
                {weekStats ? `${weekStats.km.toFixed(0)} KM THIS WEEK · ${weekStats.count} SESSIONS · ${weekStats.quality} QUALITY` : 'YOUR TRAINING BRIEFING'}
              </span>
            </div>
            <div style={{flex: 1}} />
            {vdot && <Tag color="var(--accent)">VDOT {vdot.vdot.toFixed(1)}</Tag>}
            <Link href="/coach" className="btn btn-accent"><Icon name="bolt" size={13} /> Ask coach</Link>
          </div>

          {/* two-column instrument layout */}
          <div
            className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.1fr)_minmax(300px,1fr)] items-start"
            style={{gap: 'var(--gap)'}}
          >
            {/* left column */}
            <div style={{display: 'flex', flexDirection: 'column', gap: 'var(--gap)', minWidth: 0}}>
              <Tile title="Today's Session" right={<span className="lbl">{fmtDate(new Date(), {weekday: 'long', month: 'short', day: 'numeric'})}</span>}>
                <SessionCard plan={plan} loading={plan === undefined && !planError} error={planError} onRetry={loadPlan} />
              </Tile>
              <Tile title="Training Load · 90 days" right={<Legend />}>
                {fitnessData === undefined
                  ? <Skeleton className="w-full h-[216px] rounded-xl" />
                  : <FitnessChart series={fitnessData} days={90} height={216} />}
              </Tile>
              <Tile title="This Week" right={<Link href="/plan" className="lbl" style={{color: 'var(--accent)'}}>FULL PLAN →</Link>}>
                <WeekStrip plan={plan} loading={plan === undefined && !planError} athleteId={athlete?.id} weekStart={weekStart} onMutated={invalidatePlan} />
              </Tile>
              <Tile title="Recent in the field" right={<Link href="/activities" className="lbl" style={{color: 'var(--accent)'}}>ALL →</Link>} pad={false} bodyStyle={{padding: '4px var(--pad) 10px'}}>
                <RecentLedger activities={activities} loading={activitiesLoading} />
              </Tile>
            </div>

            {/* right column */}
            <div style={{display: 'flex', flexDirection: 'column', gap: 'var(--gap)', minWidth: 0}}>
              <Tile title="Today's Form" right={<Link href="/fitness" className="lbl" style={{color: 'var(--accent)'}}>ANALYTICS →</Link>}>
                <FormBlock last={last} />
                <hr className="hairline" style={{margin: '14px 0'}} />
                <FitnessReadouts series={fitnessData} />
              </Tile>
              <Tile title="Last Run">
                <LastRunCard activity={activities?.[0]} zoneFractions={lastRunZones} />
              </Tile>
              <Tile title="Zone Mix · 28d" right={<span className="lbl">TIME IN ZONE</span>}>
                {zoneMix ? <ZoneBars zones={zones} dist={zoneMix} height={94} /> : <div className="lbl" style={{padding: '20px 0', textAlign: 'center'}}>No zone data yet</div>}
              </Tile>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
