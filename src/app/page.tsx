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
  PieChart,
  Pie,
  Cell,
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

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});

const fmtNum = (n: number | undefined, dec = 1) =>
  typeof n === 'number' ? n.toFixed(dec) : '—';

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
        className='bento-card p-10 max-w-sm w-full text-center space-y-5'
      >
        <div className='w-14 h-14 flex items-center justify-center mx-auto'>
          <Image src='/logo.png' alt='Runiqlo' width={56} height={56} />
        </div>
        <div>
          <h2 className='text-lg font-semibold text-white'>Connect Strava</h2>
          <p className='text-sm text-white/40 mt-1'>Link your account to start syncing training data</p>
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
    <div className='bento-card px-3 py-2.5 text-xs space-y-1 min-w-[130px]'>
      <p className='text-white/40 mb-1.5'>{fmtDate(label)}</p>
      {payload.map((p) => (
        <div key={p.name} className='flex items-center justify-between gap-3'>
          <span className='flex items-center gap-1.5'>
            <span className='w-1.5 h-1.5 rounded-full inline-block' style={{background: p.color}} />
            <span className='text-white/60'>{p.name}</span>
          </span>
          <span className='font-mono font-medium text-white'>{p.value?.toFixed(1)}</span>
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
    <div className='bento-card-recessed px-4 py-3 min-w-[110px]'>
      {isLoading ? (
        <>
          <Skeleton className='h-2.5 w-12 mb-2' />
          <Skeleton className='h-7 w-16' />
        </>
      ) : (
        <>
          <div className='flex items-center gap-1.5 mb-1'>
            <span className='text-xs text-white/40 font-medium'>{label}</span>
            <span className='text-xs text-white/20'>·</span>
            <span className='text-xs text-white/25'>{sublabel}</span>
            {info && (
              <div className='relative group flex-shrink-0'>
                <Info size={10} className='text-white/20 hover:text-white/50 cursor-default transition-colors' />
                <div className='absolute right-0 top-5 w-52 p-3 rounded-xl bg-[#13131f] border border-white/10 text-xs text-white/65 leading-relaxed opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-lg'>
                  {info}
                </div>
              </div>
            )}
          </div>
          <p className='text-2xl font-bold font-mono tabular-nums leading-tight' style={{color}}>
            {typeof animated === 'number' ? animated.toFixed(1) : '—'}
          </p>
          {delta !== undefined && (
            <p
              className={`text-xs font-mono mt-0.5 ${isUp ? 'text-accent-green' : isDown ? 'text-accent-red' : 'text-white/30'}`}
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
          stroke="white" strokeWidth="1" opacity={0.08}
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
        opacity={0.5}
      />
    </svg>
  );
}

// ── Form Hero Slab ──

function FormHeroSlab({
  fitnessData,
  activities,
  fitnessLoading,
  activitiesLoading,
}: {
  fitnessData: FitnessDataPoint[] | undefined;
  activities: ActivitySummary[] | undefined;
  fitnessLoading: boolean;
  activitiesLoading: boolean;
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

  const weekStats = useMemo(() => {
    if (!activities) return null;
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const thisWeek = activities.filter((a) => new Date(a.date) >= weekStart);
    return {
      km: thisWeek.reduce((s, a) => s + a.distance, 0),
      duration: thisWeek.reduce((s, a) => s + a.duration, 0),
      count: thisWeek.length,
    };
  }, [activities]);

  const tsbHistory = useMemo(
    () => (fitnessData?.slice(-14).map((d) => d.tsb) ?? []),
    [fitnessData],
  );

  return (
    <div className='bento-card-stage p-5 md:p-6'>
      <div className='flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-6'>
        {/* Left — TSB hero number */}
        <div className='flex-shrink-0'>
          <p className='text-xs text-white/35 font-semibold uppercase tracking-widest mb-2'>
            Form · TSB
          </p>
          {fitnessLoading || tsb === undefined ? (
            <div className='flex items-baseline gap-4'>
              <Skeleton className='h-14 w-24' />
              <div className='space-y-1.5'>
                <Skeleton className='h-4 w-16' />
                <Skeleton className='h-3 w-28' />
              </div>
            </div>
          ) : (
            <div className='flex items-baseline gap-4'>
              <p
                className='text-6xl font-black tracking-tight font-mono tabular-nums leading-none'
                style={{color: status?.color ?? '#f5f5f7'}}
              >
                {typeof animatedTSB === 'number'
                  ? `${animatedTSB > 0 ? '+' : ''}${animatedTSB.toFixed(1)}`
                  : '—'}
              </p>
              {status && (
                <div>
                  <p className='text-base font-semibold text-white/90 leading-tight'>{status.label}</p>
                  <p className='text-xs text-white/40 mt-0.5'>{status.sub}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Middle — 14-day TSB trend */}
        {tsbHistory.length >= 2 && !fitnessLoading && (
          <div className='hidden sm:flex flex-1 flex-col justify-center gap-1.5 min-w-0'>
            <p className='text-[10px] text-white/25 font-semibold uppercase tracking-widest'>14d trend</p>
            <div className='h-10 w-full'>
              <TsbSparkline data={tsbHistory} color={status?.color ?? COLORS.blue} />
            </div>
          </div>
        )}

        {/* Right — CTL + ATL pills */}
        <div className='flex sm:flex-col gap-3 sm:gap-2'>
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

      {/* This week strip */}
      <div className='mt-4 pt-4 border-t border-white/[0.06] flex items-center gap-5 flex-wrap'>
        <span className='text-xs text-white/25 font-semibold uppercase tracking-widest'>
          This week
        </span>
        {activitiesLoading || !weekStats ? (
          <Skeleton className='h-3 w-48' />
        ) : weekStats.count === 0 ? (
          <span className='text-xs text-white/25'>No activities yet</span>
        ) : (
          <>
            <span className='text-xs text-white/55 font-mono tabular-nums'>
              <span className='text-white font-semibold'>{weekStats.km.toFixed(1)}</span> km
            </span>
            <span className='text-xs text-white/55'>
              <span className='text-white font-semibold'>{weekStats.count}</span>{' '}
              {weekStats.count === 1 ? 'session' : 'sessions'}
            </span>
            <span className='text-xs text-white/55 font-mono tabular-nums'>
              <span className='text-white font-semibold'>{formatDuration(weekStats.duration)}</span>{' '}
              moving
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Training Load Slab (chart + CTL/ATL/TSB merged into one surface) ──

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
    <div className='bento-card p-5 flex flex-col h-full min-h-[220px]'>
      <div className='flex items-center justify-between mb-4 flex-wrap gap-2'>
        <div>
          <h2 className='text-sm font-medium text-white'>Training Load</h2>
          <p className='text-xs text-white/40 mt-0.5'>Last 90 days</p>
        </div>

        <div className='flex items-center gap-4 text-xs'>
          <span className='flex items-center gap-1.5'>
            <span className='w-3 h-0.5 rounded bg-accent-blue inline-block' />
            <span className='text-white/45'>CTL</span>
            <span className='font-mono font-semibold text-white/80 ml-0.5 tabular-nums'>
              {isLoading ? '—' : fmtNum(currentCTL)}
            </span>
          </span>
          <span className='flex items-center gap-1.5'>
            <span className='w-3 h-0.5 rounded bg-accent-orange inline-block' />
            <span className='text-white/45'>ATL</span>
            <span className='font-mono font-semibold text-white/80 ml-0.5 tabular-nums'>
              {isLoading ? '—' : fmtNum(currentATL)}
            </span>
          </span>
          <span className='flex items-center gap-1.5'>
            <span className='w-3 h-0.5 rounded bg-accent-purple inline-block opacity-70' />
            <span className='text-white/45'>TSB</span>
            <span
              className='font-mono font-semibold ml-0.5 tabular-nums'
              style={{color: tsbColor ?? 'rgba(255,255,255,0.8)'}}
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
                  <stop offset='5%' stopColor={COLORS.blue} stopOpacity={0.45} />
                  <stop offset='95%' stopColor={COLORS.blue} stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id='gradATL' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='5%' stopColor={COLORS.orange} stopOpacity={0.35} />
                  <stop offset='95%' stopColor={COLORS.orange} stopOpacity={0.02} />
                </linearGradient>
                <filter id='glow-blue'>
                  <feGaussianBlur stdDeviation='3' result='blur' />
                  <feComposite in='SourceGraphic' in2='blur' operator='over' />
                </filter>
              </defs>
              <XAxis
                dataKey='date'
                tickFormatter={fmtDate}
                tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 10}}
                axisLine={false}
                tickLine={false}
                interval='preserveStartEnd'
                minTickGap={40}
              />
              <RechartsTooltip
                content={<ChartTooltip />}
                cursor={{stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1}}
              />
              <Area
                type='monotone'
                dataKey='atl'
                name='ATL'
                stroke={COLORS.orange}
                strokeWidth={2}
                fill='url(#gradATL)'
                dot={false}
                activeDot={{r: 4, fill: COLORS.orange}}
              />
              <Area
                type='monotone'
                dataKey='ctl'
                name='CTL'
                stroke={COLORS.blue}
                strokeWidth={3}
                fill='url(#gradCTL)'
                dot={false}
                activeDot={{r: 4, fill: COLORS.blue}}
                filter='url(#glow-blue)'
              />
              <Area
                type='monotone'
                dataKey='tsb'
                name='TSB'
                stroke={COLORS.purple}
                strokeWidth={1.5}
                fill='none'
                dot={false}
                activeDot={{r: 3, fill: COLORS.purple}}
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
    <div className='flex rounded-lg overflow-hidden border border-white/10'>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
            value === opt.value ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/65'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── HR Zone card (simplified: 2 controls in header, defaults to grouped/80-20 view) ──

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

  const pieData = displayZones
    .map((d) => ({...d, value: metric === 'time' ? d.time : d.distance}))
    .filter((d) => d.value > 0);

  return (
    <div className='bento-card p-5 flex flex-col h-full'>
      {/* Header — 2 controls max */}
      <div className='flex items-start justify-between mb-4'>
        <div>
          <h2 className='text-sm font-medium text-white'>Zone Distribution</h2>
          <p className='text-xs text-white/40 mt-0.5'>Runs · Last 4 weeks</p>
        </div>
        <div className='flex items-center gap-2 flex-wrap justify-end'>
          {isLoading && progress.total > 0 && (
            <span className='text-xs text-white/35'>
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

      {isLoading && !data ? (
        <div className='flex-1 space-y-3'>
          {[1, 2, 3, 4].map((z) => (
            <div key={z} className='space-y-1.5'>
              <Skeleton className='h-2.5 w-20' />
              <Skeleton className='h-2 w-full' />
            </div>
          ))}
        </div>
      ) : !data || totalTime === 0 ? (
        <div className='flex-1 flex items-center justify-center'>
          <p className='text-xs text-white/25'>No zone data for past 4 weeks</p>
        </div>
      ) : (
        <div className='flex-1 flex flex-col gap-4'>
          <AnimatePresence mode='wait' initial={false}>
            <motion.div
              key={grouping}
              initial={{opacity: 0}}
              animate={{opacity: 1}}
              exit={{opacity: 0}}
              transition={{duration: 0.15}}
              className='space-y-2.5'
            >
              {displayZones.map((zone, i) => {
                const value = metric === 'time' ? zone.time : zone.distance;
                const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                return (
                  <div key={zone.key}>
                    <div className='flex items-center justify-between mb-1'>
                      <span className='text-xs text-white/60 font-medium'>{zone.label}</span>
                      <span className='text-xs text-white/40'>
                        {pct}%{' · '}
                        {metric === 'time' ? formatDuration(zone.time) : `${zone.distance.toFixed(1)} km`}
                      </span>
                    </div>
                    <div className='h-1.5 rounded-full bg-white/[0.06] overflow-hidden'>
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
              <p className='text-xs text-white/20 pt-0.5'>
                Total:{' '}
                {metric === 'time' ? formatDuration(totalTime) : `${totalDistance.toFixed(1)} km`}
              </p>
            </motion.div>
          </AnimatePresence>

          <AnimatePresence mode='wait' initial={false}>
            <motion.div
              key={`chart-${grouping}`}
              className='h-[160px]'
              initial={{opacity: 0}}
              animate={{opacity: 1}}
              exit={{opacity: 0}}
              transition={{duration: 0.15}}
            >
              <ResponsiveContainer width='100%' height='100%'>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx='50%'
                    cy='50%'
                    innerRadius='50%'
                    outerRadius='75%'
                    dataKey='value'
                    strokeWidth={0}
                    paddingAngle={1}
                    isAnimationActive
                    animationBegin={0}
                    animationDuration={450}
                    animationEasing='ease-out'
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    cursor={false}
                    content={({active, payload}) => {
                      if (!active || !payload?.length) return null;
                      const entry = payload[0].payload;
                      const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
                      return (
                        <div className='bg-black/80 border border-white/10 rounded-lg px-3 py-2 backdrop-blur-sm'>
                          <p className='text-xs text-white font-medium'>{entry.label}</p>
                          <p className='text-xs text-white/55 mt-0.5'>
                            {pct}%{' · '}
                            {metric === 'time'
                              ? formatDuration(entry.time)
                              : `${entry.distance.toFixed(1)} km`}
                          </p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ── Recent Activities (paginated, no internal scroll) ──

function ActivityRow({activity}: {activity: ActivitySummary}) {
  const color = SPORT_COLORS[activity.type] ?? '#ffffff60';
  const dateStr = new Date(activity.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});

  return (
    <Link
      href={`/activities/${activity.id}`}
      className='flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer group'
    >
      <div className='w-2 h-2 rounded-full flex-shrink-0' style={{background: color}} />
      <div className='flex-1 min-w-0'>
        <p className='text-sm text-white/80 truncate font-medium leading-tight group-hover:text-white transition-colors'>
          {activity.name}
        </p>
        <p className='text-xs text-white/40 mt-0.5'>
          {dateStr} · {activity.type}
        </p>
      </div>
      <div className='text-right flex-shrink-0'>
        <p className='text-sm text-white/75 font-mono tabular-nums'>{activity.distance.toFixed(1)} km</p>
        <p className='text-xs text-white/40 font-mono tabular-nums'>
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
  const [expanded, setExpanded] = useState(false);
  const PAGE = 5;
  const all = activities ?? [];
  const displayed = expanded ? all.slice(0, 15) : all.slice(0, PAGE);

  return (
    <div className='bento-card p-5 flex flex-col h-full'>
      <div className='flex items-center justify-between mb-3'>
        <h2 className='text-sm font-medium text-white'>Recent Activities</h2>
        <Link href='/activities' className='text-xs text-white/40 hover:text-white/65 transition-colors'>
          View all →
        </Link>
      </div>

      {isLoading ? (
        <div className='space-y-2'>
          {Array.from({length: 5}).map((_, i) => (
            <div key={i} className='flex items-center gap-3 py-2'>
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
        <div className='flex-1 flex items-center justify-center'>
          <p className='text-xs text-white/25'>No activities yet</p>
        </div>
      ) : (
        <>
          <motion.div className='space-y-0.5'>
            <AnimatePresence initial={false}>
              {displayed.map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{opacity: 0, y: 6}}
                  animate={{opacity: 1, y: 0}}
                  exit={{opacity: 0, y: -4}}
                  transition={{duration: 0.2, delay: i * 0.03}}
                >
                  <ActivityRow activity={a} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>

          {all.length > PAGE && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className='mt-2 w-full py-2 text-xs text-white/35 hover:text-white/60 transition-colors text-center cursor-pointer'
            >
              {expanded ? 'Show less' : `+${all.length - PAGE} more`}
            </button>
          )}
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
  const {data: breakdownMap, isLoading: zonesLoading, progress} = usePerActivityZoneBreakdowns(4);

  const currentTSB = fitnessData?.[fitnessData.length - 1]?.tsb;
  const currentCTL = fitnessData?.[fitnessData.length - 1]?.ctl;
  const currentATL = fitnessData?.[fitnessData.length - 1]?.atl;

  if (authLoading) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='w-8 h-8 rounded-full border-2 border-white/20 border-t-accent-blue animate-spin' />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <ConnectPrompt />;
  }

  return (
    <>
      <AppHeader onRefresh={forceRefresh} />

      <main className='pt-[72px] pb-20 md:pb-6 px-5 min-h-dvh'>
        <motion.div
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          transition={{duration: 0.4}}
          className='grid grid-cols-12 gap-4 max-w-[1400px] mx-auto'
        >
          {/* Row 1 — Form Hero */}
          <div className='col-span-12'>
            <FormHeroSlab
              fitnessData={fitnessData}
              activities={activities}
              fitnessLoading={fitnessLoading}
              activitiesLoading={activitiesLoading}
            />
          </div>

          {/* Row 2 — Training Load (chart + CTL/ATL/TSB in header) */}
          <div className='col-span-12 h-[240px]'>
            <TrainingLoadSlab
              data={fitnessData}
              currentCTL={currentCTL}
              currentATL={currentATL}
              currentTSB={currentTSB}
              isLoading={fitnessLoading}
            />
          </div>

          {/* Row 3 — Zone Distribution + Recent Activities */}
          <div className='col-span-12 md:col-span-7 min-h-[360px]'>
            <HRZoneCard
              breakdownMap={breakdownMap}
              activities={activities}
              isLoading={zonesLoading}
              progress={progress}
            />
          </div>

          <div className='col-span-12 md:col-span-5 min-h-[360px]'>
            <RecentActivitiesCard activities={activities} isLoading={activitiesLoading} />
          </div>
        </motion.div>
      </main>
    </>
  );
}
