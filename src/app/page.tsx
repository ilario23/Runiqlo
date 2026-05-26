'use client';

import {useState, useMemo} from 'react';
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
  useAthleteStats,
  useFitnessData,
  usePerActivityZoneBreakdowns,
  useForceRefreshActivities,
} from '@/hooks/useStrava';
import {
  formatPace,
  formatDuration,
  ZONE_COLORS,
  ZONE_NAMES,
  SPORT_COLORS,
  COLORS,
} from '@/lib/activityModel';
import {Skeleton} from '@/components/ui/skeleton';
import {Info} from 'lucide-react';
import type {ActivitySummary} from '@/lib/activityModel';
import type {FitnessDataPoint} from '@/utils/trainingLoad';
import type {StravaAthleteStats} from '@/lib/strava';
import {aggregateZoneBreakdowns} from '@/lib/zoneCompute';
import type {AggregatedZoneTotals, ZoneBreakdown} from '@/lib/zoneCompute';

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});

const fmtNum = (n: number | undefined, dec = 1) =>
  typeof n === 'number' ? n.toFixed(dec) : '—';

// ─── sub-components ───────────────────────────────────────────────────────────

function SkeletonCard({className = ''}: {className?: string}) {
  return (
    <div className={`bento-card p-5 ${className}`}>
      <Skeleton className='h-4 w-28 mb-4' />
      <Skeleton className='h-8 w-20 mb-2' />
      <Skeleton className='h-3 w-36' />
    </div>
  );
}

// ── Connect Prompt ──

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
          <Image src='/mylogo.png' alt='Runiqlo' width={56} height={56} />
        </div>
        <div>
          <h2 className='text-lg font-semibold text-white'>Connect Strava</h2>
          <p className='text-sm text-white/40 mt-1'>
            Link your account to start syncing training data
          </p>
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

// ── Training Load Chart ──

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
            <span
              className='w-1.5 h-1.5 rounded-full inline-block'
              style={{background: p.color}}
            />
            <span className='text-white/60'>{p.name}</span>
          </span>
          <span className='font-mono font-medium text-white'>
            {p.value?.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}

