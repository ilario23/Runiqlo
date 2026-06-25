'use client';

import {useState, useMemo} from 'react';
import dynamic from 'next/dynamic';
import {motion, AnimatePresence} from 'framer-motion';
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
  useAthleteStats,
  useBestEffortsData,
} from '@/hooks/useStrava';
import {calcPrimaryVdot} from '@/lib/vdot';
import {
  formatDuration,
  formatPace,
  ZONE_COLORS,
  ZONE_NAMES,
  COLORS,
  SPORT_COLORS,
} from '@/lib/activityModel';
import {aggregateZoneBreakdowns} from '@/lib/zoneCompute';
import {getLatestMetricsSnapshot, calcRiskIntelligence} from '@/utils/trainingLoad';
import {RQ, scaleTo, smoothPath, type Pt} from '@/components/rq/charts';
import type {AggregatedZoneTotals, ZoneBreakdown} from '@/lib/zoneCompute';
import type {ActivitySummary} from '@/lib/activityModel';
import type {FitnessDataPoint, RiskLevel, AdvancedMetricsDataPoint} from '@/utils/trainingLoad';
import type {StravaActivityTotal} from '@/lib/strava';

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
    <div className="flex" role="group" aria-label={label} style={{border: '1px solid var(--text)'}}>
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
              background: sel ? 'var(--text)' : 'transparent',
              color: sel ? 'var(--bg)' : 'var(--faint)',
              borderLeft: i > 0 ? '1px solid var(--line)' : 'none',
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

const VDOT_CONFIDENCE_COLOR: Record<string, string> = {
  fresh: 'var(--color-zone-green)',
  stale: 'var(--color-gold)',
  very_stale: 'var(--faint)',
};

