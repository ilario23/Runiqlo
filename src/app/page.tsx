'use client';

import {useState, useMemo, useEffect, useRef} from 'react';
import Link from 'next/link';
import AppHeader from '@/components/AppHeader';
import {ConnectPrompt} from '@/components/ConnectPrompt';
import {motion, AnimatePresence} from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import {ArrowRight, Info, ChevronRight} from 'lucide-react';
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
    const from = prev.current ?? target;
    prev.current = target;
    if (from === target) return;
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

// ── Chart tooltip ──

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{name: string; value: number; color: string}>;
  label?: string;
}

function ChartTooltip({active, payload, label}: ChartTooltipProps) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="surface-card px-3 py-2.5 text-xs space-y-1 min-w-[120px]">
      <p className="mb-1.5" style={{color: 'var(--color-text-2)'}}>{fmtDate(label)}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{background: p.color}} />
            <span style={{color: 'var(--color-text-2)'}}>{p.name}</span>
          </span>
          <span className="font-mono font-medium" style={{color: 'var(--color-text-1)'}}>{p.value?.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Stat Pill (CTL / ATL) ──

interface StatPillProps {
  label: string;
  sublabel: string;
  value: number | undefined;
  prev: number | undefined;
  color: string;
  isLoading: boolean;
  info?: string;
}

function StatPill({label, sublabel, value, prev, color, isLoading, info}: StatPillProps) {
  const animated = useCountUp(value);
  const delta = typeof value === 'number' && typeof prev === 'number' ? value - prev : undefined;
  const isUp = delta !== undefined && delta > 0;
  const isDown = delta !== undefined && delta < 0;
  const [tooltipOpen, setTooltipOpen] = useState(false);

  return (
    <div className="surface-raised px-4 py-3 flex-1 sm:flex-none sm:min-w-[120px]">
      {isLoading ? (
        <>
          <Skeleton className="h-2.5 w-12 mb-2" />
          <Skeleton className="h-7 w-16" />
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="metric-label">{label}</span>
            <span style={{color: 'var(--color-text-2)'}}>·</span>
            <span className="text-xs" style={{color: 'var(--color-text-2)'}}>{sublabel}</span>
            {info && (
              <div className="relative group flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setTooltipOpen((o) => !o)}
                  className="flex items-center cursor-pointer"
                  aria-label={`What is ${label}?`}
                >
                  <Info size={10} className="transition-colors" style={{color: 'var(--color-text-3)'}} />
                </button>
                <div
                  className={`absolute right-0 top-5 w-52 p-3 rounded-xl text-xs leading-relaxed transition-opacity duration-150 z-50 ${tooltipOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 pointer-events-none'}`}
                  style={{
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-2)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  }}
                >
                  {info}
                </div>
              </div>
            )}
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums leading-tight" style={{color}}>
            {typeof animated === 'number' ? animated.toFixed(1) : '—'}
          </p>
          {delta !== undefined && (
            <p
              className={`text-xs font-mono mt-0.5 ${isUp ? 'text-accent-green' : isDown ? 'text-accent-red' : ''}`}
              style={!isUp && !isDown ? {color: 'var(--color-text-3)'} : {}}
            >
              {isUp ? '↑' : isDown ? '↓' : '→'} {Math.abs(delta).toFixed(1)} vs 7d
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── TSB Sparkline ──

function TsbSparkline({data, color}: {data: number[]; color: string}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const zeroY = 100 - ((0 - min) / range) * 80 - 10;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((v - min) / range) * 80 - 10;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
      {min < 0 && max > 0 && (
        <line
          x1="0" y1={zeroY} x2="100" y2={zeroY}
          stroke="white" strokeWidth="1" opacity={0.06}
          vectorEffect="non-scaling-stroke" strokeDasharray="3,3"
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity={0.6}
      />
    </svg>
  );
}

// ── [1a] Form Hero (TSB) ──

function FormHero({
  fitnessData,
  fitnessLoading,
}: {
  fitnessData: FitnessDataPoint[] | undefined;
  fitnessLoading: boolean;
}) {
  const last = fitnessData?.[fitnessData.length - 1];
  const prev7 = fitnessData?.[fitnessData.length - 8];

  const tsb = last?.tsb;
  const ctl = last?.ctl;
  const atl = last?.atl;
  const animatedTSB = useCountUp(tsb);

  const status =
    tsb === undefined
      ? null
      : tsb > 5
      ? {label: 'Fresh', sub: 'Good day to push hard', color: COLORS.green}
      : tsb > -10
      ? {label: 'Building', sub: 'Normal training load', color: COLORS.blue}
      : tsb > -20
      ? {label: 'Loaded', sub: 'High training stress', color: COLORS.orange}
      : {label: 'Fatigued', sub: 'Recovery priority', color: COLORS.red};

  const tsbHistory = useMemo(
    () => fitnessData?.slice(-14).map((d) => d.tsb) ?? [],
    [fitnessData],
  );

  return (
    <div
      className="surface-card relative overflow-hidden h-full p-6 md:p-7 flex flex-col justify-between"
      style={{minHeight: 230}}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{background: 'radial-gradient(ellipse 50% 70% at 0% 40%, var(--color-accent-dim) 0%, transparent 70%)'}}
      />

      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="metric-label">Form · TSB</p>
          {tsbHistory.length >= 2 && (
            <div className="w-20 h-7 opacity-90">
              <TsbSparkline data={tsbHistory} color={status?.color ?? COLORS.blue} />
            </div>
          )}
        </div>

        {fitnessLoading && tsb === undefined ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-16 w-32" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : (
          <div className="mt-3">
            <p className="metric-display" style={{color: status?.color ?? 'var(--color-text-1)'}}>
              {typeof animatedTSB === 'number' ? `${animatedTSB > 0 ? '+' : ''}${animatedTSB.toFixed(1)}` : '—'}
            </p>
            {status && (
              <div className="mt-2">
                <p className="text-base font-semibold leading-tight" style={{color: 'var(--color-text-1)'}}>
                  {status.label}
                </p>
                <p className="text-sm mt-0.5" style={{color: 'var(--color-text-2)'}}>{status.sub}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CTL + ATL */}
      <div className="relative flex gap-3 mt-6">
        <StatPill
          label="CTL" sublabel="Fitness" value={ctl} prev={prev7?.ctl}
          color={COLORS.blue} isLoading={fitnessLoading && ctl === undefined}
          info="Chronic Training Load — 42-day EWMA. Higher = more fit. Builds slowly over weeks."
        />
        <StatPill
          label="ATL" sublabel="Fatigue" value={atl} prev={prev7?.atl}
          color={COLORS.orange} isLoading={fitnessLoading && atl === undefined}
          info="Acute Training Load — 7-day EWMA. Spikes after hard weeks, drops quickly with rest."
        />
      </div>
    </div>
  );
}

// ── [1b] Today's Workout (promoted to actionable card) ──

function TodayWorkoutCard() {
  const {athlete} = useStravaAuth();
  const [plan, setPlan] = useState<WeeklyPlan | null | undefined>(undefined);

  useEffect(() => {
    if (!athlete?.id) return;
    const weekStart = getMondayISO();
    fetch(`/api/coach/week?athleteId=${athlete.id}&weekStart=${weekStart}`)
      .then((r) => r.json())
      .then((data) => setPlan(data ?? null))
      .catch(() => setPlan(null));
  }, [athlete?.id]);

  const todayLabel = new Date().toLocaleDateString('en-US', {weekday: 'long', month: 'short', day: 'numeric'});

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
      style={{minHeight: 230, borderLeftWidth: 3, borderLeftColor: 'var(--color-accent)'}}
    >
      <SectionLabel>Today · {todayLabel}</SectionLabel>
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
      <div className="surface-card p-6 h-full" style={{borderLeftWidth: 3, borderLeftColor: 'var(--color-surface-1)'}}>
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
      style={{borderLeftWidth: 3, borderLeftColor: color}}
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

// ── [3] Training Load (CTL + TSB) ──

function TrainingLoadCard({
  data,
  currentCTL,
  currentATL,
  currentTSB,
  isLoading,
}: {
  data: FitnessDataPoint[] | undefined;
  currentCTL: number | undefined;
  currentATL: number | undefined;
  currentTSB: number | undefined;
  isLoading: boolean;
}) {
  const last90 = data?.slice(-90) ?? [];

  const tsbColor =
    typeof currentTSB === 'number'
      ? currentTSB > 5 ? COLORS.green : currentTSB < -10 ? COLORS.red : COLORS.yellow
      : undefined;

  return (
    <div className="surface-card p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold" style={{color: 'var(--color-text-1)'}}>Training Load</h2>
          <p className="text-xs mt-0.5" style={{color: 'var(--color-text-2)'}}>Last 90 days</p>
        </div>

        <div className="flex items-center gap-5 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded inline-block" style={{background: COLORS.blue}} />
            <span style={{color: 'var(--color-text-2)'}}>CTL</span>
            <span className="font-mono font-semibold ml-0.5 tabular-nums" style={{color: 'var(--color-text-1)'}}>
              {isLoading ? '—' : fmtNum(currentCTL)}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded inline-block opacity-60" style={{background: COLORS.orange}} />
            <span style={{color: 'var(--color-text-2)'}}>ATL</span>
            <span className="font-mono font-semibold ml-0.5 tabular-nums" style={{color: 'var(--color-text-1)'}}>
              {isLoading ? '—' : fmtNum(currentATL)}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-px rounded inline-block" style={{background: tsbColor ?? COLORS.yellow, borderTop: '1px dashed'}} />
            <span style={{color: 'var(--color-text-2)'}}>TSB</span>
            <span className="font-mono font-semibold ml-0.5 tabular-nums" style={{color: tsbColor ?? 'var(--color-text-1)'}}>
              {isLoading ? '—' : typeof currentTSB === 'number' ? `${currentTSB > 0 ? '+' : ''}${currentTSB.toFixed(1)}` : '—'}
            </span>
          </span>
        </div>
      </div>

      {isLoading || last90.length === 0 ? (
        <Skeleton className="h-[200px]" />
      ) : (
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={last90} margin={{top: 4, right: 4, left: 0, bottom: 0}}>
              <defs>
                <linearGradient id="gradCTL" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.blue} stopOpacity={0.35} />
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
                minTickGap={40}
              />
              <RechartsTooltip content={<ChartTooltip />} cursor={{stroke: 'var(--color-border)', strokeWidth: 1}} />
              <Area type="monotone" dataKey="ctl" name="CTL" stroke={COLORS.blue} strokeWidth={2.5} fill="url(#gradCTL)" dot={false} activeDot={{r: 4, fill: COLORS.blue}} />
              <Area type="monotone" dataKey="tsb" name="TSB" stroke={tsbColor ?? COLORS.yellow} strokeWidth={1.5} fill="none" dot={false} activeDot={{r: 3, fill: tsbColor ?? COLORS.yellow}} strokeDasharray="4 3" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
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

  const currentTSB = fitnessData?.[fitnessData.length - 1]?.tsb;
  const currentCTL = fitnessData?.[fitnessData.length - 1]?.ctl;
  const currentATL = fitnessData?.[fitnessData.length - 1]?.atl;

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
              <div className="lg:col-span-5">
                <FormHero fitnessData={fitnessData} fitnessLoading={fitnessLoading} />
              </div>
              <div className="lg:col-span-7">
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

          {/* ── Band 3 · Trend ─────────────────────────────────────────── */}
          <section>
            <SectionLabel>Trend</SectionLabel>
            <TrainingLoadCard
              data={fitnessData}
              currentCTL={currentCTL}
              currentATL={currentATL}
              currentTSB={currentTSB}
              isLoading={fitnessLoading}
            />
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
