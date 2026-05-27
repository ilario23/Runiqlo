'use client';

import {useState, useMemo, useEffect, useRef} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import AppHeader from '@/components/AppHeader';
import {motion, AnimatePresence} from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {
  useDashboardActivities,
  useFitnessData,
  usePerActivityZoneBreakdowns,
  useForceRefreshActivities,
} from '@/hooks/useStrava';
import {formatPace, formatDuration, ZONE_COLORS, ZONE_NAMES, SPORT_COLORS, COLORS} from '@/lib/activityModel';
import {Skeleton} from '@/components/ui/skeleton';
import {Info} from 'lucide-react';
import type {ActivitySummary} from '@/lib/activityModel';
import type {FitnessDataPoint} from '@/utils/trainingLoad';
import {aggregateZoneBreakdowns} from '@/lib/zoneCompute';
import type {AggregatedZoneTotals, ZoneBreakdown} from '@/lib/zoneCompute';
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

// ─── sub-components ───────────────────────────────────────────────────────────

function ConnectPrompt() {
  return (
    <div className='min-h-screen flex items-center justify-center p-6'>
      <motion.div
        initial={{opacity: 0, scale: 0.96}}
        animate={{opacity: 1, scale: 1}}
        transition={{duration: 0.4}}
        className='surface-card p-10 max-w-sm w-full text-center space-y-5'
      >
        <div className='w-14 h-14 flex items-center justify-center mx-auto'>
          <Image src='/logo.png' alt='Runiqlo' width={56} height={56} />
        </div>
        <div>
          <h2 className='text-lg font-semibold text-white'>Connect Strava</h2>
          <p className='text-sm mt-1' style={{color: 'var(--color-text-2)'}}>Link your account to start syncing training data</p>
        </div>
        <Link
          href='/settings'
          className='block w-full bg-brand hover:bg-brand/90 text-white font-semibold py-3 rounded-xl text-sm transition-colors'
        >
          Go to Settings
        </Link>
      </motion.div>
    </div>
  );
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
    <div className='surface-card px-3 py-2.5 text-xs space-y-1 min-w-[120px]'>
      <p className='mb-1.5' style={{color: 'var(--color-text-3)'}}>
        {fmtDate(label)}
      </p>
      {payload.map((p) => (
        <div key={p.name} className='flex items-center justify-between gap-3'>
          <span className='flex items-center gap-1.5'>
            <span className='w-1.5 h-1.5 rounded-full inline-block' style={{background: p.color}} />
            <span style={{color: 'var(--color-text-2)'}}>{p.name}</span>
          </span>
          <span className='font-mono font-medium' style={{color: 'var(--color-text-1)'}}>{p.value?.toFixed(1)}</span>
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

  return (
    <div className='surface-raised px-4 py-3 min-w-[110px]'>
      {isLoading ? (
        <>
          <Skeleton className='h-2.5 w-12 mb-2' />
          <Skeleton className='h-7 w-16' />
        </>
      ) : (
        <>
          <div className='flex items-center gap-1.5 mb-1'>
            <span className='metric-label'>{label}</span>
            <span style={{color: 'var(--color-text-3)'}}>·</span>
            <span className='text-xs' style={{color: 'var(--color-text-3)'}}>{sublabel}</span>
            {info && (
              <div className='relative group flex-shrink-0'>
                <Info size={10} className='cursor-default transition-colors' style={{color: 'var(--color-text-3)'}} />
                <div
                  className='absolute right-0 top-5 w-52 p-3 rounded-xl text-xs leading-relaxed opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50'
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
          <p className='text-2xl font-bold font-mono tabular-nums leading-tight' style={{color}}>
            {typeof animated === 'number' ? animated.toFixed(1) : '—'}
          </p>
          {delta !== undefined && (
            <p className={`text-xs font-mono mt-0.5 ${isUp ? 'text-accent-green' : isDown ? 'text-accent-red' : ''}`}
              style={!isUp && !isDown ? {color: 'var(--color-text-3)'} : {}}>
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
          vectorEffect="non-scaling-stroke"
          strokeDasharray="3,3"
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

// ── Form Hero Slab (open stage — no card wrapper) ──

function FormHeroSlab({
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
    () => (fitnessData?.slice(-14).map((d) => d.tsb) ?? []),
    [fitnessData],
  );

  return (
    <div className='surface-stage relative py-10 md:py-14'>
      {/* Subtle accent wash behind hero number */}
      <div
        className='absolute inset-0 pointer-events-none'
        style={{
          background: 'radial-gradient(ellipse 40% 60% at 0% 50%, var(--color-accent-dim) 0%, transparent 70%)',
        }}
      />

      <div className='relative flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-8'>
        {/* Left — TSB hero number */}
        <div className='flex-shrink-0'>
          <p className='metric-label mb-3'>Form · TSB</p>
          {fitnessLoading || tsb === undefined ? (
            <div className='flex items-baseline gap-4'>
              <Skeleton className='h-20 w-32' />
              <div className='space-y-1.5'>
                <Skeleton className='h-4 w-16' />
                <Skeleton className='h-3 w-28' />
              </div>
            </div>
          ) : (
            <div className='flex items-baseline gap-5'>
              <p
                className='metric-display'
                style={{color: status?.color ?? 'var(--color-text-1)'}}
              >
                {typeof animatedTSB === 'number'
                  ? `${animatedTSB > 0 ? '+' : ''}${animatedTSB.toFixed(1)}`
                  : '—'}
              </p>
              {status && (
                <div>
                  <p className='text-base font-semibold leading-tight' style={{color: 'var(--color-text-1)'}}>
                    {status.label}
                  </p>
                  <p className='text-sm mt-0.5' style={{color: 'var(--color-text-2)'}}>
                    {status.sub}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Middle — 14-day TSB trend */}
        {tsbHistory.length >= 2 && !fitnessLoading && (
          <div className='hidden sm:flex flex-1 flex-col justify-center gap-2 min-w-0 max-w-[180px]'>
            <p className='metric-label'>14d trend</p>
            <div className='h-12 w-full'>
              <TsbSparkline data={tsbHistory} color={status?.color ?? COLORS.blue} />
            </div>
          </div>
        )}

        {/* Right — CTL + ATL pills */}
        <div className='flex sm:flex-col gap-3 sm:gap-2 sm:ml-auto'>
          <StatPill
            label='CTL'
            sublabel='Fitness'
            value={ctl}
            prev={prev7?.ctl}
            color={COLORS.blue}
            isLoading={fitnessLoading}
            info='Chronic Training Load — 42-day EWMA. Higher = more fit. Builds slowly over weeks.'
          />
          <StatPill
            label='ATL'
            sublabel='Fatigue'
            value={atl}
            prev={prev7?.atl}
            color={COLORS.orange}
            isLoading={fitnessLoading}
            info='Acute Training Load — 7-day EWMA. Spikes after hard weeks, drops quickly with rest.'
          />
        </div>
      </div>
    </div>
  );
}

// ── Today's Workout Strip ──

function TodayWorkoutStrip() {
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

  if (plan === undefined) return null; // loading — show nothing

  const todayISO = localDateISO();
  const todayEntry = plan?.days?.find((d) => d.date === todayISO);
  const firstWorkout = todayEntry?.workouts?.[0];

  if (!plan || !firstWorkout) {
    return (
      <motion.div
        initial={{opacity: 0}}
        animate={{opacity: 1}}
        transition={{duration: 0.3}}
      >
        <Link
          href='/coach'
          className='surface-card flex items-center gap-4 px-5 py-3.5 group transition-colors hover:border-[var(--color-accent)]/30'
          style={{borderLeftWidth: '2px', borderLeftColor: 'var(--color-text-3)'}}
        >
          <span className='metric-label'>Today</span>
          <span className='text-sm' style={{color: 'var(--color-text-2)'}}>
            {!plan ? 'No training plan set up' : 'Rest day'}
          </span>
          <span className='ml-auto text-sm group-hover:translate-x-0.5 transition-transform' style={{color: 'var(--color-text-3)'}}>
            {!plan ? 'Set up plan →' : ''}
          </span>
        </Link>
      </motion.div>
    );
  }

  const label = WORKOUT_LABELS[firstWorkout.type] ?? firstWorkout.type;
  const duration = firstWorkout.durationMinutes ? `${firstWorkout.durationMinutes} min` : null;
  const distance = firstWorkout.distanceKm ? `${firstWorkout.distanceKm} km` : null;
  const target = [duration, distance].filter(Boolean).join(' · ');

  return (
    <motion.div
      initial={{opacity: 0}}
      animate={{opacity: 1}}
      transition={{duration: 0.3}}
    >
      <Link
        href='/coach'
        className='surface-card flex items-center gap-4 px-5 py-3.5 group transition-colors hover:border-[var(--color-accent)]/30'
        style={{borderLeftWidth: '2px', borderLeftColor: 'var(--color-accent)'}}
      >
        <span className='metric-label'>Today</span>
        <span className='text-sm font-medium' style={{color: 'var(--color-text-1)'}}>{label}</span>
        {target && (
          <>
            <span style={{color: 'var(--color-text-3)'}}>·</span>
            <span className='text-sm font-mono' style={{color: 'var(--color-text-2)'}}>{target}</span>
          </>
        )}
        {firstWorkout.intensityDescription && (
          <span className='hidden md:block text-sm truncate flex-1 ml-2' style={{color: 'var(--color-text-2)'}}>
            {firstWorkout.intensityDescription}
          </span>
        )}
        <span className='ml-auto text-sm group-hover:translate-x-0.5 transition-transform' style={{color: 'var(--color-text-3)'}}>→</span>
      </Link>
    </motion.div>
  );
}

// ── Featured Last Run Card ──

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
      <div className='surface-card p-5' style={{borderLeftWidth: '3px', borderLeftColor: 'var(--color-surface-1)'}}>
        <div className='space-y-3'>
          <Skeleton className='h-3 w-24' />
          <Skeleton className='h-7 w-64' />
          <div className='flex gap-8 mt-2'>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className='space-y-1'>
                <Skeleton className='h-2.5 w-10' />
                <Skeleton className='h-5 w-14' />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!run) return null;

  const dateStr = new Date(run.date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const stats = [
    {label: 'Distance', value: `${run.distance.toFixed(2)} km`},
    {label: 'Avg Pace', value: run.avgPace > 0 ? `${formatPace(run.avgPace)}/km` : '—'},
    {label: 'Avg HR', value: run.avgHr > 0 ? `${Math.round(run.avgHr)} bpm` : '—'},
    {label: 'Elevation', value: run.elevationGain > 0 ? `+${Math.round(run.elevationGain)} m` : '—'},
  ];

  return (
    <motion.div
      initial={{opacity: 0, x: -8}}
      animate={{opacity: 1, x: 0}}
      transition={{duration: 0.35}}
    >
      <Link
        href={`/activities/${run.id}`}
        className='surface-card block p-5 group transition-colors hover:border-[rgba(255,255,255,0.09)]'
        style={{borderLeftWidth: '3px', borderLeftColor: color}}
      >
        <div className='flex items-start gap-3 mb-4'>
          <div className='w-2 h-2 rounded-full mt-1.5 flex-shrink-0' style={{background: color}} />
          <div className='flex-1 min-w-0'>
            <p className='metric-label mb-1'>{dateStr} · {run.type}</p>
            <h3 className='text-xl font-bold truncate group-hover:opacity-80 transition-opacity'
              style={{color: 'var(--color-text-1)', letterSpacing: '-0.02em'}}>
              {run.name}
            </h3>
          </div>
          <span className='text-sm opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1'
            style={{color: 'var(--color-text-2)'}}>
            →
          </span>
        </div>

        <div className='flex gap-6 md:gap-10'>
          {stats.map((s) => (
            <div key={s.label}>
              <p className='metric-label mb-1'>{s.label}</p>
              <p className='text-base font-semibold font-mono tabular-nums' style={{color: 'var(--color-text-1)'}}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </Link>
    </motion.div>
  );
}

// ── Training Load Slab (CTL + TSB only, ATL removed from chart) ──

function TrainingLoadSlab({
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
      ? currentTSB > 5
        ? COLORS.green
        : currentTSB < -10
        ? COLORS.red
        : COLORS.yellow
      : undefined;

  return (
    <div className='surface-card p-5 flex flex-col h-full min-h-[220px]'>
      <div className='flex items-center justify-between mb-5 flex-wrap gap-2'>
        <div>
          <h2 className='text-sm font-semibold' style={{color: 'var(--color-text-1)'}}>Training Load</h2>
          <p className='text-xs mt-0.5' style={{color: 'var(--color-text-2)'}}>Last 90 days</p>
        </div>

        <div className='flex items-center gap-5 text-xs'>
          <span className='flex items-center gap-1.5'>
            <span className='w-3 h-0.5 rounded inline-block' style={{background: COLORS.blue}} />
            <span style={{color: 'var(--color-text-2)'}}>CTL</span>
            <span className='font-mono font-semibold ml-0.5 tabular-nums' style={{color: 'var(--color-text-1)'}}>
              {isLoading ? '—' : fmtNum(currentCTL)}
            </span>
          </span>
          <span className='flex items-center gap-1.5'>
            <span className='w-3 h-0.5 rounded inline-block opacity-60' style={{background: COLORS.orange}} />
            <span style={{color: 'var(--color-text-2)'}}>ATL</span>
            <span className='font-mono font-semibold ml-0.5 tabular-nums' style={{color: 'var(--color-text-1)'}}>
              {isLoading ? '—' : fmtNum(currentATL)}
            </span>
          </span>
          <span className='flex items-center gap-1.5'>
            <span className='w-3 h-px rounded inline-block' style={{background: tsbColor ?? COLORS.yellow, borderTop: '1px dashed'}} />
            <span style={{color: 'var(--color-text-2)'}}>TSB</span>
            <span
              className='font-mono font-semibold ml-0.5 tabular-nums'
              style={{color: tsbColor ?? 'var(--color-text-1)'}}
            >
              {isLoading
                ? '—'
                : typeof currentTSB === 'number'
                ? `${currentTSB > 0 ? '+' : ''}${currentTSB.toFixed(1)}`
                : '—'}
            </span>
          </span>
        </div>
      </div>

      {isLoading || last90.length === 0 ? (
        <Skeleton className='flex-1' />
      ) : (
        <div className='flex-1 min-h-0'>
          <ResponsiveContainer width='100%' height='100%'>
            <AreaChart data={last90} margin={{top: 4, right: 4, left: 0, bottom: 0}}>
              <defs>
                <linearGradient id='gradCTL' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='5%' stopColor={COLORS.blue} stopOpacity={0.35} />
                  <stop offset='95%' stopColor={COLORS.blue} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey='date'
                tickFormatter={fmtDate}
                tick={{fill: 'var(--color-text-3)', fontSize: 10}}
                axisLine={false}
                tickLine={false}
                interval='preserveStartEnd'
                minTickGap={40}
              />
              <RechartsTooltip
                content={<ChartTooltip />}
                cursor={{stroke: 'var(--color-border)', strokeWidth: 1}}
              />
              <Area
                type='monotone'
                dataKey='ctl'
                name='CTL'
                stroke={COLORS.blue}
                strokeWidth={2.5}
                fill='url(#gradCTL)'
                dot={false}
                activeDot={{r: 4, fill: COLORS.blue}}
              />
              <Area
                type='monotone'
                dataKey='tsb'
                name='TSB'
                stroke={tsbColor ?? COLORS.yellow}
                strokeWidth={1.5}
                fill='none'
                dot={false}
                activeDot={{r: 3, fill: tsbColor ?? COLORS.yellow}}
                strokeDasharray='4 3'
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Segmented control ──

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: {value: T; label: string}[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className='flex rounded-lg overflow-hidden'
      style={{
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className='px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer'
          style={{
            background: value === opt.value ? 'var(--color-surface-2)' : 'transparent',
            color: value === opt.value ? 'var(--color-text-1)' : 'var(--color-text-2)',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── HR Zone card (bars only — pie removed) ──

function HRZoneCard({
  breakdownMap,
  activities,
  isLoading,
  progress,
}: {
  breakdownMap: Map<string, ZoneBreakdown> | undefined;
  activities: ActivitySummary[] | undefined;
  isLoading: boolean;
  progress: {done: number; total: number};
}) {
  const [metric, setMetric] = useState<'time' | 'distance'>('time');
  const [grouping, setGrouping] = useState<'all' | 'grouped'>('grouped');

  const data = useMemo<AggregatedZoneTotals | undefined>(() => {
    if (!breakdownMap || breakdownMap.size === 0) return undefined;
    const runIds = new Set((activities ?? []).filter((a) => a.type === 'Run').map((a) => a.id));
    const filtered = Array.from(breakdownMap.entries())
      .filter(([id]) => runIds.has(id))
      .map(([, bd]) => bd);
    if (filtered.length === 0) return aggregateZoneBreakdowns(Array.from(breakdownMap.values()));
    return aggregateZoneBreakdowns(filtered);
  }, [breakdownMap, activities]);

  const weekStats = useMemo(() => {
    if (!activities) return null;
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const thisWeek = activities.filter((a) => new Date(a.date) >= weekStart);
    return {
      km: thisWeek.reduce((s, a) => s + a.distance, 0),
      count: thisWeek.length,
    };
  }, [activities]);

  const displayZones = useMemo(() => {
    if (!data) return [];
    if (grouping === 'all') {
      return ([1, 2, 3, 4, 5, 6] as const).map((z) => ({
        key: String(z),
        label: `Z${z} · ${ZONE_NAMES[z]}`,
        time: data.zones[z]?.time ?? 0,
        distance: data.zones[z]?.distance ?? 0,
        color: ZONE_COLORS[z],
      }));
    }
    return [
      {
        key: 'easy',
        label: 'Z1–2 · Easy',
        time: (data.zones[1]?.time ?? 0) + (data.zones[2]?.time ?? 0),
        distance: (data.zones[1]?.distance ?? 0) + (data.zones[2]?.distance ?? 0),
        color: ZONE_COLORS[2],
      },
      {
        key: 'intensity',
        label: 'Z3–6 · Intensity',
        time: ([3, 4, 5, 6] as const).reduce((s, z) => s + (data.zones[z]?.time ?? 0), 0),
        distance: ([3, 4, 5, 6] as const).reduce((s, z) => s + (data.zones[z]?.distance ?? 0), 0),
        color: ZONE_COLORS[4],
      },
    ];
  }, [data, grouping]);

  const totalTime = data?.totalTime ?? 0;
  const totalDistance = data?.totalDistance ?? 0;
  const total = metric === 'time' ? totalTime : totalDistance;

  return (
    <div className='surface-card p-5 flex flex-col h-full'>
      {/* Header */}
      <div className='flex items-start justify-between mb-1'>
        <div>
          <h2 className='text-sm font-semibold' style={{color: 'var(--color-text-1)'}}>Zone Distribution</h2>
          <p className='text-xs mt-0.5' style={{color: 'var(--color-text-2)'}}>Runs · Last 4 weeks</p>
        </div>
        <div className='flex items-center gap-2 flex-wrap justify-end'>
          {isLoading && progress.total > 0 && (
            <span className='text-xs' style={{color: 'var(--color-text-3)'}}>
              {progress.done}/{progress.total}
            </span>
          )}
          <SegmentedControl
            options={[
              {value: 'grouped' as const, label: '80/20'},
              {value: 'all' as const, label: '6 zones'},
            ]}
            value={grouping}
            onChange={setGrouping}
          />
          <SegmentedControl
            options={[
              {value: 'time' as const, label: 'Time'},
              {value: 'distance' as const, label: 'KM'},
            ]}
            value={metric}
            onChange={setMetric}
          />
        </div>
      </div>

      {/* This week stats */}
      {weekStats && (
        <div className='flex items-center gap-4 mb-4 mt-2'>
          <span className='metric-label'>This week</span>
          <span className='text-xs font-mono tabular-nums' style={{color: 'var(--color-text-1)'}}>
            {weekStats.km.toFixed(1)} km
          </span>
          <span className='text-xs' style={{color: 'var(--color-text-2)'}}>
            {weekStats.count} {weekStats.count === 1 ? 'session' : 'sessions'}
          </span>
        </div>
      )}

      {isLoading && !data ? (
        <div className='flex-1 space-y-4'>
          {[1, 2, 3, 4].map((z) => (
            <div key={z} className='space-y-1.5'>
              <Skeleton className='h-2.5 w-20' />
              <Skeleton className='h-2.5 w-full' />
            </div>
          ))}
        </div>
      ) : !data || totalTime === 0 ? (
        <div className='flex-1 flex items-center justify-center'>
          <p className='text-xs' style={{color: 'var(--color-text-3)'}}>No zone data for past 4 weeks</p>
        </div>
      ) : (
        <AnimatePresence mode='wait' initial={false}>
          <motion.div
            key={grouping}
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.15}}
            className='flex-1 space-y-3'
          >
            {displayZones.map((zone, i) => {
              const value = metric === 'time' ? zone.time : zone.distance;
              const pct = total > 0 ? Math.round((value / total) * 100) : 0;
              return (
                <div key={zone.key}>
                  <div className='flex items-center justify-between mb-1.5'>
                    <span className='text-xs font-medium' style={{color: 'var(--color-text-1)'}}>{zone.label}</span>
                    <span className='text-xs font-mono tabular-nums' style={{color: 'var(--color-text-2)'}}>
                      {pct}%{' · '}
                      {metric === 'time' ? formatDuration(zone.time) : `${zone.distance.toFixed(1)} km`}
                    </span>
                  </div>
                  <div
                    className='h-2 rounded-full overflow-hidden'
                    style={{background: 'var(--color-surface-1)'}}
                  >
                    <motion.div
                      className='h-full rounded-full'
                      style={{background: zone.color}}
                      initial={{width: 0}}
                      animate={{width: `${pct}%`}}
                      transition={{duration: 0.45, delay: i * 0.05, ease: 'easeOut'}}
                    />
                  </div>
                </div>
              );
            })}
            <p className='text-xs pt-1' style={{color: 'var(--color-text-3)'}}>
              Total:{' '}
              {metric === 'time' ? formatDuration(totalTime) : `${totalDistance.toFixed(1)} km`}
            </p>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

// ── Recent Activities (index rail) ──

function ActivityRow({activity}: {activity: ActivitySummary}) {
  const color = SPORT_COLORS[activity.type] ?? 'var(--color-text-3)';
  const dateStr = new Date(activity.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});

  return (
    <Link
      href={`/activities/${activity.id}`}
      className='flex items-center gap-3 py-3 px-4 transition-colors cursor-pointer group'
      style={{borderBottom: '1px solid var(--color-border)'}}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-1)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div className='w-2 h-2 rounded-full flex-shrink-0' style={{background: color}} />
      <div className='flex-1 min-w-0'>
        <p
          className='text-sm font-medium truncate leading-tight transition-colors'
          style={{color: 'var(--color-text-1)'}}
        >
          {activity.name}
        </p>
        <p className='text-xs mt-0.5' style={{color: 'var(--color-text-2)'}}>
          {dateStr} · {activity.type}
        </p>
      </div>
      <div className='text-right flex-shrink-0'>
        <p className='text-sm font-mono tabular-nums' style={{color: 'var(--color-text-1)'}}>
          {activity.distance.toFixed(1)} km
        </p>
        <p className='text-xs font-mono tabular-nums' style={{color: 'var(--color-text-2)'}}>
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
  const PAGE = 8;
  const all = activities ?? [];
  const displayed = all.slice(0, PAGE);

  return (
    <div className='surface-card overflow-hidden'>
      <div className='flex items-center justify-between px-5 py-4' style={{borderBottom: '1px solid var(--color-border)'}}>
        <h2 className='text-sm font-semibold' style={{color: 'var(--color-text-1)'}}>Recent Activities</h2>
        <Link
          href='/activities'
          className='text-xs transition-colors'
          style={{color: 'var(--color-text-2)'}}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-1)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-2)')}
        >
          View all →
        </Link>
      </div>

      {isLoading ? (
        <div className='px-4 py-2'>
          {Array.from({length: 5}).map((_, i) => (
            <div key={i} className='flex items-center gap-3 py-3' style={{borderBottom: '1px solid var(--color-border)'}}>
              <Skeleton className='w-2 h-2 rounded-full' />
              <div className='flex-1 space-y-1.5'>
                <Skeleton className='h-3 w-3/4' />
                <Skeleton className='h-2.5 w-1/3' />
              </div>
              <Skeleton className='h-3 w-12' />
            </div>
          ))}
        </div>
      ) : all.length === 0 ? (
        <div className='flex items-center justify-center py-12'>
          <p className='text-xs' style={{color: 'var(--color-text-3)'}}>No activities yet</p>
        </div>
      ) : (
        <motion.div>
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
        </motion.div>
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
  const {data: breakdownMap, isLoading: zonesLoading, progress} = usePerActivityZoneBreakdowns(4);

  const currentTSB = fitnessData?.[fitnessData.length - 1]?.tsb;
  const currentCTL = fitnessData?.[fitnessData.length - 1]?.ctl;
  const currentATL = fitnessData?.[fitnessData.length - 1]?.atl;

  if (authLoading) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='w-8 h-8 rounded-full border-2 border-t-accent-blue animate-spin'
          style={{borderColor: 'var(--color-surface-1)', borderTopColor: COLORS.blue}} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <ConnectPrompt />;
  }

  return (
    <>
      <AppHeader onRefresh={forceRefresh} />

      <main className='pt-[72px] pb-20 md:pb-8 px-5 min-h-dvh' style={{background: 'var(--color-base)'}}>
        <motion.div
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          transition={{duration: 0.4}}
          className='grid grid-cols-12 gap-4 max-w-[1400px] mx-auto'
        >
          {/* [1] Hero Stage — TSB */}
          <div className='col-span-12'>
            <FormHeroSlab
              fitnessData={fitnessData}
              fitnessLoading={fitnessLoading}
            />
          </div>

          {/* [2] Coach Workout Strip */}
          <div className='col-span-12'>
            <TodayWorkoutStrip />
          </div>

          {/* [3] Featured Last Run */}
          <div className='col-span-12'>
            <LastRunCard activities={activities} isLoading={activitiesLoading} />
          </div>

          {/* [4+5] Training Load + Zone Distribution */}
          <div className='col-span-12 md:col-span-8 h-[260px]'>
            <TrainingLoadSlab
              data={fitnessData}
              currentCTL={currentCTL}
              currentATL={currentATL}
              currentTSB={currentTSB}
              isLoading={fitnessLoading}
            />
          </div>

          <div className='col-span-12 md:col-span-4'>
            <HRZoneCard
              breakdownMap={breakdownMap}
              activities={activities}
              isLoading={zonesLoading}
              progress={progress}
            />
          </div>

          {/* [6] Activity Feed */}
          <div className='col-span-12'>
            <RecentActivitiesCard activities={activities} isLoading={activitiesLoading} />
          </div>
        </motion.div>
      </main>
    </>
  );
}