function Scoreboard({
  fitnessData,
  loading,
}: {
  fitnessData: FitnessDataPoint[] | undefined;
  loading: boolean;
}) {
  const adv = useAdvancedMetricsData();
  const {data: bestEfforts} = useBestEffortsData();

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

  const vdot = useMemo(() => bestEfforts?.bests ? calcPrimaryVdot(bestEfforts.bests) : null, [bestEfforts]);

  if (loading && !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
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
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 [&>:last-child]:max-lg:col-span-2 [&>:last-child]:md:col-span-1">
      <div className="tile">
        <div className="tile-label">
          <span>VDOT · index</span>
          {vdot && <span style={{color: VDOT_CONFIDENCE_COLOR[vdot.confidence]}}>●</span>}
        </div>
        <div className="tile-num">{vdot ? vdot.vdot.toFixed(1) : '—'}</div>
        <div className="tile-delta">
          {vdot ? `${vdot.distance} · ${vdot.effortAgeDays}d` : 'no race data'}
        </div>
      </div>
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
                  <li key={c} className="num" style={{fontSize: 12, color: 'var(--dim)'}}>
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
                <span className="num" style={{fontSize: 9, color: 'var(--faint)'}}>{w.load}</span>
                <motion.div
                  initial={{height: 0}}
                  animate={{height: h}}
                  transition={{duration: 0.4, delay: i * 0.03, ease: 'easeOut'}}
                  style={{
                    width: '100%',
                    background: isLast ? 'var(--accent)' : 'var(--text)',
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
            <span className="num" style={{fontSize: 11, color: 'var(--faint)'}}>{progress.done}/{progress.total}</span>
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
                    <span className="label" style={{color: 'var(--dim)'}}>{zone.label}</span>
                    <span className="num" style={{fontSize: 11, color: 'var(--faint)'}}>
                      {pct}%{' · '}
                      {metric === 'time' ? formatDuration(zone.time) : `${zone.distance.toFixed(1)} km`}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden" style={{background: 'var(--panel-2)'}}>
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

// ─── Aerobic Decoupling (recharts — lazy-loaded, client only) ──────────────────

const DecouplingCard = dynamic(
  () => import('./charts').then((m) => m.DecouplingCard),
  {
    ssr: false,
    loading: () => (
      <div className="surface-card p-5 flex flex-col h-full" style={{minHeight: 348}}>
        <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
          <div>
            <span className="h-section" style={{fontSize: 20}}>Aerobic decoupling</span>
            <p className="label" style={{marginTop: 4}}>Long runs ≥ 45 min · Pa:Hr drift</p>
          </div>
        </div>
        <Skeleton className="h-[30px] w-64 mb-4" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    ),
  },
);

// ─── Editorial line-trend chart ────────────────────────────────────────────────

type TrendPt = {date: string; value: number};

const fmtMonth = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'});

function TrendChart({
  points,
  color,
  band,
  thresholds,
  height = 150,
  invert = false,
}: {
  points: TrendPt[];
  color: string;
  band?: {lo: number; hi: number};
  thresholds?: {y: number; color: string}[];
  height?: number;
  invert?: boolean; // lower-is-better series (fill below color reads as "good")
}) {
  const X = 40, Y = 14, pad = 40;
  const W = 560, H = height - pad, VB_W = 620, VB_H = height;

  const geom = useMemo(() => {
    if (points.length < 2) return null;
    const vals = points.map((p) => p.value);
    let yMin = Math.min(...vals, band?.lo ?? Infinity);
    let yMax = Math.max(...vals, band?.hi ?? -Infinity);
    if (thresholds) for (const t of thresholds) { yMin = Math.min(yMin, t.y); yMax = Math.max(yMax, t.y); }
    const span = (yMax - yMin) || 1;
    yMin -= span * 0.12;
    yMax += span * 0.12;
    const n = points.length - 1;
    const opts = {x0: X, y0: Y, w: W, h: H, xMin: 0, xMax: n, yMin, yMax};
    const scaled = scaleTo(points.map((p, i): Pt => [i, p.value]), opts);
    const yPos = (v: number) => Y + H - ((v - yMin) / (yMax - yMin)) * H;
    const xTicks = [0, 0.5, 1].map((p) => ({
      pos: p,
      label: p === 1 ? 'Today' : fmtMonth(points[Math.round(p * n)].date),
    }));
    return {d: smoothPath(scaled), yPos, yMin, yMax, xTicks};
  }, [points, band, thresholds, H]);

  if (!geom) {
    return (
      <div className="flex items-center justify-center" style={{height}}>
        <p className="body-serif" style={{fontStyle: 'italic'}}>Not enough qualifying runs yet.</p>
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} style={{width: '100%', height, display: 'block'}} preserveAspectRatio="none">
      {/* safe band */}
      {band && (
        <rect
          x={X} width={W}
          y={geom.yPos(band.hi)} height={Math.max(0, geom.yPos(band.lo) - geom.yPos(band.hi))}
          fill={COLORS.green} fillOpacity={0.1}
        />
      )}
      {/* threshold lines */}
      {thresholds?.map((t, i) => (
        <line key={i} x1={X} y1={geom.yPos(t.y)} x2={X + W} y2={geom.yPos(t.y)} stroke={t.color} strokeWidth={0.8} strokeDasharray="3 3" strokeOpacity={0.7} />
      ))}
      {/* fill under line */}
      <path d={`${geom.d} L ${X + W},${Y + H} L ${X},${Y + H} Z`} fill={color} fillOpacity={invert ? 0.05 : 0.08} />
      <path d={geom.d} stroke={color} strokeWidth={1.6} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {/* y labels */}
      {[geom.yMax, (geom.yMin + geom.yMax) / 2, geom.yMin].map((v, i) => (
        <text key={i} x={X - 6} y={geom.yPos(v) + 3} fontSize={9} fontFamily="var(--mono)" fill={RQ.ink3} textAnchor="end">
          {Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)}
        </text>
      ))}
      {/* x labels */}
      {geom.xTicks.map((t, i) => (
        <text key={i} x={X + t.pos * W} y={Y + H + 18} fontSize={9} fontFamily="var(--mono)" fill={RQ.ink3} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>
          {t.label}
        </text>
      ))}
      {/* today marker */}
      <line x1={X + W} y1={Y - 4} x2={X + W} y2={Y + H + 4} stroke={RQ.rust} strokeWidth={1} strokeDasharray="2 2" />
    </svg>
  );
}

function DeltaTag({delta, goodWhenNegative = false, unit = '', windowLabel = '4w'}: {delta: number | null; goodWhenNegative?: boolean; unit?: string; windowLabel?: string}) {
  if (delta == null) return null;
  const improving = goodWhenNegative ? delta < 0 : delta > 0;
  const flat = Math.abs(delta) < (unit === 'pace' ? 0.5 : 0.05);
  return (
    <span className={`tile-delta ${flat ? '' : improving ? 'up' : 'down'}`} style={{display: 'inline-block', marginTop: 0}}>
      {flat ? '–' : improving ? '▲' : '▼'} {delta > 0 ? '+' : ''}{delta.toFixed(unit === 'pace' ? 0 : 1)}{unit === 'pace' ? 's' : unit} · {windowLabel}
    </span>
  );
}

// ─── Performance: aerobic efficiency + threshold pace ───────────────────────────

function seriesDelta(pts: TrendPt[], back = 28): number | null {
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1].value;
  const ref = pts[Math.max(0, pts.length - 1 - back)].value;
  return Number((last - ref).toFixed(4));
}

function PerformanceCard({adv, loading}: {adv: AdvancedMetricsDataPoint[]; loading: boolean}) {
  const ef = useMemo(
    () => adv.filter((d) => d.efficiencyFactor != null).map((d) => ({date: d.date, value: d.efficiencyFactor! * 1000})).slice(-90),
    [adv],
  );
  const thr = useMemo(
    () => adv.filter((d) => d.thresholdPace != null).map((d) => ({date: d.date, value: d.thresholdPace!})).slice(-90),
    [adv],
  );
  const efNow = ef.at(-1)?.value ?? null;
  const efDelta = seriesDelta(ef);
  const thrNow = thr.at(-1)?.value ?? null;
  const thrDelta = seriesDelta(thr, 42);

  return (
    <div className="surface-card p-5 flex flex-col h-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="h-section" style={{fontSize: 20}}>Aerobic efficiency</span>
          <p className="label" style={{marginTop: 4}}>Speed per heartbeat · higher is fitter</p>
        </div>
        <div className="flex gap-6">
          <div style={{textAlign: 'right'}}>
            <div className="label">EF ×10³</div>
            <div className="num" style={{fontSize: 22}}>{efNow == null ? '—' : efNow.toFixed(1)}</div>
            <DeltaTag delta={efDelta} />
          </div>
          <div style={{textAlign: 'right'}}>
            <div className="label">Threshold</div>
            <div className="num" style={{fontSize: 22}}>{thrNow == null ? '—' : formatPace(thrNow)}<span style={{fontSize: 11, color: 'var(--faint)'}}>/km</span></div>
            <DeltaTag delta={thrDelta} goodWhenNegative unit="pace" windowLabel="6w" />
          </div>
        </div>
      </div>

      <div className="flex-1 mt-4" style={{minHeight: 150}}>
        {loading && ef.length === 0 ? (
          <Skeleton className="h-[150px] w-full" />
        ) : (
          <TrendChart points={ef} color={COLORS.green} />
        )}
      </div>
    </div>
  );
}

// ─── ACWR trend ──────────────────────────────────────────────────────────────────

function AcwrTrendCard({adv, loading}: {adv: AdvancedMetricsDataPoint[]; loading: boolean}) {
  const pts = useMemo(
    () => adv.filter((d) => d.acwr > 0).map((d) => ({date: d.date, value: d.acwr})).slice(-90),
    [adv],
  );
  const now = pts.at(-1)?.value ?? null;

  return (
    <div className="surface-card p-5 flex flex-col h-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="h-section" style={{fontSize: 20}}>Acute : chronic</span>
          <p className="label" style={{marginTop: 4}}>Sweet spot 0.8–1.3 · spike &gt; 1.5</p>
        </div>
        <div style={{textAlign: 'right'}}>
          <div className="label">now</div>
          <div className="num" style={{fontSize: 22, color: now != null && now > 1.5 ? COLORS.red : 'var(--text)'}}>{fmtNum(now, 2)}</div>
        </div>
      </div>

      <div className="flex-1 mt-4" style={{minHeight: 150}}>
        {loading && pts.length === 0 ? (
          <Skeleton className="h-[150px] w-full" />
        ) : (
          <TrendChart points={pts} color={RQ.ink} band={{lo: 0.8, hi: 1.3}} thresholds={[{y: 1.5, color: COLORS.red}]} />
        )}
      </div>
    </div>
  );
}

// ─── Monotony & strain ────────────────────────────────────────────────────────────

function MonotonyStrainCard({adv, loading}: {adv: AdvancedMetricsDataPoint[]; loading: boolean}) {
  const mon = useMemo(
    () => adv.filter((d) => d.monotony > 0).map((d) => ({date: d.date, value: d.monotony})).slice(-90),
    [adv],
  );
  const monNow = mon.at(-1)?.value ?? null;
  const strainNow = adv.at(-1)?.strain ?? null;

  return (
    <div className="surface-card p-5 flex flex-col h-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="h-section" style={{fontSize: 20}}>Monotony &amp; strain</span>
          <p className="label" style={{marginTop: 4}}>Day-to-day sameness · &gt; 2.0 is high</p>
        </div>
        <div className="flex gap-6">
          <div style={{textAlign: 'right'}}>
            <div className="label">monotony</div>
            <div className="num" style={{fontSize: 22, color: monNow != null && monNow > 2 ? COLORS.red : 'var(--text)'}}>{fmtNum(monNow, 2)}</div>
          </div>
          <div style={{textAlign: 'right'}}>
            <div className="label">strain</div>
            <div className="num" style={{fontSize: 22}}>{strainNow == null ? '—' : Math.round(strainNow)}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 mt-4" style={{minHeight: 150}}>
        {loading && mon.length === 0 ? (
          <Skeleton className="h-[150px] w-full" />
        ) : (
          <TrendChart points={mon} color={COLORS.orange} thresholds={[{y: 2, color: COLORS.red}]} />
        )}
      </div>
    </div>
  );
}

// ─── Activity heatmap (GitHub-style contribution calendar) ─────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

type HeatDay = {key: string; date: Date; types: Map<string, number>; totalSec: number} | null;

// Intensity tiers by total moving time — color reads as activity type, opacity as volume.
function intensityOpacity(totalSec: number): number {
  const min = totalSec / 60;
  if (min >= 90) return 1;
  if (min >= 60) return 0.82;
  if (min >= 30) return 0.62;
  return 0.42;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ActivityHeatmapCard({
  activities,
  loading,
}: {
  activities: ActivitySummary[] | undefined;
  loading: boolean;
}) {
  const model = useMemo(() => {
    // Index activities by local calendar day (ActivitySummary.date is YYYY-MM-DD).
    const dayMap = new Map<string, {types: Map<string, number>; totalSec: number}>();
    for (const a of activities ?? []) {
      if (!a.date) continue;
      let bucket = dayMap.get(a.date);
      if (!bucket) {
        bucket = {types: new Map(), totalSec: 0};
        dayMap.set(a.date, bucket);
      }
      bucket.types.set(a.type, (bucket.types.get(a.type) ?? 0) + a.duration);
      bucket.totalSec += a.duration;
    }

    // Window: ~52 weeks ending today, aligned to a Sunday-start grid.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - 364);
    start.setDate(start.getDate() - start.getDay()); // back up to Sunday

    const weeks: HeatDay[][] = [];
    const cursor = new Date(start);
    while (cursor <= today) {
      const col: HeatDay[] = [];
      for (let r = 0; r < 7; r++) {
        if (cursor > today) {
          col.push(null);
        } else {
          const key = dateKey(cursor);
          const bucket = dayMap.get(key);
          col.push({
            key,
            date: new Date(cursor),
            types: bucket?.types ?? new Map(),
            totalSec: bucket?.totalSec ?? 0,
          });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(col);
    }

    // Month labels: place at the first week whose top row enters a new month.
    const monthLabels = weeks.map((col, i) => {
      const first = col.find((d): d is NonNullable<HeatDay> => d != null);
      if (!first) return '';
      const m = first.date.getMonth();
      const prev = weeks[i - 1]?.find((d): d is NonNullable<HeatDay> => d != null);
      if (i === 0 || (prev && prev.date.getMonth() !== m)) return MONTH_ABBR[m];
      return '';
    });

    // Per-type totals (active days + sessions) for the legend, sorted by frequency.
    const typeStats = new Map<string, {days: number; sessions: number}>();
    let activeDays = 0;
    let totalSessions = 0;
    for (const bucket of dayMap.values()) {
      if (bucket.types.size === 0) continue;
      activeDays++;
      for (const [type] of bucket.types) {
        const s = typeStats.get(type) ?? {days: 0, sessions: 0};
        s.days++;
        typeStats.set(type, s);
      }
    }
    for (const a of activities ?? []) {
      if (!a.date) continue;
      const s = typeStats.get(a.type);
      if (s) s.sessions++;
      totalSessions++;
    }
    const legend = Array.from(typeStats.entries()).sort((a, b) => b[1].sessions - a[1].sessions);

    return {weeks, monthLabels, legend, activeDays, totalSessions};
  }, [activities]);

  const dominantType = (types: Map<string, number>): string | null => {
    let best: string | null = null;
    let bestSec = -1;
    for (const [type, sec] of types) {
      if (sec > bestSec) {
        bestSec = sec;
        best = type;
      }
    }
    return best;
  };

  const CELL = 11;
  const GAP = 3;
  const dayRowLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  return (
    <div className="p-5 md:p-7" style={{borderBottom: '1px solid var(--text)'}}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <span className="h-section" style={{fontSize: 22}}>Activity calendar</span>
          <p className="label" style={{marginTop: 4}}>Last 52 weeks · color by sport</p>
        </div>
        {model.totalSessions > 0 && (
          <div style={{textAlign: 'right'}}>
            <div className="label">{model.activeDays} active days</div>
            <div className="num" style={{fontSize: 18}}>{model.totalSessions} sessions</div>
          </div>
        )}
      </div>

      {loading && model.totalSessions === 0 ? (
        <Skeleton className="h-[140px] w-full mt-5" />
      ) : model.totalSessions === 0 ? (
        <div className="flex items-center justify-center" style={{minHeight: 120}}>
          <p className="body-serif" style={{fontStyle: 'italic'}}>No activities in the past year yet.</p>
        </div>
      ) : (
        <>
          <div className="mt-5 overflow-x-auto pb-1">
            <div style={{display: 'inline-flex', flexDirection: 'column', gap: GAP}}>
              {/* month labels */}
              <div style={{display: 'flex', gap: GAP, marginLeft: 30}}>
                {model.monthLabels.map((label, i) => (
                  <div
                    key={i}
                    className="label"
                    style={{width: CELL, fontSize: 9, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'visible'}}
                  >
                    {label}
                  </div>
                ))}
              </div>
              {/* day labels + grid */}
              <div style={{display: 'flex', gap: GAP}}>
                <div style={{display: 'flex', flexDirection: 'column', gap: GAP, width: 27}}>
                  {dayRowLabels.map((label, r) => (
                    <div
                      key={r}
                      className="label"
                      style={{height: CELL, fontSize: 8, lineHeight: `${CELL}px`, textAlign: 'right'}}
                    >
                      {label}
                    </div>
                  ))}
                </div>
                <div style={{display: 'flex', gap: GAP}}>
                  {model.weeks.map((col, i) => (
                    <div key={i} style={{display: 'flex', flexDirection: 'column', gap: GAP}}>
                      {col.map((day, r) => {
                        if (!day) {
                          return <div key={r} style={{width: CELL, height: CELL}} />;
                        }
                        const type = dominantType(day.types);
                        const hasActivity = type != null;
                        const color = hasActivity
                          ? SPORT_COLORS[type] ?? COLORS.grey
                          : 'var(--panel-2)';
                        const opacity = hasActivity ? intensityOpacity(day.totalSec) : 1;
                        const title = hasActivity
                          ? `${day.date.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})} · ${Array.from(
                              day.types.keys(),
                            ).join(', ')} · ${formatDuration(day.totalSec)}`
                          : day.date.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
                        return (
                          <div
                            key={r}
                            title={title}
                            style={{
                              width: CELL,
                              height: CELL,
                              background: color,
                              opacity,
                              borderRadius: 2,
                            }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* sport legend */}
          <div className="flex items-center gap-4 flex-wrap mt-4">
            {model.legend.map(([type, s]) => (
              <div key={type} className="flex items-center gap-1.5">
                <span
                  className="inline-block"
                  style={{width: 9, height: 9, borderRadius: 2, background: SPORT_COLORS[type] ?? COLORS.grey}}
                />
                <span className="label" style={{color: 'var(--dim)'}}>{type}</span>
                <span className="num" style={{fontSize: 10, color: 'var(--faint)'}}>{s.sessions}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Season ledger ────────────────────────────────────────────────────────────────

function SeasonLedger() {
  const {data: stats, isLoading} = useAthleteStats();
  const year = new Date().getFullYear();

  const rows: {label: string; t: StravaActivityTotal}[] = stats
    ? [
        {label: 'Last 4 weeks', t: stats.recent_run_totals},
        {label: `${year} to date`, t: stats.ytd_run_totals},
        {label: 'All time', t: stats.all_run_totals},
      ]
    : [];

  return (
    <div className="p-5 md:p-7">
      <div className="flex items-baseline justify-between">
        <span className="h-section" style={{fontSize: 22}}>Season record</span>
        <span className="label">Runs only</span>
      </div>

      {isLoading && !stats ? (
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : !stats ? (
        <p className="body-serif mt-5" style={{fontStyle: 'italic'}}>No athlete totals available.</p>
      ) : (
        <table className="ledger mt-3">
          <thead>
            <tr>
              <th>Window</th>
              <th style={{textAlign: 'right'}}>Runs</th>
              <th style={{textAlign: 'right'}}>Distance</th>
              <th style={{textAlign: 'right'}}>Time</th>
              <th style={{textAlign: 'right'}}>Elevation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({label, t}) => (
              <tr key={label}>
                <td className="kicker-cell">{label}</td>
                <td className="num-cell">{t.count}</td>
                <td className="num-cell">{(t.distance / 1000).toFixed(0)} km</td>
                <td className="num-cell">{Math.round(t.elapsed_time / 3600)} h</td>
                <td className="num-cell">{Math.round(t.elevation_gain)} m</td>
              </tr>
            ))}
          </tbody>
        </table>
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
  const {data: bestEfforts} = useBestEffortsData();
  const adv = useAdvancedMetricsData();

  const last = fitnessData?.[fitnessData.length - 1];
  const vdotEstimate = useMemo(() => bestEfforts?.bests ? calcPrimaryVdot(bestEfforts.bests) : null, [bestEfforts]);
  const today = new Date();
  const dateLine = today.toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'});

  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{background: 'var(--bg)'}}>
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{borderColor: 'var(--line)', borderTopColor: 'var(--accent)'}} />
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
      <main className="scroll" style={{minHeight: '100dvh', paddingTop: 52, paddingBottom: 96}}>
        <motion.div
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          transition={{duration: 0.4}}
          className="panel max-w-[1100px] mx-auto"
          style={{margin: 'var(--pad) auto', overflow: 'hidden'}}
        >
          {/* ── Masthead ──────────────────────────────────────────────────── */}
          <div className="masthead">
            <div className="line">
              <span>{dateLine}</span>
            </div>
            <div className="brand">Fitness &amp; Form</div>
            <div className="line">
              <span>{last ? `CTL ${fmtNum(last.ctl)}` : '— ctl'}</span>
              <span>{last ? `ATL ${fmtNum(last.atl)}` : '— atl'}</span>
              <span>{last ? `TSB ${signed(last.tsb)}` : '— tsb'}</span>
              {vdotEstimate && <span>VDOT {vdotEstimate.vdot.toFixed(1)}</span>}
            </div>
          </div>

          {/* ── Scoreboard ────────────────────────────────────────────────── */}
          <div className="p-5 md:p-6" style={{borderBottom: '1px solid var(--text)'}}>
            <Scoreboard fitnessData={fitnessData} loading={fitnessLoading} />
          </div>

          {/* ── Topographic fitness ridge ─────────────────────────────────── */}
          <div className="p-5 md:p-6" style={{borderBottom: '1px solid var(--text)'}}>
            <TopoFitnessChart fitnessData={fitnessData} loading={fitnessLoading} />
          </div>

          {/* ── Performance: aerobic efficiency ───────────────────────────── */}
          <div className="p-5 md:p-6" style={{borderBottom: '1px solid var(--text)'}}>
            <PerformanceCard adv={adv} loading={fitnessLoading} />
          </div>

          {/* ── Risk + weekly load ────────────────────────────────────────── */}
          <div
            className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-5 p-5 md:p-6"
            style={{borderBottom: '1px solid var(--text)'}}
          >
            <RiskPanel loading={fitnessLoading} />
            <WeeklyLoadCard fitnessData={fitnessData} loading={fitnessLoading} />
          </div>

          {/* ── Risk trends: ACWR + monotony/strain ───────────────────────── */}
          <div
            className="grid grid-cols-1 lg:grid-cols-2 gap-5 p-5 md:p-6"
            style={{borderBottom: '1px solid var(--text)'}}
          >
            <AcwrTrendCard adv={adv} loading={fitnessLoading} />
            <MonotonyStrainCard adv={adv} loading={fitnessLoading} />
          </div>

          {/* ── Zone distribution + decoupling ────────────────────────────── */}
          <div
            className="grid grid-cols-1 lg:grid-cols-2 gap-5 p-5 md:p-6"
            style={{borderBottom: '1px solid var(--text)'}}
          >
            <ZoneDistributionCard
              breakdownMap={breakdownMap}
              activities={activities}
              isLoading={zonesLoading}
              progress={progress}
            />
            <DecouplingCard breakdownsReady={!zonesLoading && !!breakdownMap} />
          </div>

          {/* ── Activity calendar heatmap ─────────────────────────────────── */}
          <ActivityHeatmapCard activities={activities} loading={!activities} />

          {/* ── Season record ledger ──────────────────────────────────────── */}
          <SeasonLedger />
        </motion.div>
      </main>
    </>
  );
}
