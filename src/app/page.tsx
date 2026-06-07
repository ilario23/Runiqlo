'use client';

import {useState, useMemo, useEffect, useRef, useCallback} from 'react';
import Link from 'next/link';
import AppHeader from '@/components/AppHeader';
import {ConnectPrompt} from '@/components/ConnectPrompt';
import {motion} from 'framer-motion';
import {ArrowRight} from 'lucide-react';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {
  useDashboardActivities,
  useFitnessData,
  useForceRefreshActivities,
} from '@/hooks/useStrava';
import {formatPace} from '@/lib/activityModel';
import {Skeleton} from '@/components/ui/skeleton';
import {TopoFitnessChart} from '@/components/rq/TopoFitnessChart';
import type {ActivitySummary} from '@/lib/activityModel';
import type {FitnessDataPoint} from '@/utils/trainingLoad';
import type {WeeklyPlan} from '@/lib/coachTypes';

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmtNum = (n: number | undefined, dec = 1) =>
  typeof n === 'number' ? n.toFixed(dec) : '—';

const signed = (n: number, dec = 1) => `${n > 0 ? '+' : ''}${n.toFixed(dec)}`;

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
  easy_run: 'Easy Run',
  long_run: 'Long Run',
  tempo_run: 'Tempo Run',
  interval_run: 'Intervals',
  recovery_run: 'Recovery Run',
  gym: 'Gym',
  cycling: 'Cycling',
  yoga: 'Yoga',
  cross_training: 'Cross Training',
  rest: 'Rest Day',
  swim: 'Swim',
  walk: 'Walk',
  hike: 'Hike',
};

const QUALITY_TYPES = new Set(['tempo_run', 'interval_run']);

function useCountUp(target: number | undefined, duration = 550): number | undefined {
  const [display, setDisplay] = useState<number | undefined>(target);
  const prev = useRef<number | undefined>(undefined);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (target === undefined) {
      setDisplay(undefined);
      return;
    }
    const from = prev.current;
    prev.current = target;
    if (from === undefined || from === target) {
      setDisplay(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (target - from) * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return display;
}

// ── TSB → editorial form copy ──

type FormState = {word: string; deck: string; rust: boolean};

function formState(tsb: number | undefined): FormState | null {
  if (tsb === undefined) return null;
  if (tsb > 15) return {word: 'Rested.', deck: 'Form is high — fitness may be slipping. Time to put work back in.', rust: false};
  if (tsb > 5) return {word: 'Fresh.', deck: 'Fatigue is settled and fitness holds. The window for hard work is open — and short.', rust: true};
  if (tsb > -10) return {word: 'Building.', deck: 'Productive load. Fitness is rising faster than fatigue can catch it.', rust: false};
  if (tsb > -20) return {word: 'Loaded.', deck: 'High training stress. Hold the line, but watch the recovery.', rust: false};
  return {word: 'Fatigued.', deck: 'Deep in the work. Recovery is the priority now, not another hard day.', rust: false};
}

// ── [hero tiles] CTL / ATL / TSB / Ramp from real fitness data ──

function HeroTiles({fitnessData, loading}: {fitnessData: FitnessDataPoint[] | undefined; loading: boolean}) {
  const stats = useMemo(() => {
    if (!fitnessData || fitnessData.length === 0) return null;
    const last = fitnessData[fitnessData.length - 1];
    const wk = fitnessData[Math.max(0, fitnessData.length - 8)];
    const ctlRamp = last.ctl - wk.ctl;
    return {
      ctl: last.ctl,
      atl: last.atl,
      tsb: last.tsb,
      ctlDelta: last.ctl - wk.ctl,
      atlDelta: last.atl - wk.atl,
      ramp: ctlRamp,
    };
  }, [fitnessData]);

  if (loading && !stats) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="tile"><Skeleton className="h-16 w-full" /></div>
        ))}
      </div>
    );
  }
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="tile">
        <div className="tile-label"><span>Fitness · CTL</span><span className="mono">42d</span></div>
        <div className="tile-num">{fmtNum(stats.ctl)}</div>
        <div className={`tile-delta ${stats.ctlDelta >= 0 ? 'up' : 'down'}`}>
          {stats.ctlDelta >= 0 ? '▲' : '▼'} {signed(stats.ctlDelta)} in last 7d
        </div>
      </div>
      <div className="tile">
        <div className="tile-label"><span>Fatigue · ATL</span><span className="mono">7d</span></div>
        <div className="tile-num">{fmtNum(stats.atl)}</div>
        <div className={`tile-delta ${stats.atlDelta >= 0 ? 'up' : 'down'}`}>
          {stats.atlDelta >= 0 ? '▲' : '▼'} {signed(stats.atlDelta)} since last week
        </div>
      </div>
      <div className="tile rust">
        <div className="tile-label"><span>Form · TSB</span><span className="mono">today</span></div>
        <div className="tile-num">{signed(stats.tsb)}</div>
        <div className="tile-delta up">Optimal: +5 to +15</div>
      </div>
      <div className="tile">
        <div className="tile-label"><span>Ramp · 7d</span><span className="mono">load</span></div>
        <div className="tile-num">{signed(stats.ramp)}</div>
        <div className="tile-delta">
          {Math.abs(stats.ramp) <= 8 ? 'healthy · cap +8.0/wk' : 'steep · ease back'}
        </div>
      </div>
    </div>
  );
}

