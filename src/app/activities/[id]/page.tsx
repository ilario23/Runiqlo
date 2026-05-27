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
} from '@/hooks/useStrava';
import {windDirectionLabel} from '@/lib/weather';
import {formatPace, formatDuration, ZONE_COLORS, ZONE_NAMES, getZoneForHr, SPORT_COLORS, COLORS} from '@/lib/activityModel';
import {Skeleton} from '@/components/ui/skeleton';
import {useSettings} from '@/contexts/SettingsContext';
import AppHeader from '@/components/AppHeader';
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
      <p className="text-white/50">{pt.dist.toFixed(2)} km</p>
      <p className="text-white font-medium">{Math.round(Number(payload[0]?.value))} m</p>
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
  const hr = hrEntry?.value != null ? Math.round(Number(hrEntry.value)) : null;
  const pace = paceEntry?.value != null ? Number(paceEntry.value) : null;
  if (hr == null && (pace == null || pace <= 0)) return null;
  return (
    <div className="surface-card px-2.5 py-1.5 text-[11px] space-y-0.5">
      <p className="text-white/50">{pt.dist.toFixed(2)} km</p>
      {pace != null && pace > 0 && (
        <p style={{color}} className="font-medium">{formatPace(pace)}/km</p>
      )}
      {hr != null && (
        <p style={{color: COLORS.red}} className="font-medium">{hr} bpm</p>
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
  if (!data.some((p) => p.elevation != null)) return null;
  return (
    <div>
      <p className="text-[10px] text-white/30 uppercase tracking-wide mb-1.5">Elevation</p>
      <div className="h-[100px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            syncId={syncId}
            margin={{top: 2, right: 4, left: -28, bottom: 0}}
            onMouseLeave={() => onHover(null)}
          >
            <defs>
              <linearGradient id="gradElev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="dist" tick={{fill: 'rgba(255,255,255,0.25)', fontSize: 8}} tickFormatter={(v) => `${(v as number).toFixed(0)}km`} axisLine={false} tickLine={false} minTickGap={50} />
            <YAxis tick={{fill: 'rgba(255,255,255,0.25)', fontSize: 8}} axisLine={false} tickLine={false} tickFormatter={(v) => `${v as number}m`} width={36} />
            <RechartsTooltip
              content={<ElevTooltip onHover={onHover} />}
              cursor={{stroke: 'rgba(255,255,255,0.08)'}}
            />
            <Area type="monotone" dataKey="elevation" stroke={color} strokeWidth={1.5} fill="url(#gradElev)" dot={false} activeDot={{r: 3, fill: color, strokeWidth: 0}} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PaceHRPanel({data, color, onHover, syncId}: ChartPanelProps) {
  const hasHR = data.some((p) => p.hr != null);
  const hasPace = data.some((p) => p.pace != null);
  if (!hasHR && !hasPace) return null;
  return (
    <div>
      <div className="flex items-center gap-3 mb-1.5">
        {hasPace && (
          <span className="flex items-center gap-1.5 text-[10px] text-white/30 uppercase tracking-wide">
            <span className="w-3 h-[2px] rounded-full inline-block" style={{background: color}} />
            Pace
          </span>
        )}
        {hasHR && (
          <span className="flex items-center gap-1.5 text-[10px] text-white/30 uppercase tracking-wide">
            <span className="w-3 h-[2px] rounded-full inline-block" style={{background: COLORS.red}} />
            HR
          </span>
        )}
      </div>
      <div className="h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            syncId={syncId}
            margin={{top: 2, right: 36, left: -28, bottom: 0}}
            onMouseLeave={() => onHover(null)}
          >
            <defs>
              <linearGradient id="gradHRCombo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.red} stopOpacity={0.2} />
                <stop offset="95%" stopColor={COLORS.red} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="dist" tick={{fill: 'rgba(255,255,255,0.25)', fontSize: 8}} tickFormatter={(v) => `${(v as number).toFixed(0)}km`} axisLine={false} tickLine={false} minTickGap={50} />
            <YAxis
              yAxisId="pace"
              reversed
              hide={!hasPace}
              tick={{fill: 'rgba(255,255,255,0.25)', fontSize: 8}}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (Number(v) > 0 ? formatPace(Number(v)) : '')}
              width={40}
            />
            <YAxis
              yAxisId="hr"
              orientation="right"
              hide={!hasHR}
              tick={{fill: 'rgba(255,255,255,0.25)', fontSize: 8}}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v as number}`}
              width={32}
            />
            <RechartsTooltip
              content={<PaceHRTooltip onHover={onHover} color={color} />}
              cursor={{stroke: 'rgba(255,255,255,0.08)'}}
            />
            {hasHR && (
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
            {hasPace && (
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
      <p className="text-xs text-white/25">No HR data for zone breakdown</p>
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
              <span className="text-[11px] text-white/50 font-medium">Z{z} · {ZONE_NAMES[z]}</span>
              <span className="text-[11px] text-white/40">{pct}% · {formatDuration(zone?.time ?? 0)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
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
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-accent-blue animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <AppHeader />
        <div className="pt-[72px] flex items-center justify-center min-h-screen">
          <Link href="/settings" className="text-accent-blue text-sm">Connect Strava →</Link>
        </div>
      </>
    );
  }

  const activityName = summary?.name ?? detail?.name ?? 'Activity';
  const activityDate = summary?.date ?? detail?.start_date_local?.slice(0, 10);

  return (
    <>
      <AppHeader />
      <main className="pt-[72px] pb-8 px-5 min-h-screen">
        <div className="max-w-[1100px] mx-auto">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 py-3 text-xs text-white/35">
            <Link href="/activities" className="hover:text-white/60 transition-colors">Activities</Link>
            <span>/</span>
            <span className="text-white/55 truncate max-w-[200px]">{activityName}</span>
          </div>

          {/* Title row */}
          <div className="mb-5">
            {detailLoading && !summary ? (
              <Skeleton className="h-7 w-64 mb-2" />
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background: sportColor}} />
                  <h1 className="text-xl font-semibold tracking-tight text-white">{activityName}</h1>
                </div>
                {activityDate && (
                  <p className="text-sm text-white/35 mt-1 ml-6">{fmtDateLong(activityDate)}</p>
                )}
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
                <h2 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-3">Route</h2>
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
                    <p className="text-sm text-white/25">No GPS data</p>
                  </div>
                )}
              </motion.div>

              {/* Charts */}
              <motion.div variants={cardVariant} className="surface-card p-5">
                <h2 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-4">Analysis</h2>
                {streamsLoading ? (
                  <div className="space-y-5">
                    <Skeleton className="h-[100px] w-full" />
                    <Skeleton className="h-[100px] w-full" />
                    <Skeleton className="h-[100px] w-full" />
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="h-[200px] flex items-center justify-center">
                    <p className="text-sm text-white/25">No stream data available</p>
                  </div>
                ) : (
                  <StreamCharts chartData={chartData} color={sportColor} onHover={handleHover} />
                )}
              </motion.div>

              {/* Laps */}
              {(detail?.laps?.length ?? 0) > 0 && (
                <motion.div variants={cardVariant} className="surface-card p-5">
                  <h2 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-4">Laps</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] text-white/30 uppercase tracking-wide border-b border-white/[0.05]">
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
                            <tr key={lap.id} className="border-b border-white/[0.04] last:border-0">
                              <td className="py-2.5 text-white/50 text-xs">{lap.lap_index}</td>
                              <td className="py-2.5 text-right text-white/70 tabular-nums text-xs">{(lap.distance / 1000).toFixed(2)} km</td>
                              <td className="py-2.5 text-right text-white/70 tabular-nums text-xs">{formatDuration(lap.moving_time)}</td>
                              <td className="py-2.5 text-right text-white/70 tabular-nums text-xs">{lapPace > 0 ? formatPace(lapPace) + '/km' : '—'}</td>
                              <td className="py-2.5 text-right text-white/50 tabular-nums text-xs">{lap.average_heartrate ? Math.round(lap.average_heartrate) + ' bpm' : '—'}</td>
                              <td className="py-2.5 text-right text-white/50 tabular-nums text-xs">{lap.total_elevation_gain ? Math.round(lap.total_elevation_gain) + 'm' : '—'}</td>
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
                  <h2 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-4">
                    Segments <span className="text-white/25 ml-1 normal-case">({detail!.segment_efforts.length})</span>
                  </h2>
                  <div className="space-y-0.5">
                    {detail!.segment_efforts.map((se) => {
                      const prColors: Record<number, string> = {1: COLORS.gold, 2: '#9CA3AF', 3: '#CD7C32'};
                      const prColor = se.pr_rank ? prColors[se.pr_rank] : undefined;
                      return (
                        <Link key={se.id} href={`/segments/${se.segment.id}`} className="flex items-center justify-between py-2.5 px-2 rounded-xl hover:bg-white/[0.05] transition-colors group">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm text-white/75 truncate group-hover:text-white/90 transition-colors">{se.name}</p>
                              {se.pr_rank && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0" style={{color: prColor, background: `${prColor}20`}}>
                                  #{se.pr_rank}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-white/30 mt-0.5">{(se.distance / 1000).toFixed(1)} km</p>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                            <div className="text-right">
                              <p className="text-sm font-medium tabular-nums text-white/70">{fmtTime(se.elapsed_time)}</p>
                              {se.average_heartrate && (
                                <p className="text-[11px] text-white/30 tabular-nums">{Math.round(se.average_heartrate)} bpm</p>
                              )}
                            </div>
                            <svg className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
                  <h2 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-4">Best Efforts</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] text-white/30 uppercase tracking-wide border-b border-white/[0.05]">
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
                            <tr key={be.id} className="border-b border-white/[0.04] last:border-0">
                              <td className="py-2.5 text-white/70 text-xs">{be.name}</td>
                              <td className="py-2.5 text-right text-white/70 tabular-nums text-xs font-medium">{fmtTime(be.elapsed_time)}</td>
                              <td className="py-2.5 text-right text-xs">
                                {be.pr_rank ? (
                                  <span className="font-bold px-1.5 py-0.5 rounded-md" style={{color: prColor, background: `${prColor}20`}}>
                                    #{be.pr_rank}
                                  </span>
                                ) : <span className="text-white/25">—</span>}
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
                <h2 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-4">Stats</h2>
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
                        <p className="text-[10px] text-white/35 font-medium uppercase tracking-wide">{label}</p>
                        <p className="text-sm font-semibold text-white/85 mt-0.5 tabular-nums">{value}</p>
                      </div>
                    ))}
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
                <h2 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-4">Weather at Start</h2>
                {weatherLoading || detailLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : !detail?.start_latlng?.length ? (
                  <p className="text-sm text-white/25">No GPS data</p>
                ) : !weather ? (
                  <p className="text-sm text-white/25">Weather unavailable</p>
                ) : (
                  <div className="space-y-4">
                    {/* Condition + temperature */}
                    <div className="flex items-center gap-3">
                      <span className="text-3xl leading-none">{weather.conditionEmoji}</span>
                      <div>
                        <p className="text-sm text-white/80">{weather.conditionLabel}</p>
                        <p className="text-xl font-semibold text-white tabular-nums">
                          {weather.temperatureC}°C
                          <span className="text-sm font-normal text-white/40 ml-2">
                            feels {weather.apparentTemperatureC}°C
                          </span>
                        </p>
                      </div>
                    </div>
                    {/* Sub-stats grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="surface-raised px-3 py-2">
                        <p className="text-[10px] text-white/35 uppercase tracking-wide font-medium">Wind</p>
                        <p className="text-sm font-semibold text-white/80 tabular-nums">
                          {weather.windSpeedKmh} km/h {windDirectionLabel(weather.windDirectionDeg)}
                        </p>
                      </div>
                      <div className="surface-raised px-3 py-2">
                        <p className="text-[10px] text-white/35 uppercase tracking-wide font-medium">Humidity</p>
                        <p className="text-sm font-semibold text-white/80 tabular-nums">{weather.humidityPct}%</p>
                      </div>
                      <div className="surface-raised px-3 py-2 col-span-2">
                        <p className="text-[10px] text-white/35 uppercase tracking-wide font-medium">Precipitation</p>
                        <p className="text-sm font-semibold text-white/80 tabular-nums">
                          {weather.precipitationMm > 0 ? `${weather.precipitationMm} mm` : 'None'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>

              {/* HR Zone breakdown */}
              <motion.div variants={cardVariant} className="surface-card p-5">
                <h2 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-4">Zone Distribution</h2>
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
