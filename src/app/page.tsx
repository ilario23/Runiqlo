'use client';

import {useState, useMemo, useEffect, useRef, useCallback} from 'react';
import Link from 'next/link';
import AppHeader from '@/components/AppHeader';
import {ConnectPrompt} from '@/components/ConnectPrompt';
import {motion, AnimatePresence} from 'framer-motion';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import {ArrowRight, ChevronRight} from 'lucide-react';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {
  useDashboardActivities,
  useFitnessData,
  useForceRefreshActivities,
} from '@/hooks/useStrava';
import {formatPace, formatDuration, SPORT_COLORS, COLORS} from '@/lib/activityModel';
import {Skeleton} from '@/components/ui/skeleton';
import type {ActivitySummary} from '@/lib/activityModel';
import type {FitnessDataPoint} from '@/utils/trainingLoad';
import type {WeeklyPlan} from '@/lib/coachTypes';

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});

const fmtNum = (n: number | undefined, dec = 1) =>
  typeof n === 'number' ? n.toFixed(dec) : '—';

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
    // First real value (or unchanged): show it immediately, no tween.
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

// ── Section label ──

function SectionLabel({children}: {children: React.ReactNode}) {
  return <p className="metric-label mb-3 px-0.5">{children}</p>;
}

// ── TSB → status mapping (single source of truth) ──

type TsbStatus = {label: string; sub: string; color: string};

function tsbStatus(tsb: number | undefined): TsbStatus | null {
  if (tsb === undefined) return null;
  if (tsb > 5) return {label: 'Fresh', sub: 'Good day to push hard', color: COLORS.green};
  if (tsb > -10) return {label: 'Building', sub: 'Productive training load', color: COLORS.blue};
  if (tsb > -20) return {label: 'Loaded', sub: 'High training stress', color: COLORS.orange};
  return {label: 'Fatigued', sub: 'Recovery is the priority', color: COLORS.red};
}

// ── PMC tooltip — all three series at the hovered day ──

interface PmcTooltipProps {
  active?: boolean;
  payload?: Array<{value: number; dataKey: string}>;
  label?: string;
}