// ── [coach's prescription] today's planned workout ──

function CoachPrescription() {
  const {athlete} = useStravaAuth();
  const [plan, setPlan] = useState<WeeklyPlan | null | undefined>(undefined);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!athlete?.id) return;
    setError(false);
    setPlan(undefined);
    const weekStart = getMondayISO();
    fetch(`/api/coach/week?athleteId=${athlete.id}&weekStart=${weekStart}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setPlan(data ?? null))
      .catch(() => setError(true));
  }, [athlete?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const todayLabel = new Date().toLocaleDateString('en-US', {weekday: 'long'});

  const Frame = ({children}: {children: React.ReactNode}) => (
    <div className="p-5 md:p-7 relative flex flex-col" style={{borderRight: '1px solid var(--color-ink)', minHeight: 280}}>
      <div className="flex items-baseline justify-between">
        <div className="kicker">Today · {todayLabel}</div>
        <div className="label" style={{color: 'var(--color-rust)'}}>From the Coach</div>
      </div>
      {children}
    </div>
  );

  if (error) {
    return (
      <Frame>
        <div className="h-section mt-2" style={{fontSize: 30}}>Couldn&apos;t reach the coach.</div>
        <p className="body-serif mt-3">Check your connection and try again.</p>
        <button type="button" onClick={load} className="btn mt-5 w-fit">Retry →</button>
      </Frame>
    );
  }

  if (plan === undefined) {
    return (
      <Frame>
        <Skeleton className="h-9 w-3/4 mt-3" />
        <Skeleton className="h-4 w-full mt-4" />
        <Skeleton className="h-4 w-2/3 mt-2" />
      </Frame>
    );
  }

  const todayISO = localDateISO();
  const todayEntry = plan?.days?.find((d) => d.date === todayISO);
  const firstWorkout = todayEntry?.workouts?.[0];

  if (!plan) {
    return (
      <Frame>
        <div className="h-display mt-2" style={{fontSize: 48}}>
          No plan <em style={{color: 'var(--color-rust)'}}>yet.</em>
        </div>
        <p className="body-serif mt-4 max-w-md" style={{fontSize: 15}}>
          Sit down with the coach and lay out a block around your goal and current form.
        </p>
        <Link href="/coach" className="btn ink mt-6 w-fit">Set up with coach →</Link>
        <Seal />
      </Frame>
    );
  }

  if (!firstWorkout) {
    return (
      <Frame>
        <div className="h-display mt-2" style={{fontSize: 56}}>
          Rest<span style={{color: 'var(--color-rust)'}}>.</span>
        </div>
        <p className="body-serif mt-3 max-w-md" style={{fontSize: 15, fontStyle: 'italic'}}>
          Nothing today. That is the workout. Recovery is where the adaptation happens.
        </p>
        <Link href="/plan" className="btn mt-6 w-fit">View this week →</Link>
        <Seal />
      </Frame>
    );
  }

  const label = WORKOUT_LABELS[firstWorkout.type] ?? firstWorkout.type;
  const distance = firstWorkout.distanceKm ? `${firstWorkout.distanceKm}` : null;
  const duration = firstWorkout.durationMinutes ?? null;

  return (
    <Frame>
      <div className="h-display mt-2" style={{fontSize: 38, lineHeight: 1}}>
        {label}<span style={{color: 'var(--color-rust)'}}>.</span>
      </div>

      <div className="flex gap-7 mt-5 flex-wrap">
        {distance && (
          <div>
            <div className="label">Distance</div>
            <div className="num" style={{fontSize: 30}}>{distance}<span style={{fontSize: 13, color: 'var(--color-ink-3)'}}> km</span></div>
          </div>
        )}
        {duration && (
          <div>
            <div className="label">Duration</div>
            <div className="num" style={{fontSize: 30}}>{duration}<span style={{fontSize: 13, color: 'var(--color-ink-3)'}}> min</span></div>
          </div>
        )}
        <div>
          <div className="label">Type</div>
          <div className="num" style={{fontSize: 30, color: 'var(--color-rust)'}}>{label.split(' ')[0]}</div>
        </div>
      </div>

      {firstWorkout.intensityDescription && (
        <p className="body-serif mt-5 max-w-xl" style={{fontSize: 14.5, color: 'var(--color-ink)'}}>
          {firstWorkout.intensityDescription}
        </p>
      )}

      <div className="flex gap-2.5 mt-auto pt-6">
        <Link href="/plan" className="btn ink">Open workout →</Link>
        <Link href="/coach" className="btn">Ask the coach</Link>
      </div>
      <Seal />
    </Frame>
  );
}

function Seal() {
  return (
    <div className="seal hidden md:flex" style={{position: 'absolute', right: 28, top: 24}}>
      THE<br />ALMANAC
    </div>
  );
}

// ── [recent ledger] activities table + 7-day rolling summary ──

function RecentLedger({activities, loading}: {activities: ActivitySummary[] | undefined; loading: boolean}) {
  const all = activities ?? [];
  const rows = all.slice(0, 7);

  const rolling = useMemo(() => {
    if (!activities) return null;
    const monday = new Date(getMondayISO() + 'T00:00:00');
    const week = activities.filter((a) => new Date(a.date) >= monday);
    const km = week.reduce((s, a) => s + a.distance, 0);
    const secs = week.reduce((s, a) => s + a.duration, 0);
    const elev = week.reduce((s, a) => s + a.elevationGain, 0);
    const paced = week.filter((a) => a.avgPace > 0);
    const avgPace = paced.length ? paced.reduce((s, a) => s + a.avgPace, 0) / paced.length : 0;
    return {km, secs, elev, avgPace, count: week.length};
  }, [activities]);

  return (
    <div className="p-5 md:p-7 flex flex-col">
      <div className="flex items-baseline justify-between">
        <span className="h-section" style={{fontSize: 22}}>Recent in the field</span>
        <Link href="/activities" className="label" style={{color: 'var(--color-rust)'}}>All activities →</Link>
      </div>

      {loading && rows.length === 0 ? (
        <div className="mt-4 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-7 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="body-serif mt-6" style={{fontStyle: 'italic'}}>No activities synced yet — your latest run will appear here.</p>
      ) : (
        <table className="ledger mt-3">
          <thead>
            <tr>
              <th>Date</th>
              <th>Title</th>
              <th style={{textAlign: 'right'}}>km</th>
              <th style={{textAlign: 'right'}}>Pace</th>
              <th style={{textAlign: 'right'}}>HR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const d = new Date(a.date);
              const isLong = a.distance >= 20;
              return (
                <tr key={a.id} style={{cursor: 'pointer'}} onClick={() => (window.location.href = `/activities/${a.id}`)}>
                  <td className="mono">{`${String(d.getMonth() + 1).padStart(2, '0')}·${String(d.getDate()).padStart(2, '0')}`}</td>
                  <td className="kicker-cell">
                    {isLong && <span className="star">★ </span>}
                    {a.name}
                  </td>
                  <td className="num-cell">{a.distance > 0 ? a.distance.toFixed(1) : '—'}</td>
                  <td className="num-cell">{a.avgPace > 0 ? formatPace(a.avgPace) : '—'}</td>
                  <td className="num-cell">{a.avgHr > 0 ? Math.round(a.avgHr) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {rolling && (
        <>
          <div className="rq-rule thick" style={{margin: '16px 0 12px'}} />
          <div className="flex justify-between flex-wrap gap-4">
            <div>
              <div className="label">7-day rolling</div>
              <div className="num" style={{fontSize: 22, marginTop: 4}}>{rolling.km.toFixed(1)} <span style={{fontSize: 12, color: 'var(--color-ink-3)'}}>km</span></div>
            </div>
            <div>
              <div className="label">Sessions</div>
              <div className="num" style={{fontSize: 22, marginTop: 4}}>{rolling.count}</div>
            </div>
            <div>
              <div className="label">Avg pace</div>
              <div className="num" style={{fontSize: 22, marginTop: 4}}>{rolling.avgPace > 0 ? formatPace(rolling.avgPace) : '—'}<span style={{fontSize: 12, color: 'var(--color-ink-3)'}}>/km</span></div>
            </div>
            <div>
              <div className="label">Elevation</div>
              <div className="num" style={{fontSize: 22, marginTop: 4, color: 'var(--color-rust)'}}>{Math.round(rolling.elev)}<span style={{fontSize: 12, color: 'var(--color-ink-3)'}}> m</span></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const {isAuthenticated, isLoading: authLoading} = useStravaAuth();
  const forceRefresh = useForceRefreshActivities();

  const {data: activities, isLoading: activitiesLoading} = useDashboardActivities();
  const {data: fitnessData, isLoading: fitnessLoading} = useFitnessData();

  const last = fitnessData?.[fitnessData.length - 1];
  const form = formState(last?.tsb);
  const animatedTSB = useCountUp(last?.tsb);

  const weekStats = useMemo(() => {
    if (!activities) return null;
    const monday = new Date(getMondayISO() + 'T00:00:00');
    const week = activities.filter((a) => new Date(a.date) >= monday);
    const km = week.reduce((s, a) => s + a.distance, 0);
    const quality = week.filter((a) => QUALITY_TYPES.has(a.type)).length;
    return {km, count: week.length, quality};
  }, [activities]);

  const today = new Date();
  const dateLine = today.toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'});

  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{borderColor: 'var(--color-rule)', borderTopColor: 'var(--color-rust)'}} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <ConnectPrompt />;
  }

  return (
    <>
      <AppHeader onRefresh={forceRefresh} />

      <main className="pt-14 pb-24 md:pb-12 min-h-dvh" style={{background: 'var(--color-paper)'}}>
        <motion.div
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          transition={{duration: 0.4}}
          className="max-w-[1280px] mx-auto"
          style={{border: '1px solid var(--color-ink)', borderTop: 'none'}}
        >
          {/* ── Masthead ──────────────────────────────────────────────────── */}
          <div className="masthead">
            <div className="line">
              <span>{dateLine}</span>
            </div>
            <div className="brand">Today&apos;s Form<sup>The Runner&apos;s Almanac</sup></div>
            <div className="line">
              <span>{weekStats ? `${weekStats.km.toFixed(0)} km · this wk` : '— km'}</span>
              <span>{weekStats ? `${weekStats.count} sessions` : '—'}</span>
              <span>{weekStats ? `${weekStats.quality} quality` : '—'}</span>
            </div>
          </div>

          {/* ── Hero row ──────────────────────────────────────────────────── */}
          <div
            className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-0"
            style={{borderBottom: '1px solid var(--color-ink)'}}
          >
            <div className="p-5 md:p-8" style={{borderRight: '1px solid var(--color-rule)'}}>
              <div className="kicker rust">
                Today&apos;s Form {last ? `· TSB ${signed(last.tsb)}` : ''}
              </div>
              {fitnessLoading && !form ? (
                <Skeleton className="h-32 w-64 mt-3" />
              ) : form ? (
                <>
                  <div className="h-display mt-2" style={{fontSize: 'clamp(64px, 11vw, 132px)'}}>
                    {form.word.replace('.', '')}
                    <span style={{color: 'var(--color-rust)'}}>.</span>
                  </div>
                  <div className="deck mt-4 max-w-xl">{form.deck}</div>
                  {typeof animatedTSB === 'number' && (
                    <div className="flex gap-3 mt-6 items-center">
                      <span className="chip ink">TSB {signed(animatedTSB)}</span>
                      <span className="chip">CTL {fmtNum(last?.ctl)}</span>
                      <span className="chip">ATL {fmtNum(last?.atl)}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="deck mt-4 max-w-xl">No fitness data yet. Sync your activities to see your form.</div>
              )}
            </div>
            <div className="p-5 md:p-8">
              <HeroTiles fitnessData={fitnessData} loading={fitnessLoading} />
            </div>
          </div>

          {/* ── Topographic fitness chart ─────────────────────────────────── */}
          <div className="p-5 md:p-6" style={{borderBottom: '1px solid var(--color-rule)'}}>
            <TopoFitnessChart fitnessData={fitnessData} loading={fitnessLoading} />
          </div>

          {/* ── Footer: prescription + ledger ─────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
            <CoachPrescription />
            <RecentLedger activities={activities} loading={activitiesLoading} />
          </div>
        </motion.div>
      </main>
    </>
  );
}