function TrainingLoadCard({
  data,
  isLoading,
}: {
  data: FitnessDataPoint[] | undefined;
  isLoading: boolean;
}) {
  const last90 = data?.slice(-90) ?? [];

  return (
    <div className='bento-card p-5 flex flex-col h-full min-h-[220px]'>
      <div className='flex items-center justify-between mb-4'>
        <div>
          <h2 className='text-sm font-medium text-white'>Training Load</h2>
          <p className='text-xs text-white/50 mt-0.5'>CTL · ATL · TSB</p>
        </div>
        <div className='flex items-center gap-3 text-[10px] font-medium'>
          <span className='flex items-center gap-1'>
            <span className='w-3 h-0.5 rounded bg-accent-blue inline-block' />
            <span className='text-white/50'>CTL</span>
          </span>
          <span className='flex items-center gap-1'>
            <span className='w-3 h-0.5 rounded bg-accent-orange inline-block' />
            <span className='text-white/50'>ATL</span>
          </span>
          <span className='flex items-center gap-1'>
            <span className='w-3 h-0.5 rounded bg-accent-purple inline-block' />
            <span className='text-white/50'>TSB</span>
          </span>
        </div>
      </div>

      {isLoading || last90.length === 0 ? (
        <div className='flex-1 flex flex-col gap-2'>
          <Skeleton className='flex-1' />
        </div>
      ) : (
        <div className='flex-1 min-h-0'>
          <ResponsiveContainer width='100%' height='100%'>
            <AreaChart
              data={last90}
              margin={{top: 4, right: 4, left: 0, bottom: 0}}
            >
              <defs>
                <linearGradient id='gradCTL' x1='0' y1='0' x2='0' y2='1'>
                  <stop
                    offset='5%'
                    stopColor={COLORS.blue}
                    stopOpacity={0.45}
                  />
                  <stop
                    offset='95%'
                    stopColor={COLORS.blue}
                    stopOpacity={0.03}
                  />
                </linearGradient>
                <linearGradient id='gradATL' x1='0' y1='0' x2='0' y2='1'>
                  <stop
                    offset='5%'
                    stopColor={COLORS.orange}
                    stopOpacity={0.35}
                  />
                  <stop
                    offset='95%'
                    stopColor={COLORS.orange}
                    stopOpacity={0.02}
                  />
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

// ── Metric Card (CTL / ATL) ──

interface MetricCardProps {
  label: string;
  sublabel: string;
  value: number | undefined;
  prev7Value: number | undefined;
  color: string;
  isLoading: boolean;
  info?: string;
}

function MetricCard({
  label,
  sublabel,
  value,
  prev7Value,
  color,
  isLoading,
  info,
}: MetricCardProps) {
  const delta =
    typeof value === 'number' && typeof prev7Value === 'number'
      ? value - prev7Value
      : undefined;
  const isUp = typeof delta === 'number' && delta > 0;
  const isDown = typeof delta === 'number' && delta < 0;

  return (
    <div className='bento-card-matte p-5 flex flex-col justify-between h-full min-h-[100px]'>
      {isLoading ? (
        <>
          <Skeleton className='h-3 w-20' />
          <Skeleton className='h-8 w-16 mt-3' />
          <Skeleton className='h-3 w-24 mt-2' />
        </>
      ) : (
        <>
          <div className='flex items-start justify-between gap-1'>
            <div>
              <p className='text-xs text-white/70 font-medium'>{label}</p>
              <p className='text-[10px] text-white/35 mt-0.5'>{sublabel}</p>
            </div>
            {info && (
              <div className='relative group flex-shrink-0'>
                <Info
                  size={12}
                  className='text-white/25 hover:text-white/55 cursor-default transition-colors mt-0.5'
                />
                <div className='absolute right-0 top-5 w-52 p-3 rounded-xl bg-[#13131f] border border-white/10 text-[10px] text-white/65 leading-relaxed opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-lg'>
                  {info}
                </div>
              </div>
            )}
          </div>
          <div className='mt-2'>
            <p
              className='text-4xl font-bold tracking-tight font-mono tabular-nums'
              style={{color}}
            >
              {fmtNum(value)}
            </p>
          </div>
          {typeof delta === 'number' && (
            <p
              className={`text-[10px] mt-1.5 font-mono ${isUp ? 'text-accent-green' : isDown ? 'text-accent-red' : 'text-white/40'}`}
            >
              {isUp ? '↑' : isDown ? '↓' : '→'} {Math.abs(delta).toFixed(1)} vs
              7d ago
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── HR Zone Breakdown ──

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
          className={`px-2 py-1 text-[10px] font-medium transition-colors ${
            value === opt.value
              ? 'bg-white/15 text-white'
              : 'text-white/40 hover:text-white/60'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

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
  const [sportFilter, setSportFilter] = useState<'all' | 'Run'>('all');
  const [grouping, setGrouping] = useState<'all' | 'grouped'>('all');

  const data = useMemo<AggregatedZoneTotals | undefined>(() => {
    if (!breakdownMap || breakdownMap.size === 0) return undefined;
    if (sportFilter === 'all') {
      return aggregateZoneBreakdowns(Array.from(breakdownMap.values()));
    }
    const allowedIds = new Set(
      (activities ?? []).filter((a) => a.type === sportFilter).map((a) => a.id),
    );
    const filtered = Array.from(breakdownMap.entries())
      .filter(([id]) => allowedIds.has(id))
      .map(([, bd]) => bd);
    if (filtered.length === 0) return undefined;
    return aggregateZoneBreakdowns(filtered);
  }, [breakdownMap, activities, sportFilter]);

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
        distance:
          (data.zones[1]?.distance ?? 0) + (data.zones[2]?.distance ?? 0),
        color: ZONE_COLORS[2],
      },
      {
        key: 'intensity',
        label: 'Z3–6 · Intensity',
        time: ([3, 4, 5, 6] as const).reduce(
          (s, z) => s + (data.zones[z]?.time ?? 0),
          0,
        ),
        distance: ([3, 4, 5, 6] as const).reduce(
          (s, z) => s + (data.zones[z]?.distance ?? 0),
          0,
        ),
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
      {/* Header row */}
      <div className='flex items-start justify-between mb-2'>
        <div>
          <h2 className='text-sm font-medium text-white'>Zone Distribution</h2>
          <p className='text-xs text-white/50 mt-0.5'>
            Last 4 weeks · Heart rate
          </p>
        </div>
        <div className='flex items-center gap-2'>
          {isLoading && progress.total > 0 && (
            <span className='text-[10px] text-white/45'>
              {progress.done}/{progress.total}
            </span>
          )}
          <SegmentedControl
            options={[
              {value: 'all' as const, label: 'All'},
              {value: 'Run' as const, label: 'Runs'},
            ]}
            value={sportFilter}
            onChange={setSportFilter}
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

      {/* Zones grouping row */}
      <div className='flex items-center gap-2 mb-4 pb-3 border-b border-white/[0.06]'>
        <span className='text-[10px] text-white/35 font-medium'>
          Zones grouping
        </span>
        <SegmentedControl
          options={[
            {value: 'all' as const, label: '6 zones'},
            {value: 'grouped' as const, label: 'Easy vs Intensity'},
          ]}
          value={grouping}
          onChange={setGrouping}
        />
      </div>

      {isLoading && !data ? (
        <div className='flex-1 space-y-3'>
          {[1, 2, 3, 4, 5, 6].map((z) => (
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
          {/* Bar list */}
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
                      <span className='text-[11px] text-white/60 font-medium'>
                        {zone.label}
                      </span>
                      <span className='text-[11px] text-white/45'>
                        {pct}%{' · '}
                        {metric === 'time'
                          ? formatDuration(zone.time)
                          : `${zone.distance.toFixed(1)} km`}
                      </span>
                    </div>
                    <div className='h-1.5 rounded-full bg-white/[0.06] overflow-hidden'>
                      <motion.div
                        className='h-full rounded-full'
                        style={{background: zone.color}}
                        initial={{width: 0}}
                        animate={{width: `${pct}%`}}
                        transition={{
                          duration: 0.45,
                          delay: i * 0.04,
                          ease: 'easeOut',
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              <p className='text-[10px] text-white/25 pt-0.5'>
                Total:{' '}
                {metric === 'time'
                  ? formatDuration(totalTime)
                  : `${totalDistance.toFixed(1)} km`}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Donut Chart */}
          <AnimatePresence mode='wait' initial={false}>
            <motion.div
              key={grouping}
              className='flex-1 min-h-0'
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
                    isAnimationActive={true}
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
                      const pct =
                        total > 0 ? Math.round((entry.value / total) * 100) : 0;
                      return (
                        <div className='bg-black/80 border border-white/10 rounded-lg px-3 py-2 backdrop-blur-sm'>
                          <p className='text-[11px] text-white font-medium'>
                            {entry.label}
                          </p>
                          <p className='text-[11px] text-white/55 mt-0.5'>
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

// ── Recent Activities ──

function ActivityRow({activity}: {activity: ActivitySummary}) {
  const color = SPORT_COLORS[activity.type] ?? '#ffffff60';
  const d = new Date(activity.date);
  const dateStr = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className='flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/[0.04] transition-colors cursor-default group'>
      <div
        className='w-1.5 h-1.5 rounded-full flex-shrink-0'
        style={{background: color}}
      />
      <div className='flex-1 min-w-0'>
        <p className='text-sm text-white/80 truncate font-medium leading-tight'>
          {activity.name}
        </p>
        <p className='text-[11px] text-white/45 mt-0.5'>
          {dateStr} · {activity.type}
        </p>
      </div>
      <div className='text-right flex-shrink-0'>
        <p className='text-sm text-white/80 font-mono tabular-nums'>
          {activity.distance.toFixed(1)} km
        </p>
        <p className='text-[11px] text-white/45 font-mono tabular-nums'>
          {activity.avgPace > 0 ? `${formatPace(activity.avgPace)}/km` : ''}
          {activity.avgPace > 0 && activity.avgHr > 0 ? ' · ' : ''}
          {activity.avgHr > 0 ? `${Math.round(activity.avgHr)} bpm` : ''}
        </p>
      </div>
    </div>
  );
}

function RecentActivitiesCard({
  activities,
  isLoading,
}: {
  activities: ActivitySummary[] | undefined;
  isLoading: boolean;
}) {
  const recent = activities?.slice(0, 10) ?? [];

  return (
    <div className='bento-card p-5 flex flex-col h-full overflow-hidden'>
      <div className='flex items-center justify-between mb-3'>
        <h2 className='text-sm font-medium text-white'>Recent Activities</h2>
        <Link
          href='/activities'
          className='text-[10px] text-white/45 hover:text-white/70 transition-colors'
        >
          View all →
        </Link>
      </div>

      {isLoading ? (
        <div className='space-y-2'>
          {Array.from({length: 6}).map((_, i) => (
            <div key={i} className='flex items-center gap-3 py-2'>
              <Skeleton className='w-1.5 h-1.5 rounded-full' />
              <div className='flex-1 space-y-1.5'>
                <Skeleton className='h-3 w-3/4' />
                <Skeleton className='h-2 w-1/3' />
              </div>
              <Skeleton className='h-3 w-12' />
            </div>
          ))}
        </div>
      ) : recent.length === 0 ? (
        <div className='flex-1 flex items-center justify-center'>
          <p className='text-xs text-white/25'>No activities yet</p>
        </div>
      ) : (
        <div className='flex-1 overflow-y-auto -mx-2 px-2 space-y-0.5'>
          {recent.map((a) => (
            <ActivityRow key={a.id} activity={a} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stats Strip ──

interface StatTileProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  isLoading: boolean;
  primary?: boolean;
  info?: string;
}

function StatTile({
  label,
  value,
  sub,
  color,
  isLoading,
  primary,
  info,
}: StatTileProps) {
  return (
    <div
      className={`px-6 py-5 flex flex-col justify-between ${primary ? 'border-r border-white/[0.07]' : ''}`}
    >
      {isLoading ? (
        <>
          <Skeleton className='h-2.5 w-20' />
          <Skeleton className={`${primary ? 'h-12 w-28' : 'h-7 w-16'} mt-3`} />
        </>
      ) : (
        <>
          <div className='flex items-center gap-1.5'>
            <p className='text-[10px] text-white/40 font-semibold uppercase tracking-widest'>
              {label}
            </p>
            {info && (
              <div className='relative group'>
                <Info
                  size={10}
                  className='text-white/25 hover:text-white/55 cursor-default transition-colors'
                />
                <div className='absolute left-1/2 -translate-x-1/2 top-5 w-52 p-3 rounded-xl bg-[#13131f] border border-white/10 text-[10px] text-white/65 leading-relaxed opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-lg'>
                  {info}
                </div>
              </div>
            )}
          </div>
          <div className='mt-2 flex items-baseline gap-1.5'>
            <p
              className={`font-mono tracking-tight tabular-nums ${
                primary ? 'text-5xl font-bold' : 'text-2xl font-semibold'
              }`}
              style={{color: color ?? (primary ? '#f5f5f7' : '#c8c8cc')}}
            >
              {value}
            </p>
            {sub && (
              <span
                className={`text-white/35 ${primary ? 'text-sm' : 'text-xs'}`}
              >
                {sub}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatsStrip({
  stats,
  currentIT,
  statsLoading,
  fitnessLoading,
}: {
  stats: StravaAthleteStats | undefined;
  currentIT: number | undefined;
  statsLoading: boolean;
  fitnessLoading: boolean;
}) {
  const ytdKm = stats
    ? Math.round(stats.ytd_run_totals.distance / 1000)
    : undefined;
  const ytdHrs = stats
    ? Math.round(stats.ytd_run_totals.moving_time / 3600)
    : undefined;
  const ytdRuns = stats?.ytd_run_totals.count;

  const tsbColor =
    typeof currentIT === 'number'
      ? currentIT > 5
        ? COLORS.green
        : currentIT < -10
          ? COLORS.red
          : COLORS.yellow
      : undefined;

  return (
    <div
      className='flex items-stretch divide-x divide-white/[0.08] border border-white/[0.10] rounded-2xl overflow-visible bg-white/[0.03]'
      style={{boxShadow: 'var(--shadow-base)'}}
    >
      <div className='flex-[2] min-w-0'>
        <StatTile
          label='YTD Distance'
          value={typeof ytdKm === 'number' ? ytdKm.toLocaleString() : '—'}
          sub='km'
          isLoading={statsLoading}
          primary
        />
      </div>
      <div className='flex-1 min-w-0'>
        <StatTile
          label='YTD Time'
          value={typeof ytdHrs === 'number' ? `${ytdHrs}` : '—'}
          sub='hrs'
          isLoading={statsLoading}
        />
      </div>
      <div className='flex-1 min-w-0'>
        <StatTile
          label='YTD Runs'
          value={typeof ytdRuns === 'number' ? `${ytdRuns}` : '—'}
          isLoading={statsLoading}
        />
      </div>
      <div className='flex-1 min-w-0'>
        <StatTile
          label='Form (TSB)'
          value={typeof currentIT === 'number' ? currentIT.toFixed(1) : '—'}
          color={tsbColor}
          isLoading={fitnessLoading}
          info='Training Stress Balance = CTL − ATL. Positive = fresh (CTL > ATL). Negative = fatigued. > 5: race-ready. −10 to 5: normal training. < −20: recovery priority.'
        />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const {isAuthenticated, isLoading: authLoading, athlete} = useStravaAuth();
  const forceRefresh = useForceRefreshActivities();

  const {data: activities, isLoading: activitiesLoading} =
    useDashboardActivities();
  const {data: stats, isLoading: statsLoading} = useAthleteStats();
  const {data: fitnessData, isLoading: fitnessLoading} = useFitnessData();
  const {
    data: breakdownMap,
    isLoading: zonesLoading,
    progress,
  } = usePerActivityZoneBreakdowns(4);

  const currentTSB = fitnessData?.[fitnessData.length - 1]?.tsb;
  const prev7CTL = fitnessData?.[fitnessData.length - 8]?.ctl;
  const prev7ATL = fitnessData?.[fitnessData.length - 8]?.atl;
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

      <main className='pt-[72px] pb-6 px-5 min-h-screen'>
        <motion.div
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          transition={{duration: 0.4}}
          className='grid grid-cols-12 gap-4 max-w-[1400px] mx-auto'
        >
          {/* Stats strip */}
          <div className='col-span-12'>
            <StatsStrip
              stats={stats}
              currentIT={currentTSB}
              statsLoading={statsLoading}
              fitnessLoading={fitnessLoading}
            />
          </div>

          {/* Training Load + CTL + ATL */}
          <div className='col-span-12 md:col-span-8 h-[260px]'>
            <TrainingLoadCard data={fitnessData} isLoading={fitnessLoading} />
          </div>

          <div className='col-span-6 md:col-span-2 h-[260px]'>
            <MetricCard
              label='CTL'
              sublabel='42-day EWMA'
              value={currentCTL}
              prev7Value={prev7CTL}
              color={COLORS.blue}
              isLoading={fitnessLoading}
              info='Chronic Training Load — your fitness base. 42-day exponential average of daily training load. Higher = more fit. Builds slowly, takes weeks to move.'
            />
          </div>

          <div className='col-span-6 md:col-span-2 h-[260px]'>
            <MetricCard
              label='ATL'
              sublabel='7-day EWMA'
              value={currentATL}
              prev7Value={prev7ATL}
              color={COLORS.orange}
              isLoading={fitnessLoading}
              info='Acute Training Load — your recent fatigue. 7-day exponential average of daily training load. Spikes fast after hard weeks, drops quickly with rest.'
            />
          </div>

          {/* Zones + Recent Activities */}
          <div className='col-span-12 md:col-span-6 min-h-[320px]'>
            <HRZoneCard
              breakdownMap={breakdownMap}
              activities={activities}
              isLoading={zonesLoading}
              progress={progress}
            />
          </div>

          <div className='col-span-12 md:col-span-6 min-h-[320px]'>
            <RecentActivitiesCard
              activities={activities}
              isLoading={activitiesLoading}
            />
          </div>
        </motion.div>
      </main>
    </>
  );
}