function PmcTooltip({active, payload, label}: PmcTooltipProps) {
  if (!active || !payload?.length || !label) return null;
  const get = (k: string) => payload.find((p) => p.dataKey === k)?.value;
  const tsbVal = get('tsb');
  const rows: Array<{name: string; value: number | undefined; color: string; signed?: boolean}> = [
    {name: 'Fitness · CTL', value: get('ctl'), color: COLORS.blue},
    {name: 'Fatigue · ATL', value: get('atl'), color: COLORS.orange},
    {name: 'Form · TSB', value: tsbVal, color: tsbStatus(tsbVal)?.color ?? COLORS.green, signed: true},
  ];
  return (
    <div className="surface-card px-3 py-2.5 text-xs space-y-1.5 min-w-[156px]">
      <p style={{color: 'var(--color-text-2)'}}>{fmtDate(label)}</p>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{background: r.color}} />
            <span style={{color: 'var(--color-text-2)'}}>{r.name}</span>
          </span>
          <span className="font-mono font-medium tabular-nums" style={{color: 'var(--color-text-1)'}}>
            {typeof r.value === 'number'
              ? `${r.signed && r.value > 0 ? '+' : ''}${r.value.toFixed(1)}`
              : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── [1a] Form & Fitness — Performance Management Chart (CTL · ATL · TSB over time) ──

const PMC_RANGES = [
  {key: '6w', label: '6W', days: 42},
  {key: '3m', label: '3M', days: 90},
  {key: '1y', label: '1Y', days: 365},
] as const;
type PmcRangeKey = (typeof PMC_RANGES)[number]['key'];

function FormFitnessChart({
  fitnessData,
  fitnessLoading,
}: {
  fitnessData: FitnessDataPoint[] | undefined;
  fitnessLoading: boolean;
}) {
  const [range, setRange] = useState<PmcRangeKey>('3m');
  const days = PMC_RANGES.find((r) => r.key === range)!.days;

  const last = fitnessData?.[fitnessData.length - 1];
  const tsb = last?.tsb;
  const ctl = last?.ctl;
  const atl = last?.atl;
  const status = tsbStatus(tsb);
  const animatedTSB = useCountUp(tsb);
  const formColor = status?.color ?? COLORS.green;

  const data = useMemo(() => fitnessData?.slice(-days) ?? [], [fitnessData, days]);

  return (
    <div className="surface-card h-full p-6 md:p-7 flex flex-col" style={{minHeight: 340}}>
      {/* Header — current form readout + time range */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="metric-label">Form &amp; Fitness</p>
          {fitnessLoading && tsb === undefined ? (
            <Skeleton className="h-9 w-28 mt-2" />
          ) : (
            <div className="mt-2 flex items-baseline gap-2.5 flex-wrap">
              <span
                className="text-[2.75rem] font-bold font-mono tabular-nums leading-none"
                style={{color: formColor, letterSpacing: '-0.03em'}}
              >
                {typeof animatedTSB === 'number' ? `${animatedTSB > 0 ? '+' : ''}${animatedTSB.toFixed(1)}` : '—'}
              </span>
              {status && (
                <span className="text-base font-semibold" style={{color: 'var(--color-text-1)'}}>
                  {status.label}
                </span>
              )}
            </div>
          )}
          {status && (
            <p className="text-sm mt-1" style={{color: 'var(--color-text-2)'}}>
              {status.sub} · Training Stress Balance
            </p>
          )}
        </div>

        <div className="flex gap-0.5 surface-raised p-0.5" role="group" aria-label="Chart time range">
          {PMC_RANGES.map((r) => {
            const selected = range === r.key;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                aria-pressed={selected}
                className="px-2.5 py-1 rounded-[7px] text-xs font-medium transition-colors"
                style={
                  selected
                    ? {background: 'var(--color-surface-2)', color: 'var(--color-text-1)'}
                    : {color: 'var(--color-text-2)'}
                }
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend — current CTL / ATL values, Form series key */}
      <div className="flex items-center gap-5 mt-4 text-xs flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded inline-block" style={{background: COLORS.blue}} />
          <span style={{color: 'var(--color-text-2)'}}>Fitness</span>
          <span className="font-mono font-semibold tabular-nums" style={{color: 'var(--color-text-1)'}}>{fmtNum(ctl)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded inline-block opacity-70" style={{background: COLORS.orange}} />
          <span style={{color: 'var(--color-text-2)'}}>Fatigue</span>
          <span className="font-mono font-semibold tabular-nums" style={{color: 'var(--color-text-1)'}}>{fmtNum(atl)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 inline-block border-t border-dashed" style={{borderColor: formColor}} />
          <span style={{color: 'var(--color-text-2)'}}>Form</span>
        </span>
      </div>

      {/* Chart — CTL area, ATL line (left axis); TSB line (right axis, 0-baseline) */}
      <div className="flex-1 mt-4 min-h-[200px]">
        {fitnessLoading || data.length === 0 ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{top: 6, right: 0, left: 0, bottom: 0}}>
              <defs>
                <linearGradient id="gradCTL" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.blue} stopOpacity={0.28} />
                  <stop offset="95%" stopColor={COLORS.blue} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{fill: 'var(--color-text-3)', fontSize: 10}}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={44}
              />
              <YAxis yAxisId="load" hide domain={[0, 'dataMax + 8']} />
              <YAxis yAxisId="tsb" hide domain={['dataMin - 5', 'dataMax + 5']} />
              <ReferenceLine yAxisId="tsb" y={0} stroke="var(--color-border)" strokeDasharray="3 3" />
              <RechartsTooltip content={<PmcTooltip />} cursor={{stroke: 'var(--color-border)', strokeWidth: 1}} />
              <Area
                yAxisId="load" type="monotone" dataKey="ctl" name="CTL"
                stroke={COLORS.blue} strokeWidth={2.5} fill="url(#gradCTL)"
                dot={false} activeDot={{r: 4, fill: COLORS.blue}}
              />
              <Line
                yAxisId="load" type="monotone" dataKey="atl" name="ATL"
                stroke={COLORS.orange} strokeWidth={1.5} strokeOpacity={0.75}
                dot={false} activeDot={{r: 3, fill: COLORS.orange}}
              />
              <Line
                yAxisId="tsb" type="monotone" dataKey="tsb" name="TSB"
                stroke={formColor} strokeWidth={2} strokeDasharray="4 3"
                dot={false} activeDot={{r: 4, fill: formColor}}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ── [1b] Today's Workout (promoted to actionable card) ──

function TodayWorkoutCard() {
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

  const todayLabel = new Date().toLocaleDateString('en-US', {weekday: 'long', month: 'short', day: 'numeric'});

  // Network / server error — distinct from "no plan"
  if (error) {
    return (
      <div className="surface-card h-full p-6 flex flex-col" style={{minHeight: 230}}>
        <SectionLabel>Today · {todayLabel}</SectionLabel>
        <div className="flex-1 flex flex-col justify-center">
          <p className="text-base font-semibold" style={{color: 'var(--color-text-1)'}}>
            Couldn&apos;t load today&apos;s workout
          </p>
          <p className="text-sm mt-1.5" style={{color: 'var(--color-text-2)'}}>
            Check your connection and try again.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 text-sm font-medium mt-4 w-fit transition-colors hover:text-[var(--color-text-1)]"
          style={{color: 'var(--color-accent)'}}
        >
          Retry
          <ArrowRight size={15} />
        </button>
      </div>
    );
  }

  // Loading
  if (plan === undefined) {
    return (
      <div className="surface-card h-full p-6 flex flex-col" style={{minHeight: 230}}>
        <SectionLabel>Today · {todayLabel}</SectionLabel>
        <Skeleton className="h-8 w-44 mt-2" />
        <Skeleton className="h-4 w-full mt-4" />
        <Skeleton className="h-4 w-2/3 mt-2" />
      </div>
    );
  }

  const todayISO = localDateISO();
  const todayEntry = plan?.days?.find((d) => d.date === todayISO);
  const firstWorkout = todayEntry?.workouts?.[0];

  // No plan
  if (!plan) {
    return (
      <Link
        href="/coach"
        className="surface-card group h-full p-6 flex flex-col transition-colors hover:border-[var(--color-accent)]/30"
        style={{minHeight: 230}}
      >
        <SectionLabel>Today · {todayLabel}</SectionLabel>
        <div className="flex-1 flex flex-col justify-center">
          <p className="text-xl font-bold" style={{color: 'var(--color-text-1)', letterSpacing: '-0.01em'}}>
            No training plan yet
          </p>
          <p className="text-sm mt-2 max-w-xs" style={{color: 'var(--color-text-2)'}}>
            Chat with your AI coach to build a plan around your goal and current fitness.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium mt-4" style={{color: 'var(--color-accent)'}}>
          Set up with coach
          <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
        </span>
      </Link>
    );
  }

  // Rest day
  if (!firstWorkout) {
    return (
      <div className="surface-card h-full p-6 flex flex-col" style={{minHeight: 230}}>
        <SectionLabel>Today · {todayLabel}</SectionLabel>
        <div className="flex-1 flex flex-col justify-center">
          <p className="text-2xl font-bold" style={{color: 'var(--color-text-1)', letterSpacing: '-0.01em'}}>
            Rest day
          </p>
          <p className="text-sm mt-2" style={{color: 'var(--color-text-2)'}}>
            Recovery is where adaptation happens. Take it easy.
          </p>
        </div>
        <Link
          href="/plan"
          className="inline-flex items-center gap-1.5 text-sm font-medium mt-4 group w-fit"
          style={{color: 'var(--color-text-2)'}}
        >
          View this week
          <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    );
  }

  const label = WORKOUT_LABELS[firstWorkout.type] ?? firstWorkout.type;
  const duration = firstWorkout.durationMinutes ? `${firstWorkout.durationMinutes} min` : null;
  const distance = firstWorkout.distanceKm ? `${firstWorkout.distanceKm} km` : null;
  const target = [duration, distance].filter(Boolean).join(' · ');

  return (
    <Link
      href="/plan"
      className="surface-card group h-full p-6 flex flex-col transition-colors hover:border-[var(--color-accent)]/30"
      style={{minHeight: 230}}
    >
      <div className="flex items-center gap-2">
        <span className="dot-breathe w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background: 'var(--color-accent)'}} />
        <SectionLabel>Today · {todayLabel}</SectionLabel>
      </div>
      <div className="flex-1 flex flex-col justify-center">
        <h2 className="text-2xl font-bold leading-tight" style={{color: 'var(--color-text-1)', letterSpacing: '-0.01em'}}>
          {label}
        </h2>
        {target && (
          <p className="text-sm font-mono mt-1.5" style={{color: 'var(--color-accent)'}}>{target}</p>
        )}
        {firstWorkout.intensityDescription && (
          <p className="text-sm mt-3 leading-relaxed line-clamp-3" style={{color: 'var(--color-text-2)'}}>
            {firstWorkout.intensityDescription}
          </p>
        )}
      </div>
      <span className="inline-flex items-center gap-1.5 text-sm font-medium mt-4" style={{color: 'var(--color-text-2)'}}>
        Open workout
        <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
      </span>
    </Link>
  );
}

// ── [2a] Featured Last Run ──

function LastRunCard({
  activities,
  isLoading,
}: {
  activities: ActivitySummary[] | undefined;
  isLoading: boolean;
}) {
  const run = activities?.[0];
  const color = run ? (SPORT_COLORS[run.type] ?? 'var(--color-text-2)') : 'var(--color-accent)';

  if (isLoading) {
    return (
      <div className="surface-card p-6 h-full">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-64 mt-3" />
        <div className="flex gap-8 mt-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-10" />
              <Skeleton className="h-5 w-14" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="surface-card p-6 h-full flex flex-col items-center justify-center text-center" style={{minHeight: 160}}>
        <p className="text-sm" style={{color: 'var(--color-text-2)'}}>No activities synced yet</p>
        <p className="text-xs mt-1" style={{color: 'var(--color-text-3)'}}>Your latest run will appear here.</p>
      </div>
    );
  }

  const dateStr = new Date(run.date).toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});

  const stats = [
    {label: 'Distance', value: `${run.distance.toFixed(2)} km`},
    {label: 'Avg Pace', value: run.avgPace > 0 ? `${formatPace(run.avgPace)}/km` : '—'},
    {label: 'Avg HR', value: run.avgHr > 0 ? `${Math.round(run.avgHr)} bpm` : '—'},
    {label: 'Elevation', value: run.elevationGain > 0 ? `+${Math.round(run.elevationGain)} m` : '—'},
  ];

  return (
    <Link
      href={`/activities/${run.id}`}
      className="surface-card group block p-6 h-full transition-colors hover:border-[rgba(255,255,255,0.09)]"
    >
      <div className="flex items-start gap-3 mb-5">
        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{background: color}} />
        <div className="flex-1 min-w-0">
          <p className="metric-label mb-1">Latest · {dateStr} · {run.type}</p>
          <h2 className="text-xl font-bold truncate group-hover:opacity-80 transition-opacity" style={{color: 'var(--color-text-1)', letterSpacing: '-0.02em'}}>
            {run.name}
          </h2>
        </div>
        <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" style={{color: 'var(--color-text-2)'}} />
      </div>

      <div className="flex gap-6 md:gap-10 flex-wrap">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="metric-label mb-1">{s.label}</p>
            <p className="text-base font-semibold font-mono tabular-nums" style={{color: 'var(--color-text-1)'}}>{s.value}</p>
          </div>
        ))}
      </div>
    </Link>
  );
}

// ── [2b] This Week summary ──

function ThisWeekCard({
  activities,
  isLoading,
}: {
  activities: ActivitySummary[] | undefined;
  isLoading: boolean;
}) {
  const stats = useMemo(() => {
    if (!activities) return null;
    const monday = new Date(getMondayISO() + 'T00:00:00');
    const week = activities.filter((a) => new Date(a.date) >= monday);
    const km = week.reduce((s, a) => s + a.distance, 0);
    const secs = week.reduce((s, a) => s + a.duration, 0);
    const elev = week.reduce((s, a) => s + a.elevationGain, 0);
    return {km, secs, elev, count: week.length};
  }, [activities]);

  return (
    <div className="surface-card p-6 h-full flex flex-col">
      <SectionLabel>This week</SectionLabel>

      {isLoading && !stats ? (
        <div className="space-y-3 mt-1">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold font-mono tabular-nums leading-none" style={{color: 'var(--color-text-1)'}}>
              {stats ? stats.km.toFixed(1) : '0.0'}
            </span>
            <span className="metric-label">km</span>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-6 pt-5 border-t border-[var(--color-border)]">
            <div>
              <p className="text-lg font-semibold font-mono tabular-nums" style={{color: 'var(--color-text-1)'}}>
                {stats?.count ?? 0}
              </p>
              <p className="metric-label mt-0.5">{stats?.count === 1 ? 'session' : 'sessions'}</p>
            </div>
            <div>
              <p className="text-lg font-semibold font-mono tabular-nums" style={{color: 'var(--color-text-1)'}}>
                {stats ? formatDuration(stats.secs) : '0:00'}
              </p>
              <p className="metric-label mt-0.5">time</p>
            </div>
            <div>
              <p className="text-lg font-semibold font-mono tabular-nums" style={{color: 'var(--color-text-1)'}}>
                {stats ? `${Math.round(stats.elev)}` : '0'}
              </p>
              <p className="metric-label mt-0.5">m elev</p>
            </div>
          </div>

          <Link
            href="/fitness"
            className="inline-flex items-center gap-1 text-xs font-medium mt-auto pt-5 group w-fit transition-colors"
            style={{color: 'var(--color-text-2)'}}
          >
            Zone & efficiency analysis
            <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </>
      )}
    </div>
  );
}

// ── [4] Recent Activities ──

function ActivityRow({activity}: {activity: ActivitySummary}) {
  const color = SPORT_COLORS[activity.type] ?? 'var(--color-text-3)';
  const dateStr = new Date(activity.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});

  return (
    <Link
      href={`/activities/${activity.id}`}
      className="flex items-center gap-3 py-3 px-5 transition-colors cursor-pointer hover:bg-[var(--color-surface-1)]"
      style={{borderBottom: '1px solid var(--color-border)'}}
    >
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background: color}} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate leading-tight" style={{color: 'var(--color-text-1)'}}>{activity.name}</p>
        <p className="text-xs mt-0.5" style={{color: 'var(--color-text-2)'}}>{dateStr} · {activity.type}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-mono tabular-nums" style={{color: 'var(--color-text-1)'}}>{activity.distance.toFixed(1)} km</p>
        <p className="text-xs font-mono tabular-nums" style={{color: 'var(--color-text-2)'}}>
          {activity.avgPace > 0 ? `${formatPace(activity.avgPace)}/km` : ''}
          {activity.avgPace > 0 && activity.avgHr > 0 ? ' · ' : ''}
          {activity.avgHr > 0 ? `${Math.round(activity.avgHr)} bpm` : ''}
        </p>
      </div>
    </Link>
  );
}

