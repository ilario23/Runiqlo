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
import {TopoFitnessChart} from '@/components/rq/TopoFitnessChart';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {
  useFitnessData,
  usePerActivityZoneBreakdowns,
  useDashboardActivities,
  useAdvancedMetricsData,
} from '@/hooks/useStrava';
import {
  formatDuration,
  ZONE_COLORS,
  ZONE_NAMES,
  COLORS,
} from '@/lib/activityModel';
import {aggregateZoneBreakdowns} from '@/lib/zoneCompute';
import {getLatestMetricsSnapshot, calcRiskIntelligence} from '@/utils/trainingLoad';
import type {AggregatedZoneTotals, ZoneBreakdown} from '@/lib/zoneCompute';
import type {ActivitySummary} from '@/lib/activityModel';
import type {FitnessDataPoint, RiskLevel} from '@/utils/trainingLoad';

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmtNum = (n: number | null | undefined, dec = 1) =>
  typeof n === 'number' ? n.toFixed(dec) : '—';

const signed = (n: number, dec = 1) => `${n > 0 ? '+' : ''}${n.toFixed(dec)}`;

function getMondayISO(d: Date): string {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

// Decoupling thresholds map to the zone color vocabulary (One Signal Rule):
// well-coupled = green, mild drift = yellow, decoupled = red.
function decouplingColor(pct: number): string {
  return pct < 5 ? COLORS.green : pct < 8 ? COLORS.yellow : COLORS.red;
}

const RISK_COLOR: Record<RiskLevel, string> = {
  low: COLORS.green,
  moderate: COLORS.yellow,
  high: COLORS.red,
};

// ─── Almanac segmented control ─────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: {value: T; label: string}[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="flex" role="group" aria-label={label} style={{border: '1px solid var(--color-ink)'}}>
      {options.map((opt, i) => {
        const sel = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={sel}
            className="label"
            style={{
              padding: '4px 9px',
              cursor: 'pointer',
              background: sel ? 'var(--color-ink)' : 'transparent',
              color: sel ? 'var(--color-paper)' : 'var(--color-ink-3)',
              borderLeft: i > 0 ? '1px solid var(--color-rule)' : 'none',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Scoreboard tiles ──────────────────────────────────────────────────────────

function acwrNote(v: number | null): string {
  if (v == null || v === 0) return 'acute : chronic';
  if (v < 0.8) return 'detraining';
  if (v <= 1.3) return 'sweet spot';
  if (v <= 1.5) return 'elevated';
  return 'spike risk';
}

function rampNote(v: number | null): string {
  if (v == null) return '—';
  if (v < -10) return 'detraining';
  if (v <= 5) return 'steady';
  if (v <= 10) return 'building';
  if (v <= 15) return 'steep · ease back';
  return 'too steep';
}

function monotonyNote(v: number | null): string {
  if (v == null || v === 0) return 'load sameness';
  if (v < 1.5) return 'well varied';
  if (v < 1.8) return 'moderate';
  if (v < 2.2) return 'high · vary days';
  return 'very high';
}

function Scoreboard({
  fitnessData,
  loading,
}: {
  fitnessData: FitnessDataPoint[] | undefined;
  loading: boolean;
}) {
  const adv = useAdvancedMetricsData();

  const stats = useMemo(() => {
    if (!fitnessData || fitnessData.length === 0) return null;
    const last = fitnessData[fitnessData.length - 1];
    const wk = fitnessData[Math.max(0, fitnessData.length - 8)];
    const snap = adv.length ? getLatestMetricsSnapshot(adv) : null;
    return {
      ctl: last.ctl,
      atl: last.atl,
      tsb: last.tsb,
      ctlDelta: last.ctl - wk.ctl,
      atlDelta: last.atl - wk.atl,
      acwr: snap?.acwr ?? null,
      ramp: snap?.rampRate ?? null,
      monotony: snap?.monotony ?? null,
    };
  }, [fitnessData, adv]);

  if (loading && !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="tile"><Skeleton className="h-16 w-full" /></div>
        ))}
      </div>
    );
  }
  if (!stats) {
    return (
      <p className="body-serif" style={{fontStyle: 'italic'}}>
        No fitness data yet. Sync your activities to build the record.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <div className="tile">
        <div className="tile-label"><span>Fitness · CTL</span><span className="mono">42d</span></div>
        <div className="tile-num">{fmtNum(stats.ctl)}</div>
        <div className={`tile-delta ${stats.ctlDelta >= 0 ? 'up' : 'down'}`}>
          {stats.ctlDelta >= 0 ? '▲' : '▼'} {signed(stats.ctlDelta)} · 7d
        </div>
      </div>
      <div className="tile">
        <div className="tile-label"><span>Fatigue · ATL</span><span className="mono">7d</span></div>
        <div className="tile-num">{fmtNum(stats.atl)}</div>
        <div className={`tile-delta ${stats.atlDelta >= 0 ? 'up' : 'down'}`}>
          {stats.atlDelta >= 0 ? '▲' : '▼'} {signed(stats.atlDelta)} · 7d
        </div>
      </div>
      <div className="tile rust">
        <div className="tile-label"><span>Form · TSB</span><span className="mono">today</span></div>
        <div className="tile-num">{signed(stats.tsb)}</div>
        <div className="tile-delta up">optimal +5 to +15</div>
      </div>
      <div className="tile">
        <div className="tile-label"><span>ACWR</span><span className="mono">ratio</span></div>
        <div className="tile-num">{fmtNum(stats.acwr, 2)}</div>
        <div className="tile-delta">{acwrNote(stats.acwr)}</div>
      </div>
      <div className="tile">
        <div className="tile-label"><span>Ramp</span><span className="mono">/wk</span></div>
        <div className="tile-num">{stats.ramp == null ? '—' : `${signed(stats.ramp)}%`}</div>
        <div className="tile-delta">{rampNote(stats.ramp)}</div>
      </div>
      <div className="tile">
        <div className="tile-label"><span>Monotony</span><span className="mono">7d</span></div>
        <div className="tile-num">{fmtNum(stats.monotony, 2)}</div>
        <div className="tile-delta">{monotonyNote(stats.monotony)}</div>
      </div>
    </div>
  );
}

// ─── Injury-risk panel ──────────────────────────────────────────────────────────

function RiskPanel({loading}: {loading: boolean}) {
  const adv = useAdvancedMetricsData();

  const risk = useMemo(() => {
    if (!adv.length) return null;
    return calcRiskIntelligence(getLatestMetricsSnapshot(adv));
  }, [adv]);

  return (
    <div className="surface-card p-5 flex flex-col h-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="h-section" style={{fontSize: 20}}>Injury risk</span>
          <p className="label" style={{marginTop: 4}}>Load · monotony · ramp</p>
        </div>
        {risk && (
          <span
            className="chip"
            style={{borderColor: RISK_COLOR[risk.riskLevel], color: RISK_COLOR[risk.riskLevel]}}
          >
            {risk.riskLevel}
          </span>
        )}
      </div>

      {loading && !risk ? (
        <div className="mt-5 space-y-3">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : !risk ? (
        <p className="body-serif mt-6" style={{fontStyle: 'italic'}}>
          Not enough load history to assess risk yet.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mt-4">
            <span className="num" style={{fontSize: 44, lineHeight: 1, color: RISK_COLOR[risk.riskLevel]}}>
              {risk.riskScore}
            </span>
            <span className="label">/ 100 score</span>
          </div>

          {risk.topContributors.length > 0 && (
            <div style={{marginTop: 18}}>
              <div className="label">Driving the score</div>
              <ul className="mt-2 space-y-1.5">
                {risk.topContributors.map((c) => (
                  <li key={c} className="num" style={{fontSize: 12, color: 'var(--color-ink-2)'}}>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rq-rule" style={{margin: '16px 0 0'}} />
          <div style={{marginTop: 14}}>
            <div className="label">Coach says</div>
            <ul className="mt-2 space-y-2">
              {risk.recommendedActions.map((a) => (
                <li key={a} className="marginalia" style={{position: 'static', width: 'auto'}}>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Weekly load bars ────────────────────────────────────────────────────────────

function WeeklyLoadCard({
  fitnessData,
  loading,
}: {
  fitnessData: FitnessDataPoint[] | undefined;
  loading: boolean;
}) {
  const weeks = useMemo(() => {
    if (!fitnessData || fitnessData.length === 0) return [];
    const map = new Map<string, number>();
    for (const d of fitnessData) {
      const wk = getMondayISO(new Date(d.date + 'T00:00:00'));
      map.set(wk, (map.get(wk) ?? 0) + d.tl);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(-12)
      .map(([week, load]) => ({week, load: Math.round(load)}));
  }, [fitnessData]);

  const max = Math.max(1, ...weeks.map((w) => w.load));
  const avg = weeks.length ? Math.round(weeks.reduce((s, w) => s + w.load, 0) / weeks.length) : 0;

  return (
    <div className="surface-card p-5 flex flex-col h-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="h-section" style={{fontSize: 20}}>Weekly load</span>
          <p className="label" style={{marginTop: 4}}>Zone-weighted · last 12 weeks</p>
        </div>
        {avg > 0 && (
          <div style={{textAlign: 'right'}}>
            <div className="label">avg</div>
            <div className="num" style={{fontSize: 18}}>{avg}</div>
          </div>
        )}
      </div>

      {loading && weeks.length === 0 ? (
        <Skeleton className="h-[160px] w-full mt-5" />
      ) : weeks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center" style={{minHeight: 160}}>
          <p className="body-serif" style={{fontStyle: 'italic'}}>No load recorded yet.</p>
        </div>
      ) : (
        <div className="flex-1 flex items-end gap-1.5 mt-6" style={{minHeight: 160}}>
          {weeks.map((w, i) => {
            const isLast = i === weeks.length - 1;
            const h = Math.max(2, Math.round((w.load / max) * 140));
            const d = new Date(w.week + 'T00:00:00');
            return (
              <div key={w.week} className="flex-1 flex flex-col items-center justify-end gap-1.5" title={`${w.load} TL`}>
                <span className="num" style={{fontSize: 9, color: 'var(--color-ink-3)'}}>{w.load}</span>
                <motion.div
                  initial={{height: 0}}
                  animate={{height: h}}
                  transition={{duration: 0.4, delay: i * 0.03, ease: 'easeOut'}}
                  style={{
                    width: '100%',
                    background: isLast ? 'var(--color-rust)' : 'var(--color-ink)',
                  }}
                />
                <span className="label" style={{fontSize: 8, letterSpacing: '0.06em'}}>
                  {`${d.getMonth() + 1}/${d.getDate()}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
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
    <div className="surface-card p-5 flex flex-col h-full">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <span className="h-section" style={{fontSize: 20}}>Zone distribution</span>
          <p className="label" style={{marginTop: 4}}>Runs · last 4 weeks</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isLoading && progress.total > 0 && (
            <span className="num" style={{fontSize: 11, color: 'var(--color-ink-3)'}}>{progress.done}/{progress.total}</span>
          )}
          <SegmentedControl
            label="Zone grouping"
            options={[{value: 'grouped' as const, label: '80/20'}, {value: 'all' as const, label: '6 zones'}]}
            value={grouping}
            onChange={setGrouping}
          />
          <SegmentedControl
            label="Metric"
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
        <div className="flex-1 flex items-center justify-center" style={{minHeight: 120}}>
          <p className="body-serif" style={{fontStyle: 'italic'}}>No zone data for the past 4 weeks.</p>
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
                    <span className="label" style={{color: 'var(--color-ink-2)'}}>{zone.label}</span>
                    <span className="num" style={{fontSize: 11, color: 'var(--color-ink-3)'}}>
                      {pct}%{' · '}
                      {metric === 'time' ? formatDuration(zone.time) : `${zone.distance.toFixed(1)} km`}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden" style={{background: 'var(--color-paper-3)'}}>
                    <motion.div
                      className="h-full"
                      style={{background: zone.color}}
                      initial={{width: 0}}
                      animate={{width: `${pct}%`}}
                      transition={{duration: 0.45, delay: i * 0.05, ease: 'easeOut'}}
                    />
                  </div>
                </div>
              );
            })}
            <p className="label pt-1">
              Total · {metric === 'time' ? formatDuration(totalTime) : `${totalDistance.toFixed(1)} km`}
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
    <div className="surface-card px-3 py-2 space-y-0.5 min-w-[160px]">
      <p className="label">{new Date(pt.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}</p>
      <p className="kicker-cell" style={{fontSize: 13}}>{pt.name}</p>
      <p className="num" style={{fontSize: 13, color}}>{pt.decouplingPct > 0 ? '+' : ''}{pt.decouplingPct}% decoupling</p>
      <p className="num" style={{fontSize: 11, color: 'var(--color-ink-3)'}}>{pt.durationMins} min</p>
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

  const dateField = {
    background: 'var(--color-paper)',
    border: '1px solid var(--color-ink)',
    color: 'var(--color-ink)',
  } as const;

  return (
    <div className="surface-card p-5 flex flex-col h-full">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <span className="h-section" style={{fontSize: 20}}>Aerobic decoupling</span>
          <p className="label" style={{marginTop: 4}}>Long runs ≥ 45 min · Pa:Hr drift</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2" style={{background: COLORS.green}} />
            <span className="label">{'<5% coupled'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2" style={{background: COLORS.yellow}} />
            <span className="label">{'5–8%'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2" style={{background: COLORS.red}} />
            <span className="label">{'>8% drift'}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <label className="label flex items-center gap-1.5">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="num px-2 py-1"
            style={{...dateField, fontSize: 11}}
          />
        </label>
        <label className="label flex items-center gap-1.5">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="num px-2 py-1"
            style={{...dateField, fontSize: 11}}
          />
        </label>
      </div>

      {loading ? (
        <Skeleton className="h-[200px] w-full" />
      ) : error ? (
        <div className="h-[200px] flex flex-col items-center justify-center gap-2.5 text-center">
          <p className="body-serif" style={{fontStyle: 'italic'}}>Couldn&apos;t load decoupling data.</p>
          <button onClick={() => setRetry((c) => c + 1)} className="btn">Try again</button>
        </div>
      ) : !points || points.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center">
          <p className="body-serif" style={{fontStyle: 'italic'}}>No long runs with HR data in this range.</p>
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
                tick={{fill: 'var(--color-ink-3)', fontSize: 9}}
                axisLine={false}
                tickLine={false}
                tickCount={5}
              />
              <YAxis
                dataKey="decouplingPct"
                type="number"
                tick={{fill: 'var(--color-ink-3)', fontSize: 9}}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v as number}%`}
                domain={['auto', 'auto']}
              />
              <ReferenceLine y={5} stroke="rgba(26,24,20,0.12)" strokeDasharray="3 3" />
              <ReferenceLine y={8} stroke="rgba(26,24,20,0.08)" strokeDasharray="3 3" />
              <RechartsTooltip content={<DecouplingTooltip />} cursor={{strokeDasharray: '3 3', stroke: 'var(--color-rule)'}} />
              <Scatter
                data={chartData}
                shape={(props: {cx?: number; cy?: number; payload?: {dotColor: string}}) => {
                  const {cx = 0, cy = 0, payload} = props;
                  return <circle cx={cx} cy={cy} r={4.5} fill={payload?.dotColor ?? COLORS.green} stroke="var(--color-paper)" strokeWidth={0.75} />;
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
  const {data: fitnessData, isLoading: fitnessLoading} = useFitnessData();
  const {data: breakdownMap, isLoading: zonesLoading, progress} = usePerActivityZoneBreakdowns(12);

  const last = fitnessData?.[fitnessData.length - 1];
  const today = new Date();
  const dateLine = today.toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'});

  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{background: 'var(--color-paper)'}}>
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{borderColor: 'var(--color-rule)', borderTopColor: 'var(--color-rust)'}} />
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
      <main className="pt-14 pb-24 md:pb-12 min-h-dvh" style={{background: 'var(--color-paper)'}}>
        <motion.div
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          transition={{duration: 0.4}}
          className="max-w-[1100px] mx-auto"
          style={{border: '1px solid var(--color-ink)', borderTop: 'none'}}
        >
          {/* ── Masthead ──────────────────────────────────────────────────── */}
          <div className="masthead">
            <div className="line">
              <span>{dateLine}</span>
            </div>
            <div className="brand">Fitness &amp; Form<sup>The Runner&apos;s Almanac</sup></div>
            <div className="line">
              <span>{last ? `CTL ${fmtNum(last.ctl)}` : '— ctl'}</span>
              <span>{last ? `ATL ${fmtNum(last.atl)}` : '— atl'}</span>
              <span>{last ? `TSB ${signed(last.tsb)}` : '— tsb'}</span>
            </div>
          </div>

          {/* ── Scoreboard ────────────────────────────────────────────────── */}
          <div className="p-5 md:p-6" style={{borderBottom: '1px solid var(--color-ink)'}}>
            <Scoreboard fitnessData={fitnessData} loading={fitnessLoading} />
          </div>

          {/* ── Topographic fitness ridge ─────────────────────────────────── */}
          <div className="p-5 md:p-6" style={{borderBottom: '1px solid var(--color-ink)'}}>
            <TopoFitnessChart fitnessData={fitnessData} loading={fitnessLoading} />
          </div>

          {/* ── Risk + weekly load ────────────────────────────────────────── */}
          <div
            className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-5 p-5 md:p-6"
            style={{borderBottom: '1px solid var(--color-ink)'}}
          >
            <RiskPanel loading={fitnessLoading} />
            <WeeklyLoadCard fitnessData={fitnessData} loading={fitnessLoading} />
          </div>

          {/* ── Zone distribution + decoupling ────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 p-5 md:p-6">
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
