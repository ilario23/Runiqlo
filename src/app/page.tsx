'use client';

import {useState} from 'react';
import Link from 'next/link';
import {motion} from 'framer-motion';
import type {Variants} from 'framer-motion';
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
  useAthleteStats,
  useFitnessData,
  useZoneBreakdowns,
  useForceRefreshActivities,
} from '@/hooks/useStrava';
import {formatPace, formatDuration, ZONE_COLORS, ZONE_NAMES} from '@/lib/activityModel';
import type {ActivitySummary} from '@/lib/activityModel';
import type {FitnessDataPoint} from '@/utils/trainingLoad';
import type {StravaAthleteStats} from '@/lib/strava';
import type {AggregatedZoneTotals} from '@/lib/zoneCompute';

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});

const fmtNum = (n: number | undefined, dec = 1) =>
  typeof n === 'number' ? n.toFixed(dec) : '—';

const cardVariant: Variants = {
  hidden: {opacity: 0, y: 18},
  show: {opacity: 1, y: 0, transition: {duration: 0.35, ease: 'easeOut'}},
};

const containerVariant: Variants = {
  show: {transition: {staggerChildren: 0.07}},
};

// ─── sub-components ───────────────────────────────────────────────────────────

function Skeleton({className = ''}: {className?: string}) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-white/[0.06] ${className}`}
    />
  );
}

function SkeletonCard({className = ''}: {className?: string}) {
  return (
    <div className={`bento-card p-5 ${className}`}>
      <Skeleton className="h-4 w-28 mb-4" />
      <Skeleton className="h-8 w-20 mb-2" />
      <Skeleton className="h-3 w-36" />
    </div>
  );
}

// ── Header ──

function Header({athleteName, onRefresh}: {athleteName?: string; onRefresh: () => void}) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center px-6 backdrop-blur-xl bg-black/70 border-b border-white/[0.07]">
      <div className="flex items-center gap-2 flex-1">
        <div className="w-6 h-6 rounded-lg bg-[#0a84ff] flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
            <path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z"/>
          </svg>
        </div>
        <span className="font-semibold text-sm text-white tracking-tight">Strava Coach</span>
        {athleteName && (
          <span className="text-white/30 text-sm ml-1">· {athleteName}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40"
          aria-label="Refresh data"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-white/60 ${refreshing ? 'animate-spin' : ''}`}
          >
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        <Link
          href="/settings"
          className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] flex items-center justify-center transition-colors cursor-pointer"
          aria-label="Settings"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-white/60"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </div>
    </header>
  );
}

// ── Connect Prompt ──

