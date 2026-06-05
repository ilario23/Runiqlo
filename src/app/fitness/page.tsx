'use client';

import {useState, useMemo, useEffect} from 'react';
import {motion, AnimatePresence} from 'framer-motion';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import AppHeader from '@/components/AppHeader';
import {ConnectPrompt} from '@/components/ConnectPrompt';
import {Skeleton} from '@/components/ui/skeleton';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {
  useFitnessData,
  usePerActivityZoneBreakdowns,
  useDashboardActivities,
} from '@/hooks/useStrava';
import {
  formatDuration,
  ZONE_COLORS,
  ZONE_NAMES,
  COLORS,
} from '@/lib/activityModel';
import {aggregateZoneBreakdowns} from '@/lib/zoneCompute';
import type {AggregatedZoneTotals, ZoneBreakdown} from '@/lib/zoneCompute';
import type {ActivitySummary} from '@/lib/activityModel';

// Decoupling thresholds map to the zone color vocabulary (One Signal Rule):
// well-coupled = green, mild drift = yellow, decoupled = red.
function decouplingColor(pct: number): string {
  return pct < 5 ? COLORS.green : pct < 8 ? COLORS.yellow : COLORS.red;
}

// ─── Segmented control (shared) ───────────────────────────────────────────────

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
      className="flex rounded-lg overflow-hidden"
      style={{background: 'var(--color-surface-1)', border: '1px solid var(--color-border)'}}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer"
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

// ─── Fitness summary strip ─────────────────────────────────────────────────────

