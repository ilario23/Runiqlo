'use client';

import {use, useMemo, useState, useCallback, useEffect} from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {motion, type Variants} from 'framer-motion';
import {
  AreaChart,
  Area,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {
  useActivities,
  useActivityDetail,
  useActivityStreams,
  useActivityZoneBreakdown,
  useActivityWeather,
  useActivityDecoupling,
} from '@/hooks/useStrava';
import {windDirectionLabel} from '@/lib/weather';
import {formatPace, formatDuration, ZONE_COLORS, ZONE_NAMES, getZoneForHr, SPORT_COLORS, COLORS} from '@/lib/activityModel';
import {Skeleton} from '@/components/ui/skeleton';
import {useSettings} from '@/contexts/SettingsContext';
import AppHeader from '@/components/AppHeader';
import {ConnectPrompt} from '@/components/ConnectPrompt';
import type {ZoneSegment} from '@/components/RouteMapLeaflet';
import PlanAdherencePanel from './PlanAdherencePanel';

// Leaflet map is client-only (no SSR)
const RouteMapLeaflet = dynamic(() => import('@/components/RouteMapLeaflet'), {ssr: false});

// ─── constants ────────────────────────────────────────────────────────────────

const cardVariant: Variants = {
  hidden: {opacity: 0},
  show: {opacity: 1, transition: {duration: 0.3, ease: 'easeOut'}},
};
const containerVariant: Variants = {
  show: {transition: {staggerChildren: 0.06}},
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtTime(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDateLong(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Chart types ──────────────────────────────────────────────────────────────

interface ChartPoint {
  idx: number;
  dist: number;
  elevation?: number;
  hr?: number;
  pace?: number;
  cadence?: number;
  lat?: number;
  lng?: number;
}

type TooltipPayload = Array<{payload?: ChartPoint; value?: unknown; dataKey?: string}>;

// ─── Tooltip content components (module-level so identity is stable) ──────────
// recharts v3 cloneElement's these — they must be proper React components
// so we can use useEffect to fire the hover callback without render-phase side effects.

function ElevTooltip({
  active,
  payload,
  onHover,
}: {
  active?: boolean;
  payload?: TooltipPayload;
  onHover: (idx: number | null) => void;
}) {
  const activeIdx = active && payload?.length ? (payload[0]?.payload?.idx ?? null) : null;
  useEffect(() => { onHover(activeIdx); }, [activeIdx, onHover]);
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;
  return (
    <div className="surface-card px-2.5 py-1.5 text-[11px]">
      <p className="text-[var(--color-ink-2)]">{pt.dist.toFixed(2)} km</p>
      <p className="text-[var(--color-ink)] font-medium">{Math.round(Number(payload[0]?.value))} m</p>
    </div>
  );
}

function PaceHRTooltip({
  active,
  payload,
  onHover,
  color,
}: {
  active?: boolean;
  payload?: TooltipPayload;
  onHover: (idx: number | null) => void;
  color: string;
}) {
  const activeIdx = active && payload?.length ? (payload[0]?.payload?.idx ?? null) : null;
  useEffect(() => { onHover(activeIdx); }, [activeIdx, onHover]);
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;
  const hrEntry = payload.find((p) => p.dataKey === 'hr');
  const paceEntry = payload.find((p) => p.dataKey === 'pace');
  const cadenceEntry = payload.find((p) => p.dataKey === 'cadence');
  const hr = hrEntry?.value != null ? Math.round(Number(hrEntry.value)) : null;
  const pace = paceEntry?.value != null ? Number(paceEntry.value) : null;
  const cadence = cadenceEntry?.value != null ? Math.round(Number(cadenceEntry.value)) : null;
  if (hr == null && (pace == null || pace <= 0) && cadence == null) return null;
  return (
    <div className="surface-card px-2.5 py-1.5 text-[11px] space-y-0.5">
      <p className="text-[var(--color-ink-2)]">{pt.dist.toFixed(2)} km</p>
      {pace != null && pace > 0 && (
        <p style={{color}} className="font-medium">{formatPace(pace)}/km</p>
      )}
      {hr != null && (
        <p style={{color: COLORS.red}} className="font-medium">{hr} bpm</p>
      )}
      {cadence != null && (
        <p style={{color: COLORS.purple}} className="font-medium">{cadence} spm</p>
      )}
    </div>
  );
}

// ─── Individual chart panels ──────────────────────────────────────────────────

interface ChartPanelProps {
  data: ChartPoint[];
  color: string;
  onHover: (idx: number | null) => void;
  syncId: string;
}

function ElevationPanel({data, color, onHover, syncId}: ChartPanelProps) {
  const hasElevation = data.some((p) => p.elevation != null);

  const {elevDomain, elevTicks} = useMemo(() => {
    const vals = data.flatMap((p) => (p.elevation != null ? [p.elevation] : []));
    if (vals.length === 0) return {elevDomain: ['auto', 'auto'] as ['auto', 'auto'], elevTicks: undefined};
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min;
    const step = range <= 100 ? 25 : range <= 300 ? 50 : range <= 700 ? 100 : range <= 1500 ? 200 : 500;
    const start = Math.ceil(min / step) * step;
    const ticks: number[] = [];
    for (let v = start; v <= max; v += step) ticks.push(v);
    return {elevDomain: [min, max] as [number, number], elevTicks: ticks.length ? ticks : [min, max]};
  }, [data]);

  if (!hasElevation) return null;
  return (
    <div>
      <p className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide mb-1.5">Elevation</p>
      <div className="h-[100px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            syncId={syncId}
            margin={{top: 2, right: 36, left: -28, bottom: 0}}
            onMouseLeave={() => onHover(null)}
          >
            <defs>
              <linearGradient id="gradElev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="dist" tick={{fill: 'rgba(26,24,20,0.25)', fontSize: 8}} tickFormatter={(v) => `${(v as number).toFixed(0)}km`} axisLine={false} tickLine={false} minTickGap={50} />
            <YAxis yAxisId="elev" domain={elevDomain} ticks={elevTicks} tick={{fill: 'rgba(26,24,20,0.25)', fontSize: 8}} axisLine={false} tickLine={false} tickFormatter={(v) => `${v as number}m`} width={40} />
            <YAxis yAxisId="elevR" orientation="right" domain={elevDomain} ticks={elevTicks} tick={{fill: 'rgba(26,24,20,0.25)', fontSize: 8}} axisLine={false} tickLine={false} tickFormatter={(v) => `${v as number}m`} width={32} />
            <RechartsTooltip
              content={<ElevTooltip onHover={onHover} />}
              cursor={{stroke: 'rgba(26,24,20,0.08)'}}
            />
            <Area yAxisId="elev" type="monotone" dataKey="elevation" stroke={color} strokeWidth={1.5} fill="url(#gradElev)" dot={false} activeDot={{r: 3, fill: color, strokeWidth: 0}} />
            {/* Invisible area bound to right axis so recharts renders its ticks */}
            <Area yAxisId="elevR" type="monotone" dataKey="elevation" stroke="none" fill="none" dot={false} activeDot={false} legendType="none" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PaceHRPanel({data, color, onHover, syncId}: ChartPanelProps) {
  const hasHR = data.some((p) => p.hr != null);
  const hasPace = data.some((p) => p.pace != null);
  const hasCadence = data.some((p) => p.cadence != null);

  const [showPace, setShowPace] = useState(true);
  const [showHR, setShowHR] = useState(true);
  const [showCadence, setShowCadence] = useState(false);

  const paceDomain = useMemo((): [number, number] | undefined => {
    if (!hasPace) return undefined;
    const vals = data.flatMap((p) => (p.pace != null && p.pace > 0 ? [p.pace] : []));
    if (vals.length < 4) return undefined;
    const sorted = [...vals].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    return [sorted[0], q3 + 1.5 * iqr];
  }, [data, hasPace]);

  const cadenceDomain = useMemo((): [number, number] | undefined => {
    if (!hasCadence) return undefined;
    const vals = data.flatMap((p) => (p.cadence != null ? [p.cadence] : []));
    if (vals.length < 4) return undefined;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.1;
    return [Math.max(0, min - pad), max + pad];
  }, [data, hasCadence]);

  const rightMargin = (hasHR && showHR ? 32 : 0) + (hasCadence && showCadence ? 32 : 0) + 4;

  if (!hasHR && !hasPace && !hasCadence) return null;
  return (
    <div>
      <div className="flex items-center gap-3 mb-1.5">
        {hasPace && (
          <button
            onClick={() => setShowPace((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide transition-opacity"
            style={{opacity: showPace ? 1 : 0.3, color: 'rgba(26,24,20,0.5)'}}
          >
            <span className="w-3 h-[2px] rounded-full inline-block" style={{background: color}} />
            Pace
          </button>
        )}
        {hasHR && (
          <button
            onClick={() => setShowHR((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide transition-opacity"
            style={{opacity: showHR ? 1 : 0.3, color: 'rgba(26,24,20,0.5)'}}
          >
            <span className="w-3 h-[2px] rounded-full inline-block" style={{background: COLORS.red}} />
            HR
          </button>
        )}
        {hasCadence && (
          <button
            onClick={() => setShowCadence((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide transition-opacity"
            style={{opacity: showCadence ? 1 : 0.3, color: 'rgba(26,24,20,0.5)'}}
          >
            <span className="w-3 h-[2px] rounded-full inline-block" style={{background: COLORS.purple}} />
            Cadence
          </button>
        )}
      </div>
      <div className="h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            syncId={syncId}
            margin={{top: 2, right: rightMargin, left: -28, bottom: 0}}
            onMouseLeave={() => onHover(null)}
          >
            <defs>
              <linearGradient id="gradHRCombo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.red} stopOpacity={0.2} />
                <stop offset="95%" stopColor={COLORS.red} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="dist" tick={{fill: 'rgba(26,24,20,0.25)', fontSize: 8}} tickFormatter={(v) => `${(v as number).toFixed(0)}km`} axisLine={false} tickLine={false} minTickGap={50} />
            <YAxis
              yAxisId="pace"
              reversed
              hide={!hasPace || !showPace}
              domain={paceDomain}
              allowDataOverflow
              tick={{fill: 'rgba(26,24,20,0.25)', fontSize: 8}}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (Number(v) > 0 ? formatPace(Number(v)) : '')}
              width={40}
            />
            <YAxis
              yAxisId="hr"
              orientation="right"
              hide={!hasHR || !showHR}
              domain={[100, 200]}
              allowDataOverflow
              tick={{fill: 'rgba(26,24,20,0.25)', fontSize: 8}}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v as number}`}
              width={32}
            />
            <YAxis
              yAxisId="cadence"
              orientation="right"
              hide={!hasCadence || !showCadence}
              domain={cadenceDomain}
              allowDataOverflow
              tick={{fill: 'rgba(26,24,20,0.25)', fontSize: 8}}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v as number}`}
              width={32}
            />
            <RechartsTooltip
              content={<PaceHRTooltip onHover={onHover} color={color} />}
              cursor={{stroke: 'rgba(26,24,20,0.08)'}}
            />
            {hasHR && showHR && (
              <Area
                yAxisId="hr"
                type="monotone"
                dataKey="hr"
                stroke={COLORS.red}
                strokeWidth={1.5}
                fill="url(#gradHRCombo)"
                dot={false}
                activeDot={{r: 3, fill: COLORS.red, strokeWidth: 0}}
              />
            )}
            {hasPace && showPace && (
              <Line
                yAxisId="pace"
                type="monotone"
                dataKey="pace"
                stroke={color}
                strokeWidth={1.5}
                dot={false}
                activeDot={{r: 3, fill: color, strokeWidth: 0}}
              />
            )}
            {hasCadence && showCadence && (
              <Line
                yAxisId="cadence"
                type="monotone"
                dataKey="cadence"
                stroke={COLORS.purple}
                strokeWidth={1.5}
                dot={false}
                activeDot={{r: 3, fill: COLORS.purple, strokeWidth: 0}}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Stream Charts ─────────────────────────────────────────────────────────────

interface StreamChartsProps {
  chartData: ChartPoint[];
  color: string;
  onHover: (idx: number | null) => void;
}

function StreamCharts({chartData, color, onHover}: StreamChartsProps) {
  const syncId = 'activity-charts';
  return (
    <div className="space-y-5">
      <ElevationPanel data={chartData} color={color} onHover={onHover} syncId={syncId} />
      <PaceHRPanel data={chartData} color={color} onHover={onHover} syncId={syncId} />
    </div>
  );
}

// ─── Zone breakdown ───────────────────────────────────────────────────────────

function ZoneCard({breakdown}: {breakdown: ReturnType<typeof useActivityZoneBreakdown>['data']}) {
  if (!breakdown) return (
    <div className="py-8 text-center">
      <p className="text-xs text-[var(--color-ink-3)]">No HR data for zone breakdown</p>
    </div>
  );

  const totalTime = Object.values(breakdown.zones).reduce((s, z) => s + z.time, 0);
  if (totalTime === 0) return null;

  return (
    <div className="space-y-3">
      {([1, 2, 3, 4, 5, 6] as const).map((z) => {
        const zone = breakdown.zones[z];
        const pct = zone ? Math.round((zone.time / totalTime) * 100) : 0;
        const zColor = ZONE_COLORS[z];
        return (
          <div key={z}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[var(--color-ink-2)] font-medium">Z{z} · {ZONE_NAMES[z]}</span>
              <span className="text-[11px] text-[var(--color-ink-3)]">{pct}% · {formatDuration(zone?.time ?? 0)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--color-paper-2)] overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{background: zColor}}
                initial={{width: 0}}
                animate={{width: `${pct}%`}}
                transition={{duration: 0.5, delay: z * 0.05, ease: 'easeOut'}}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ActivityDetailPage({params}: {params: Promise<{id: string}>}) {
  const {id} = use(params);
  const {isAuthenticated, isLoading: authLoading} = useStravaAuth();

  const {data: allActivities} = useActivities();
  const {data: detail, isLoading: detailLoading} = useActivityDetail(id);
  const {data: streams, isLoading: streamsLoading} = useActivityStreams(id);
  const {data: zoneBreakdown} = useActivityZoneBreakdown(id);
  const {data: weather, isLoading: weatherLoading} = useActivityWeather(id);
  const {data: decouplingResult} = useActivityDecoupling(id);
  const decouplingPct = decouplingResult?.value;

  // Hover index into chartData → drives the map dot
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const handleHover = useCallback((idx: number | null) => setHoverIdx(idx), []);

  const summary = useMemo(
    () => allActivities?.find((a) => a.id === id),
    [allActivities, id],
  );

  const sportColor = SPORT_COLORS[summary?.type ?? detail?.sport_type ?? 'Run'] ?? COLORS.green;
  const {settings} = useSettings();

  // Zone-coloured map segments — group consecutive GPS points by HR zone.
  // Falls back to the sport colour when HR data is absent.
  const mapSegments = useMemo((): ZoneSegment[] => {
    if (!streams || streams.length === 0) return [];

    // ~500 pts keeps Leaflet fast while preserving zone transitions
    const step = Math.max(1, Math.floor(streams.length / 500));
    const sampled = streams.filter((_, i) => i % step === 0);

    const segments: ZoneSegment[] = [];
    let curColor: string | null = null;
    let curPts: [number, number][] = [];

    for (const pt of sampled) {
      if (pt.lat == null || pt.lng == null) continue;
      const ptColor = pt.heartrate > 0
        ? ZONE_COLORS[getZoneForHr(pt.heartrate, settings.zones)]
        : sportColor;

      if (ptColor !== curColor) {
        if (curPts.length >= 1 && curColor) {
          segments.push({points: curPts, color: curColor});
          // Overlap: carry last point into new segment to avoid gaps
          curPts = [curPts[curPts.length - 1]];
        }
        curColor = ptColor;
      }
      curPts.push([pt.lat, pt.lng]);
    }
    if (curPts.length >= 1 && curColor) {
      segments.push({points: curPts, color: curColor});
    }
    return segments;
  }, [streams, settings.zones, sportColor]);

  // Subsampled chart data — ~300 points, each carries idx + lat/lng for map sync
  const chartData = useMemo((): ChartPoint[] => {
    if (!streams || streams.length === 0) return [];
    const step = Math.max(1, Math.floor(streams.length / 300));
    return streams
      .filter((_, i) => i % step === 0)
      .map((pt, i) => ({
        idx: i,
        dist: pt.distance / 1000,
        elevation: pt.altitude > 0 ? pt.altitude : undefined,
        hr: pt.heartrate > 0 ? pt.heartrate : undefined,
        pace: pt.velocity > 0.5 ? 1 / (pt.velocity * 60 / 1000) : undefined,
        cadence: pt.cadence ? pt.cadence * 2 : undefined,
        lat: pt.lat,
        lng: pt.lng,
      }));
  }, [streams]);

  // Hover position on map — derived from the active chart index
  const hoverPos = useMemo((): [number, number] | null => {
    if (hoverIdx == null) return null;
    const pt = chartData[hoverIdx];
    if (pt?.lat == null || pt?.lng == null) return null;
    return [pt.lat, pt.lng];
  }, [hoverIdx, chartData]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--color-rule)] border-t-[var(--color-rust)] animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <AppHeader />
        <div className="pt-14">
          <ConnectPrompt subtitle="Connect Strava to view this activity." />
        </div>
      </>
    );
  }

  const activityName = summary?.name ?? detail?.name ?? 'Activity';
  const activityDate = summary?.date ?? detail?.start_date_local?.slice(0, 10);

  return (
    <>
      <AppHeader />
      <main className="pt-[72px] pb-24 md:pb-8 px-5 min-h-screen">
        <div className="max-w-[1100px] mx-auto">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 py-3 text-xs text-[var(--color-ink-3)]">
            <Link href="/activities" className="hover:text-[var(--color-ink-2)] transition-colors">Activities</Link>
            <span>/</span>
            <span className="text-[var(--color-ink-2)] truncate max-w-[200px]">{activityName}</span>
          </div>

          {/* Title row — editorial long-read hero */}
          <div className="mb-6 pb-4" style={{borderBottom: '2px solid var(--color-ink)'}}>
            {detailLoading && !summary ? (
              <Skeleton className="h-16 w-3/4 mb-2" />
            ) : (
              <>
                <div className="kicker rust">
                  The Long Read{summary?.type ? ` · ${summary.type}` : ''}{activityDate ? ` · ${fmtDateLong(activityDate)}` : ''}
                </div>
                <h1 className="h-display mt-2" style={{fontSize: 'clamp(40px, 7vw, 72px)'}}>
                  {activityName}
                </h1>
              </>
            )}
          </div>

          <motion.div
            variants={containerVariant}
            initial="hidden"
            animate="show"
            className="grid grid-cols-12 gap-4"
          >
            {/* ── Left column ── */}
            <div className="col-span-12 lg:col-span-8 space-y-4">

              {/* Map */}
              <motion.div variants={cardVariant} className="surface-card p-4">
                <h2 className="text-xs font-medium text-[var(--color-ink-3)] uppercase tracking-wide mb-3">Route</h2>
                {streamsLoading || detailLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : mapSegments.length >= 1 ? (
                  <RouteMapLeaflet
                    segments={mapSegments}
                    hoverPos={hoverPos}
                    color={sportColor}
                  />
                ) : (
                  <div className="w-full h-[300px] flex items-center justify-center">
                    <p className="text-sm text-[var(--color-ink-3)]">No GPS data</p>
                  </div>
                )}
              </motion.div>

              {/* Charts */}
              <motion.div variants={cardVariant} className="surface-card p-5">
                <h2 className="text-xs font-medium text-[var(--color-ink-3)] uppercase tracking-wide mb-4">Analysis</h2>
                {streamsLoading ? (
                  <div className="space-y-5">
                    <Skeleton className="h-[100px] w-full" />
                    <Skeleton className="h-[100px] w-full" />
                    <Skeleton className="h-[100px] w-full" />
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="h-[200px] flex items-center justify-center">
                    <p className="text-sm text-[var(--color-ink-3)]">No stream data available</p>
                  </div>
                ) : (
                  <StreamCharts chartData={chartData} color={sportColor} onHover={handleHover} />
                )}
              </motion.div>

              {/* Laps */}
              {(detail?.laps?.length ?? 0) > 0 && (
                <motion.div variants={cardVariant} className="surface-card p-5">
                  <h2 className="text-xs font-medium text-[var(--color-ink-3)] uppercase tracking-wide mb-4">Laps</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide border-b border-[var(--color-rule)]">
                          <th className="pb-2 text-left font-medium">#</th>
                          <th className="pb-2 text-right font-medium">Dist</th>
                          <th className="pb-2 text-right font-medium">Time</th>
                          <th className="pb-2 text-right font-medium">Pace</th>
                          <th className="pb-2 text-right font-medium">HR</th>
                          <th className="pb-2 text-right font-medium">Elev</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail!.laps.map((lap) => {
                          const lapPace = lap.distance > 0 ? (lap.moving_time / 60) / (lap.distance / 1000) : 0;
                          return (
                            <tr key={lap.id} className="border-b border-[var(--color-rule)] last:border-0">
                              <td className="py-2.5 text-[var(--color-ink-2)] text-xs">{lap.lap_index}</td>
                              <td className="py-2.5 text-right text-[var(--color-ink)] tabular-nums text-xs">{(lap.distance / 1000).toFixed(2)} km</td>
                              <td className="py-2.5 text-right text-[var(--color-ink)] tabular-nums text-xs">{formatDuration(lap.moving_time)}</td>
                              <td className="py-2.5 text-right text-[var(--color-ink)] tabular-nums text-xs">{lapPace > 0 ? formatPace(lapPace) + '/km' : '—'}</td>
                              <td className="py-2.5 text-right text-[var(--color-ink-2)] tabular-nums text-xs">{lap.average_heartrate ? Math.round(lap.average_heartrate) + ' bpm' : '—'}</td>
                              <td className="py-2.5 text-right text-[var(--color-ink-2)] tabular-nums text-xs">{lap.total_elevation_gain ? Math.round(lap.total_elevation_gain) + 'm' : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}

              {/* Segment efforts */}
              {(detail?.segment_efforts?.length ?? 0) > 0 && (
                <motion.div variants={cardVariant} className="surface-card p-5">
                  <h2 className="text-xs font-medium text-[var(--color-ink-3)] uppercase tracking-wide mb-4">
                    Segments <span className="text-[var(--color-ink-3)] ml-1 normal-case">({detail!.segment_efforts.length})</span>
                  </h2>
                  <div className="space-y-0.5">
                    {detail!.segment_efforts.map((se) => {
                      const prColors: Record<number, string> = {1: COLORS.gold, 2: '#9CA3AF', 3: '#CD7C32'};
                      const prColor = se.pr_rank ? prColors[se.pr_rank] : undefined;
                      return (
                        <Link key={se.id} href={`/segments/${se.segment.id}`} className="flex items-center justify-between py-2.5 px-2 rounded-xl hover:bg-[var(--color-surface-1)] transition-colors group">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm text-[var(--color-ink)] truncate group-hover:text-[var(--color-ink)] transition-colors">{se.name}</p>
                              {se.pr_rank && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0" style={{color: prColor, background: `${prColor}20`}}>
                                  #{se.pr_rank}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[var(--color-ink-3)] mt-0.5">{(se.distance / 1000).toFixed(1)} km</p>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                            <div className="text-right">
                              <p className="text-sm font-medium tabular-nums text-[var(--color-ink)]">{fmtTime(se.elapsed_time)}</p>
                              {se.average_heartrate && (
                                <p className="text-[11px] text-[var(--color-ink-3)] tabular-nums">{Math.round(se.average_heartrate)} bpm</p>
                              )}
                            </div>
                            <svg className="w-3.5 h-3.5 text-[var(--color-ink-3)] group-hover:text-[var(--color-ink-2)] transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Best efforts */}
              {(detail?.best_efforts?.length ?? 0) > 0 && (
                <motion.div variants={cardVariant} className="surface-card p-5">
                  <h2 className="text-xs font-medium text-[var(--color-ink-3)] uppercase tracking-wide mb-4">Best Efforts</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide border-b border-[var(--color-rule)]">
                          <th className="pb-2 text-left font-medium">Distance</th>
                          <th className="pb-2 text-right font-medium">Time</th>
                          <th className="pb-2 text-right font-medium">Rank</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail!.best_efforts.map((be) => {
                          const prColors: Record<number, string> = {1: COLORS.gold, 2: '#9CA3AF', 3: '#CD7C32'};
                          const prColor = be.pr_rank ? prColors[be.pr_rank] : undefined;
                          return (
                            <tr key={be.id} className="border-b border-[var(--color-rule)] last:border-0">
                              <td className="py-2.5 text-[var(--color-ink)] text-xs">{be.name}</td>
                              <td className="py-2.5 text-right text-[var(--color-ink)] tabular-nums text-xs font-medium">{fmtTime(be.elapsed_time)}</td>
                              <td className="py-2.5 text-right text-xs">
                                {be.pr_rank ? (
                                  <span className="font-bold px-1.5 py-0.5 rounded-md" style={{color: prColor, background: `${prColor}20`}}>
                                    #{be.pr_rank}
                                  </span>
                                ) : <span className="text-[var(--color-ink-3)]">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </div>

            {/* ── Right column ── */}
            <div className="col-span-12 lg:col-span-4 space-y-4">

              {/* Key stats */}
              <motion.div variants={cardVariant} className="surface-card p-5">
                <h2 className="text-xs font-medium text-[var(--color-ink-3)] uppercase tracking-wide mb-4">Stats</h2>
                {detailLoading && !summary ? (
                  <div className="space-y-3">
                    {Array.from({length: 5}).map((_, i) => <Skeleton key={i} className="h-10" />)}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {label: 'Distance', value: `${(summary?.distance ?? (detail?.distance ?? 0) / 1000).toFixed(2)} km`},
                      {label: 'Time', value: formatDuration(summary?.duration ?? detail?.moving_time ?? 0)},
                      {label: 'Avg Pace', value: summary?.avgPace && summary.avgPace > 0 ? `${formatPace(summary.avgPace)}/km` : '—'},
                      {label: 'Elevation', value: `${Math.round(summary?.elevationGain ?? detail?.total_elevation_gain ?? 0)} m`},
                      {label: 'Avg HR', value: summary?.avgHr ? `${Math.round(summary.avgHr)} bpm` : detail?.average_heartrate ? `${Math.round(detail.average_heartrate)} bpm` : '—'},
                      {label: 'Max HR', value: summary?.maxHr ? `${Math.round(summary.maxHr)} bpm` : detail?.max_heartrate ? `${Math.round(detail.max_heartrate)} bpm` : '—'},
                      {label: 'Calories', value: detail?.calories ? `${detail.calories} kcal` : '—'},
                      {label: 'Device', value: detail?.device_name ?? '—'},
                    ].map(({label, value}) => (
                      <div key={label} className="surface-raised px-3 py-2.5">
                        <p className="text-[10px] text-[var(--color-ink-3)] font-medium uppercase tracking-wide">{label}</p>
                        <p className="text-sm font-semibold text-[var(--color-ink)] mt-0.5 tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* Aerobic Decoupling */}
              <motion.div variants={cardVariant} className="surface-card p-5">
                <h2 className="text-xs font-medium text-[var(--color-ink-3)] uppercase tracking-wide mb-3">Aerobic Decoupling</h2>
                {streamsLoading ? (
                  <div className="h-10 flex items-center">
                    <div className="w-5 h-5 rounded-full border-2 border-[var(--color-rule)] border-t-white/50 animate-spin" />
                  </div>
                ) : !decouplingResult || decouplingPct === null || decouplingPct === undefined ? (
                  <p className="text-sm text-[var(--color-ink-3)]">
                    {decouplingResult?.reason === 'too_short'
                      ? 'n/a, run shorter than 45 min'
                      : decouplingResult?.reason === 'asymmetric'
                      ? 'n/a, terrain too asymmetric (big climb one way, descent back)'
                      : 'n/a, no HR or pace data'}
                  </p>
                ) : (
                  <div className="flex items-center gap-3">
                    <span
                      className="text-2xl font-bold font-mono tabular-nums"
                      style={{
                        color: decouplingPct < 0
                          ? 'var(--color-text-2)'
                          : decouplingPct < 5
                          ? COLORS.green
                          : decouplingPct < 8
                          ? COLORS.yellow
                          : COLORS.red,
                      }}
                    >
                      {decouplingPct > 0 ? '+' : ''}{decouplingPct}%
                    </span>
                    <div>
                      <p className="text-xs text-[var(--color-ink-2)]">
                        {decouplingPct < 0
                          ? 'HR fell vs pace, improving or easy effort'
                          : decouplingPct < 5
                          ? 'Well coupled, strong aerobic base'
                          : decouplingPct < 8
                          ? 'Mild decoupling, acceptable'
                          : 'High decoupling, HR drifted vs pace'}
                      </p>
                      <p className="text-[10px] text-[var(--color-ink-3)] mt-0.5">Pa:Hr ratio, first vs second half</p>
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Plan Adherence */}
              <PlanAdherencePanel
                activityId={id}
                actualDistanceKm={summary?.distance ?? (detail?.distance ?? 0) / 1000}
                actualMovingTimeSecs={summary?.duration ?? detail?.moving_time ?? 0}
              />

              {/* Weather */}
              <motion.div variants={cardVariant} className="surface-card p-5">
                <h2 className="text-xs font-medium text-[var(--color-ink-3)] uppercase tracking-wide mb-4">Weather at Start</h2>
                {weatherLoading || detailLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : !detail?.start_latlng?.length ? (
                  <p className="text-sm text-[var(--color-ink-3)]">No GPS data</p>
                ) : !weather ? (
                  <p className="text-sm text-[var(--color-ink-3)]">Weather unavailable</p>
                ) : (
                  <div className="space-y-4">
                    {/* Condition + temperature */}
                    <div className="flex items-center gap-3">
                      <span className="text-3xl leading-none">{weather.conditionEmoji}</span>
                      <div>
                        <p className="text-sm text-[var(--color-ink)]">{weather.conditionLabel}</p>
                        <p className="text-xl font-semibold text-[var(--color-ink)] tabular-nums">
                          {weather.temperatureC}°C
                          <span className="text-sm font-normal text-[var(--color-ink-3)] ml-2">
                            feels {weather.apparentTemperatureC}°C
                          </span>
                        </p>
                      </div>
                    </div>
                    {/* Sub-stats grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="surface-raised px-3 py-2">
                        <p className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide font-medium">Wind</p>
                        <p className="text-sm font-semibold text-[var(--color-ink)] tabular-nums">
                          {weather.windSpeedKmh} km/h {windDirectionLabel(weather.windDirectionDeg)}
                        </p>
                      </div>
                      <div className="surface-raised px-3 py-2">
                        <p className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide font-medium">Humidity</p>
                        <p className="text-sm font-semibold text-[var(--color-ink)] tabular-nums">{weather.humidityPct}%</p>
                      </div>
                      <div className="surface-raised px-3 py-2 col-span-2">
                        <p className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide font-medium">Precipitation</p>
                        <p className="text-sm font-semibold text-[var(--color-ink)] tabular-nums">
                          {weather.precipitationMm > 0 ? `${weather.precipitationMm} mm` : 'None'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>

              {/* HR Zone breakdown */}
              <motion.div variants={cardVariant} className="surface-card p-5">
                <h2 className="text-xs font-medium text-[var(--color-ink-3)] uppercase tracking-wide mb-4">Zone Distribution</h2>
                {streamsLoading ? (
                  <div className="space-y-3">
                    {[1,2,3,4,5,6].map((z) => <Skeleton key={z} className="h-6" />)}
                  </div>
                ) : (
                  <ZoneCard breakdown={zoneBreakdown} />
                )}
              </motion.div>
            </div>
          </motion.div>
        </div>
      </main>
    </>
  );
}