function ConnectPrompt() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.div
        initial={{opacity: 0, scale: 0.96}}
        animate={{opacity: 1, scale: 1}}
        transition={{duration: 0.4}}
        className="bento-card p-10 max-w-sm w-full text-center space-y-5"
      >
        <div className="w-14 h-14 rounded-2xl bg-[#fc4c02]/15 flex items-center justify-center mx-auto">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#fc4c02">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Connect Strava</h2>
          <p className="text-sm text-white/40 mt-1">
            Link your account to start syncing training data
          </p>
        </div>
        <Link
          href="/settings"
          className="block w-full bg-[#fc4c02] hover:bg-[#fc4c02]/90 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
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
    <div className="bento-card px-3 py-2.5 text-xs space-y-1 min-w-[130px]">
      <p className="text-white/40 mb-1.5">{fmtDate(label)}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{background: p.color}}
            />
            <span className="text-white/60">{p.name}</span>
          </span>
          <span className="font-medium text-white">{p.value?.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

function TrainingLoadCard({data, isLoading}: {data: FitnessDataPoint[] | undefined; isLoading: boolean}) {
  const last90 = data?.slice(-90) ?? [];

  return (
    <div className="bento-card p-5 flex flex-col h-full min-h-[220px]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-medium text-white">Training Load</h2>
          <p className="text-xs text-white/35 mt-0.5">Base Fitness · Load Impact · Intensity Trend</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-medium">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 rounded bg-[#0a84ff] inline-block" />
            <span className="text-white/50">BF</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 rounded bg-[#ff9f0a] inline-block" />
            <span className="text-white/50">LI</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 rounded bg-[#bf5af2] inline-block" />
            <span className="text-white/50">IT</span>
          </span>
        </div>
      </div>

      {isLoading || last90.length === 0 ? (
        <div className="flex-1 flex flex-col gap-2">
          <Skeleton className="flex-1" />
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={last90} margin={{top: 4, right: 4, left: 0, bottom: 0}}>
              <defs>
                <linearGradient id="gradBF" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0a84ff" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#0a84ff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradLI" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff9f0a" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#ff9f0a" stopOpacity={0} />
                </linearGradient>
                <filter id="glow-blue">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 10}}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
              />

              <RechartsTooltip
                content={<ChartTooltip />}
                cursor={{stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1}}
              />

              <Area
                type="monotone"
                dataKey="li"
                name="LI"
                stroke="#ff9f0a"
                strokeWidth={1.5}
                fill="url(#gradLI)"
                dot={false}
                activeDot={{r: 3, fill: '#ff9f0a'}}
              />
              <Area
                type="monotone"
                dataKey="bf"
                name="BF"
                stroke="#0a84ff"
                strokeWidth={2}
                fill="url(#gradBF)"
                dot={false}
                activeDot={{r: 3, fill: '#0a84ff'}}
                filter="url(#glow-blue)"
              />
              <Area
                type="monotone"
                dataKey="it"
                name="IT"
                stroke="#bf5af2"
                strokeWidth={1}
                fill="none"
                dot={false}
                activeDot={{r: 3, fill: '#bf5af2'}}
                strokeDasharray="3 3"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Metric Card (BF / LI) ──

interface MetricCardProps {
  label: string;
  sublabel: string;
  value: number | undefined;
  prev7Value: number | undefined;
  color: string;
  isLoading: boolean;
}

function MetricCard({label, sublabel, value, prev7Value, color, isLoading}: MetricCardProps) {
  const delta = typeof value === 'number' && typeof prev7Value === 'number'
    ? value - prev7Value
    : undefined;
  const isUp = typeof delta === 'number' && delta > 0;
  const isDown = typeof delta === 'number' && delta < 0;

  return (
    <div className="bento-card p-5 flex flex-col justify-between h-full min-h-[100px]">
      {isLoading ? (
        <>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-16 mt-3" />
          <Skeleton className="h-3 w-24 mt-2" />
        </>
      ) : (
        <>
          <div>
            <p className="text-xs text-white/40 font-medium">{label}</p>
            <p className="text-[10px] text-white/25 mt-0.5">{sublabel}</p>
          </div>
          <div className="mt-2">
            <p className="text-3xl font-semibold tracking-tight" style={{color}}>
              {fmtNum(value)}
            </p>
          </div>
          {typeof delta === 'number' && (
            <p className={`text-[10px] mt-1.5 font-medium ${isUp ? 'text-[#30d158]' : isDown ? 'text-[#ff453a]' : 'text-white/30'}`}>
              {isUp ? '↑' : isDown ? '↓' : '→'} {Math.abs(delta).toFixed(1)} vs 7d ago
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── HR Zone Breakdown ──

function HRZoneCard({
  data,
  isLoading,
  progress,
}: {
  data: AggregatedZoneTotals | undefined;
  isLoading: boolean;
  progress: {done: number; total: number};
}) {
  const totalTime = data?.totalTime ?? 0;

  return (
    <div className="bento-card p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-medium text-white">Zone Distribution</h2>
          <p className="text-xs text-white/35 mt-0.5">Last 4 weeks · Heart rate</p>
        </div>
        {isLoading && progress.total > 0 && (
          <span className="text-[10px] text-white/30">
            {progress.done}/{progress.total}
          </span>
        )}
      </div>

      {isLoading && !data ? (
        <div className="flex-1 space-y-3">
          {[1, 2, 3, 4, 5, 6].map((z) => (
            <div key={z} className="space-y-1.5">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
      ) : !data || totalTime === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-white/25">No zone data for past 4 weeks</p>
        </div>
      ) : (
        <div className="flex-1 space-y-3">
          {([1, 2, 3, 4, 5, 6] as const).map((z) => {
            const zone = data.zones[z];
            const pct = zone ? Math.round((zone.time / totalTime) * 100) : 0;
            const color = ZONE_COLORS[z];
            return (
              <div key={z}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-white/50 font-medium">
                    Z{z} · {ZONE_NAMES[z]}
                  </span>
                  <span className="text-[11px] text-white/40">
                    {pct}% · {formatDuration(zone?.time ?? 0)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{background: color}}
                    initial={{width: 0}}
                    animate={{width: `${pct}%`}}
                    transition={{duration: 0.6, delay: z * 0.05, ease: 'easeOut'}}
                  />
                </div>
              </div>
            );
          })}

          <p className="text-[10px] text-white/25 pt-1">
            Total: {formatDuration(totalTime)}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Recent Activities ──

const SPORT_COLORS: Record<string, string> = {
  Run: '#30d158',
  Ride: '#0a84ff',
  Hike: '#ff9f0a',
  Swim: '#bf5af2',
  Walk: '#ffd60a',
};

function ActivityRow({activity}: {activity: ActivitySummary}) {
  const color = SPORT_COLORS[activity.type] ?? '#ffffff60';
  const d = new Date(activity.date);
  const dateStr = d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/[0.04] transition-colors cursor-default group">
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{background: color}}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80 truncate font-medium leading-tight">
          {activity.name}
        </p>
        <p className="text-[11px] text-white/30 mt-0.5">
          {dateStr} · {activity.type}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm text-white/70 font-medium tabular-nums">
          {activity.distance.toFixed(1)} km
        </p>
        {activity.avgPace > 0 && (
          <p className="text-[11px] text-white/30 tabular-nums">
            {formatPace(activity.avgPace)}/km
          </p>
        )}
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
    <div className="bento-card p-5 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-white">Recent Activities</h2>
        {activities && (
          <span className="text-[10px] text-white/30">{activities.length} total</span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({length: 6}).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <Skeleton className="w-1.5 h-1.5 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2 w-1/3" />
              </div>
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      ) : recent.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-white/25">No activities yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-0.5">
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
}

function StatTile({label, value, sub, color, isLoading}: StatTileProps) {
  return (
    <div className="bento-card px-5 py-4 flex flex-col justify-between">
      {isLoading ? (
        <>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-16 mt-2" />
        </>
      ) : (
        <>
          <p className="text-[11px] text-white/40 font-medium uppercase tracking-wide">{label}</p>
          <div className="mt-1.5 flex items-baseline gap-1">
            <p className="text-2xl font-semibold tracking-tight" style={{color: color ?? '#f5f5f7'}}>
              {value}
            </p>
            {sub && <span className="text-xs text-white/30">{sub}</span>}
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
  const ytdKm = stats ? Math.round(stats.ytd_run_totals.distance / 1000) : undefined;
  const ytdHrs = stats ? Math.round(stats.ytd_run_totals.moving_time / 3600) : undefined;
  const ytdRuns = stats?.ytd_run_totals.count;

  const tsbColor =
    typeof currentIT === 'number'
      ? currentIT > 5
        ? '#30d158'
        : currentIT < -10
        ? '#ff453a'
        : '#ffd60a'
      : undefined;

  return (
    <div className="grid grid-cols-4 gap-4">
      <StatTile
        label="YTD Distance"
        value={typeof ytdKm === 'number' ? `${ytdKm.toLocaleString()}` : '—'}
        sub="km"
        isLoading={statsLoading}
      />
      <StatTile
        label="YTD Time"
        value={typeof ytdHrs === 'number' ? `${ytdHrs}` : '—'}
        sub="hrs"
        isLoading={statsLoading}
      />
      <StatTile
        label="YTD Runs"
        value={typeof ytdRuns === 'number' ? `${ytdRuns}` : '—'}
        isLoading={statsLoading}
      />
      <StatTile
        label="Form (TSB)"
        value={typeof currentIT === 'number' ? currentIT.toFixed(1) : '—'}
        color={tsbColor}
        isLoading={fitnessLoading}
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const {isAuthenticated, isLoading: authLoading, athlete} = useStravaAuth();
  const forceRefresh = useForceRefreshActivities();

  const {data: activities, isLoading: activitiesLoading} = useDashboardActivities();
  const {data: stats, isLoading: statsLoading} = useAthleteStats();
  const {data: fitnessData, isLoading: fitnessLoading} = useFitnessData();
  const {data: zones, isLoading: zonesLoading, progress} = useZoneBreakdowns(4);

  const currentIT = fitnessData?.[fitnessData.length - 1]?.it;
  const prev7BF = fitnessData?.[fitnessData.length - 8]?.bf;
  const prev7LI = fitnessData?.[fitnessData.length - 8]?.li;
  const currentBF = fitnessData?.[fitnessData.length - 1]?.bf;
  const currentLI = fitnessData?.[fitnessData.length - 1]?.li;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-[#0a84ff] animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <ConnectPrompt />;
  }

  return (
    <>
      <Header
        athleteName={athlete ? `${athlete.firstname} ${athlete.lastname}` : undefined}
        onRefresh={forceRefresh}
      />

      <main className="pt-[72px] pb-6 px-5 min-h-screen">
        <motion.div
          variants={containerVariant}
          initial="hidden"
          animate="show"
          className="grid grid-cols-12 gap-4 max-w-[1400px] mx-auto"
        >
          {/* Row 1: Training Load + BF + LI */}
          <motion.div variants={cardVariant} className="col-span-12 md:col-span-8 h-[260px]">
            <TrainingLoadCard data={fitnessData} isLoading={fitnessLoading} />
          </motion.div>

          <motion.div variants={cardVariant} className="col-span-6 md:col-span-2 h-[260px]">
            <MetricCard
              label="Base Fitness"
              sublabel="42-day EWMA"
              value={currentBF}
              prev7Value={prev7BF}
              color="#0a84ff"
              isLoading={fitnessLoading}
            />
          </motion.div>

          <motion.div variants={cardVariant} className="col-span-6 md:col-span-2 h-[260px]">
            <MetricCard
              label="Load Impact"
              sublabel="7-day EWMA"
              value={currentLI}
              prev7Value={prev7LI}
              color="#ff9f0a"
              isLoading={fitnessLoading}
            />
          </motion.div>

          {/* Row 2: Zones + Recent Activities */}
          <motion.div variants={cardVariant} className="col-span-12 md:col-span-6 min-h-[320px]">
            <HRZoneCard data={zones} isLoading={zonesLoading} progress={progress} />
          </motion.div>

          <motion.div variants={cardVariant} className="col-span-12 md:col-span-6 min-h-[320px]">
            <RecentActivitiesCard
              activities={activities}
              isLoading={activitiesLoading}
            />
          </motion.div>

          {/* Row 3: Stats strip */}
          <motion.div variants={cardVariant} className="col-span-12">
            <StatsStrip
              stats={stats}
              currentIT={currentIT}
              statsLoading={statsLoading}
              fitnessLoading={fitnessLoading}
            />
          </motion.div>
        </motion.div>
      </main>
    </>
  );
}