function RecentActivitiesCard({
  activities,
  isLoading,
}: {
  activities: ActivitySummary[] | undefined;
  isLoading: boolean;
}) {
  const PAGE = 6;
  const all = activities ?? [];
  const displayed = all.slice(0, PAGE);

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4" style={{borderBottom: '1px solid var(--color-border)'}}>
        <h2 className="text-sm font-semibold" style={{color: 'var(--color-text-1)'}}>Recent Activities</h2>
        <Link href="/activities" className="inline-flex items-center gap-1 text-xs transition-colors group" style={{color: 'var(--color-text-2)'}}>
          View all
          <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {isLoading ? (
        <div className="px-5 py-2">
          {Array.from({length: 5}).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-3" style={{borderBottom: '1px solid var(--color-border)'}}>
              <Skeleton className="w-2 h-2 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2.5 w-1/3" />
              </div>
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      ) : all.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-xs" style={{color: 'var(--color-text-3)'}}>No activities yet</p>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {displayed.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{opacity: 0}}
              animate={{opacity: 1}}
              exit={{opacity: 0}}
              transition={{duration: 0.2, delay: i * 0.02}}
            >
              <ActivityRow activity={a} />
            </motion.div>
          ))}
        </AnimatePresence>
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

  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{borderColor: 'var(--color-surface-1)', borderTopColor: COLORS.blue}} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <ConnectPrompt />;
  }

  return (
    <>
      <AppHeader onRefresh={forceRefresh} />

      <main className="pt-[72px] pb-24 md:pb-10 px-5 min-h-dvh" style={{background: 'var(--color-base)'}}>
        <motion.div
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          transition={{duration: 0.4}}
          className="max-w-[1200px] mx-auto space-y-8"
        >
          {/* ── Band 1 · Right now ─────────────────────────────────────── */}
          <section>
            <SectionLabel>Right now</SectionLabel>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7">
                <FormFitnessChart fitnessData={fitnessData} fitnessLoading={fitnessLoading} />
              </div>
              <div className="lg:col-span-5">
                <TodayWorkoutCard />
              </div>
            </div>
          </section>

          {/* ── Band 2 · Latest ────────────────────────────────────────── */}
          <section>
            <SectionLabel>Latest</SectionLabel>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7">
                <LastRunCard activities={activities} isLoading={activitiesLoading} />
              </div>
              <div className="lg:col-span-5">
                <ThisWeekCard activities={activities} isLoading={activitiesLoading} />
              </div>
            </div>
          </section>

          {/* ── Band 4 · Feed ──────────────────────────────────────────── */}
          <section>
            <SectionLabel>Activity</SectionLabel>
            <RecentActivitiesCard activities={activities} isLoading={activitiesLoading} />
          </section>
        </motion.div>
      </main>
    </>
  );
}