function FitnessHeader() {
  const {data: fitnessData, isLoading} = useFitnessData();
  const last = fitnessData?.[fitnessData.length - 1];
  const ctl = last?.ctl;
  const atl = last?.atl;
  const tsb = last?.tsb;

  const items = [
    {label: 'Fitness', sub: 'CTL', value: ctl, color: COLORS.blue},
    {label: 'Fatigue', sub: 'ATL', value: atl, color: COLORS.orange},
    {
      label: 'Form',
      sub: 'TSB',
      value: tsb,
      color: typeof tsb === 'number' ? (tsb > 5 ? COLORS.green : tsb < -10 ? COLORS.red : COLORS.yellow) : COLORS.yellow,
      signed: true,
    },
  ];

  return (
    <section className="pt-2 pb-6 border-b border-[var(--color-border)]">
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-4" style={{color: 'var(--color-text-2)'}}>
        Current fitness
      </p>
      <div className="grid grid-cols-3 gap-3 sm:gap-6">
        {items.map((it) => (
          <div key={it.sub}>
            <div className="flex items-baseline gap-1.5 mb-1.5">
              <span className="text-[11px] font-medium" style={{color: 'var(--color-text-1)'}}>{it.label}</span>
              <span className="text-[10px] font-mono" style={{color: 'var(--color-text-2)'}}>{it.sub}</span>
            </div>
            {isLoading && it.value === undefined ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums leading-none" style={{color: it.color}}>
                {typeof it.value === 'number'
                  ? `${it.signed && it.value > 0 ? '+' : ''}${it.value.toFixed(1)}`
                  : '—'}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Zone Distribution ─────────────────────────────────────────────────────────

function ZoneDistributionCard({
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

  return (
    <div className="surface-card p-5 flex flex-col">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold" style={{color: 'var(--color-text-1)'}}>Zone Distribution</h2>
          <p className="text-xs mt-0.5" style={{color: 'var(--color-text-2)'}}>Runs · Last 4 weeks</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isLoading && progress.total > 0 && (
            <span className="text-xs" style={{color: 'var(--color-text-2)'}}>{progress.done}/{progress.total}</span>
          )}
          <SegmentedControl
            options={[{value: 'grouped' as const, label: '80/20'}, {value: 'all' as const, label: '6 zones'}]}
            value={grouping}
            onChange={setGrouping}
          />
          <SegmentedControl
            options={[{value: 'time' as const, label: 'Time'}, {value: 'distance' as const, label: 'KM'}]}
            value={metric}
            onChange={setMetric}
          />
        </div>
      </div>

      {isLoading && !data ? (
        <div className="space-y-4 py-2">
          {[1, 2, 3, 4].map((z) => (
            <div key={z} className="space-y-1.5">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-2.5 w-full" />
            </div>
          ))}
        </div>
      ) : !data || totalTime === 0 ? (
        <div className="py-12 flex items-center justify-center">
          <p className="text-xs" style={{color: 'var(--color-text-2)'}}>No zone data for the past 4 weeks</p>
        </div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={grouping}
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.15}}
            className="space-y-3"
          >
            {displayZones.map((zone, i) => {
              const value = metric === 'time' ? zone.time : zone.distance;
              const pct = total > 0 ? Math.round((value / total) * 100) : 0;
              return (
                <div key={zone.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium" style={{color: 'var(--color-text-1)'}}>{zone.label}</span>
                    <span className="text-xs font-mono tabular-nums" style={{color: 'var(--color-text-2)'}}>
                      {pct}%{' · '}
                      {metric === 'time' ? formatDuration(zone.time) : `${zone.distance.toFixed(1)} km`}
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{background: 'var(--color-surface-1)'}}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{background: zone.color}}
                      initial={{width: 0}}
                      animate={{width: `${pct}%`}}
                      transition={{duration: 0.45, delay: i * 0.05, ease: 'easeOut'}}
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-xs pt-1" style={{color: 'var(--color-text-2)'}}>
              Total: {metric === 'time' ? formatDuration(totalTime) : `${totalDistance.toFixed(1)} km`}
            </p>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

// ─── Aerobic Decoupling ────────────────────────────────────────────────────────

type DecouplingPoint = {
  activityId: number;
  date: string;
  name: string;
  durationMins: number;
  decouplingPct: number;
};

function DecouplingTooltip({active, payload}: {active?: boolean; payload?: Array<{payload?: DecouplingPoint}>}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;
  const color = decouplingColor(pt.decouplingPct);
  return (
    <div className="surface-card px-3 py-2 text-xs space-y-0.5 min-w-[160px]">
      <p style={{color: 'var(--color-text-2)'}}>{new Date(pt.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}</p>
      <p className="font-medium truncate" style={{color: 'var(--color-text-1)'}}>{pt.name}</p>
      <p className="font-mono" style={{color}}>{pt.decouplingPct > 0 ? '+' : ''}{pt.decouplingPct}% decoupling</p>
      <p style={{color: 'var(--color-text-2)'}}>{pt.durationMins} min</p>
    </div>
  );
}

function DecouplingCard({breakdownsReady}: {breakdownsReady: boolean}) {
  const {athlete} = useStravaAuth();
  const defaultTo = new Date().toISOString().slice(0, 10);
  const defaultFrom = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 84);
    return d.toISOString().slice(0, 10);
  })();

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [points, setPoints] = useState<DecouplingPoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!athlete?.id) return;
    setLoading(true);
    setError(false);
    fetch(`/api/decoupling?athleteId=${athlete.id}&from=${from}&to=${to}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: DecouplingPoint[]) => setPoints(data))
      .catch(() => { setError(true); setPoints(null); })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athlete?.id, from, to, breakdownsReady, retry]);

  const chartData = (points ?? []).map((p) => ({
    ...p,
    dateMs: new Date(p.date).getTime(),
    dotColor: decouplingColor(p.decouplingPct),
  }));

  return (
    <div className="surface-card p-5">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold" style={{color: 'var(--color-text-1)'}}>Aerobic Decoupling</h2>
          <p className="text-xs mt-0.5" style={{color: 'var(--color-text-2)'}}>Long runs ≥ 45 min · Pa:Hr ratio</p>
        </div>
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{background: COLORS.green}} />
            <span style={{color: 'var(--color-text-2)'}}>{'<5% coupled'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{background: COLORS.yellow}} />
            <span style={{color: 'var(--color-text-2)'}}>{'5–8%'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{background: COLORS.red}} />
            <span style={{color: 'var(--color-text-2)'}}>{'>8% decoupled'}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 text-xs">
        <label className="flex items-center gap-1.5" style={{color: 'var(--color-text-2)'}}>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-2 py-1 rounded-lg text-xs font-mono"
            style={{background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', color: 'var(--color-text-1)'}}
          />
        </label>
        <label className="flex items-center gap-1.5" style={{color: 'var(--color-text-2)'}}>
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-2 py-1 rounded-lg text-xs font-mono"
            style={{background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', color: 'var(--color-text-1)'}}
          />
        </label>
      </div>

      {loading ? (
        <Skeleton className="h-[200px] w-full" />
      ) : error ? (
        <div className="h-[200px] flex flex-col items-center justify-center gap-2.5 text-center">
          <p className="text-xs" style={{color: 'var(--color-text-2)'}}>Couldn&apos;t load decoupling data.</p>
          <button
            onClick={() => setRetry((c) => c + 1)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{background: 'var(--color-surface-1)', color: 'var(--color-text-1)'}}
          >
            Try again
          </button>
        </div>
      ) : !points || points.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center">
          <p className="text-xs" style={{color: 'var(--color-text-2)'}}>
            No long runs with HR data in this range
          </p>
        </div>
      ) : (
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{top: 4, right: 8, left: -20, bottom: 0}}>
              <XAxis
                dataKey="dateMs"
                type="number"
                domain={['dataMin', 'dataMax']}
                scale="time"
                tickFormatter={(v) => new Date(v as number).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}
                tick={{fill: 'var(--color-text-3)', fontSize: 9}}
                axisLine={false}
                tickLine={false}
                tickCount={5}
              />
              <YAxis
                dataKey="decouplingPct"
                type="number"
                tick={{fill: 'var(--color-text-3)', fontSize: 9}}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v as number}%`}
                domain={['auto', 'auto']}
              />
              <ReferenceLine y={5} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
              <ReferenceLine y={8} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <RechartsTooltip content={<DecouplingTooltip />} cursor={{strokeDasharray: '3 3', stroke: 'var(--color-border)'}} />
              <Scatter
                data={chartData}
                shape={(props: {cx?: number; cy?: number; payload?: {dotColor: string}}) => {
                  const {cx = 0, cy = 0, payload} = props;
                  return <circle cx={cx} cy={cy} r={5} fill={payload?.dotColor ?? COLORS.green} opacity={0.85} />;
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function FitnessPage() {
  const {isAuthenticated, isLoading: authLoading} = useStravaAuth();
  const {data: activities} = useDashboardActivities();
  const {data: breakdownMap, isLoading: zonesLoading, progress} = usePerActivityZoneBreakdowns(12);

  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{background: 'var(--color-base)'}}>
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <AppHeader />
        <ConnectPrompt subtitle="Connect Strava to explore your fitness analytics." />
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="pt-[72px] pb-24 md:pb-12 px-5 min-h-dvh" style={{background: 'var(--color-base)'}}>
        <motion.div
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          transition={{duration: 0.4}}
          className="max-w-[900px] mx-auto"
        >
          <header className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight" style={{color: 'var(--color-text-1)'}}>Fitness</h1>
            <p className="text-sm mt-1" style={{color: 'var(--color-text-2)'}}>
              Training intensity and aerobic efficiency over time.
            </p>
          </header>

          <FitnessHeader />

          <div className="grid grid-cols-1 gap-4 mt-6">
            <ZoneDistributionCard
              breakdownMap={breakdownMap}
              activities={activities}
              isLoading={zonesLoading}
              progress={progress}
            />
            <DecouplingCard breakdownsReady={!zonesLoading && !!breakdownMap} />
          </div>
        </motion.div>
      </main>
    </>
  );
}
