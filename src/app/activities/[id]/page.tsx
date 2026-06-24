'use client';

import {use, useMemo, useState, useCallback} from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {motion, type Variants} from 'framer-motion';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {
  useActivities,
  useActivityDetail,
  useActivityStreams,
  useActivityZoneBreakdown,
  useActivityWeather,
  useActivityDecoupling,
  useActivityPlace,
  useFitnessData,
} from '@/hooks/useStrava';
import {gapFromStreams} from '@/lib/gap';
import {findRunsOnRoute} from '@/lib/routeMatch';
import {windDirectionLabel} from '@/lib/weather';
import {formatPace, formatDuration, ZONE_COLORS, getZoneForHr, SPORT_COLORS, COLORS} from '@/lib/activityModel';
import {Skeleton} from '@/components/ui/skeleton';
import {useSettings} from '@/contexts/SettingsContext';
import AppHeader from '@/components/AppHeader';
import {Icon} from '@/components/rq2/ui';
import {ConnectPrompt} from '@/components/ConnectPrompt';
import type {ZoneSegment} from '@/components/RouteMapLeaflet';
import PlanAdherencePanel from './PlanAdherencePanel';
import {ZoneCard, TrainingLoadCard} from './components/ActivityCards';
import {SplitsCard, TopResultsCard, RunsOnRouteCard} from './components/ActivityInsights';
import type {ChartPoint} from './components/StreamCharts';

// Leaflet map is client-only (no SSR)
const RouteMapLeaflet = dynamic(() => import('@/components/RouteMapLeaflet'), {ssr: false});
// Stream charts pull in recharts — load lazily, client-only, with a
// placeholder matching the charts' combined height to avoid layout shift.
const StreamCharts = dynamic(() => import('./components/StreamCharts'), {
  ssr: false,
  loading: () => <div style={{minHeight: 280}} />,
});

// ─── constants ────────────────────────────────────────────────────────────────

const cardVariant: Variants = {
  hidden: {opacity: 0},
  show: {opacity: 1, transition: {duration: 0.3, ease: 'easeOut'}},
};
const containerVariant: Variants = {
  show: {transition: {staggerChildren: 0.06}},
};
const PR_COLORS: Record<number, string> = {1: COLORS.gold, 2: 'var(--color-medal-silver)', 3: 'var(--color-medal-bronze)'};
const prBg = (c: string) => `color-mix(in srgb, ${c} 12%, transparent)`;

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
  const {data: fitnessData} = useFitnessData();
  const {data: place} = useActivityPlace(id);

  // Hover index into chartData → drives the map dot
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const handleHover = useCallback((idx: number | null) => setHoverIdx(idx), []);

  const summary = useMemo(
    () => allActivities?.find((a) => a.id === id),
    [allActivities, id],
  );

  const sportColor = SPORT_COLORS[summary?.type ?? detail?.sport_type ?? 'Run'] ?? COLORS.green;
  const {settings} = useSettings();

  // Overall grade-adjusted pace from raw streams (Strava shows GAP, API doesn't).
  const overallGap = useMemo(
    () => (streams && streams.length > 1 ? gapFromStreams(streams) : null),
    [streams],
  );

  // Other runs covering the same route — pace progression.
  const routeMatches = useMemo(
    () => (summary && allActivities ? findRunsOnRoute(summary, allActivities) : null),
    [summary, allActivities],
  );

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
        <div className="w-8 h-8 rounded-full border-2 border-[var(--line)] border-t-[var(--accent)] animate-spin" />
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
      <main className="scroll" style={{minHeight: '100dvh', paddingTop: 52, paddingBottom: 96}}>
        <div className="rise max-w-[1100px] mx-auto" style={{padding: 'var(--pad)'}}>

          {/* Header row */}
          <div className="flex items-center gap-3 flex-wrap" style={{marginBottom: 'var(--gap)'}}>
            <Link href="/activities" className="btn btn-ghost">
              <Icon name="arrow" size={14} style={{transform: 'rotate(180deg)'}} /> Log
            </Link>
            <span style={{width: 1, height: 26, background: 'var(--line)'}} />
            {detailLoading && !summary ? (
              <Skeleton className="h-8 w-64" />
            ) : (
              <>
                <span style={{width: 34, height: 34, borderRadius: 8, border: '1px solid ' + sportColor, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${sportColor} 12%, transparent)`}}>
                  <span style={{width: 11, height: 11, borderRadius: '50%', background: sportColor}} />
                </span>
                <div>
                  <div style={{fontSize: 'var(--fs-lg)', fontWeight: 600}}>{activityName}</div>
                  <div className="lbl" style={{marginTop: 2}}>
                    {summary?.type ?? detail?.sport_type ?? 'Run'}{activityDate ? ` · ${fmtDateLong(activityDate)}` : ''}{place ? ` · ${place}` : ''}
                  </div>
                </div>
                <div style={{flex: 1}} />
                <Link href={`/coach?q=${encodeURIComponent('Discuss my ' + activityName)}`} className="btn"><Icon name="coach" size={13} /> Discuss</Link>
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
                <h2 className="text-xs font-medium text-[var(--faint)] uppercase tracking-wide mb-3">Route</h2>
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
                    <p className="text-sm text-[var(--faint)]">No GPS data</p>
                  </div>
                )}
              </motion.div>

              {/* Charts */}
              <motion.div variants={cardVariant} className="surface-card p-5">
                <h2 className="text-xs font-medium text-[var(--faint)] uppercase tracking-wide mb-4">Analysis</h2>
                {streamsLoading ? (
                  <div className="space-y-5">
                    <Skeleton className="h-[100px] w-full" />
                    <Skeleton className="h-[100px] w-full" />
                    <Skeleton className="h-[100px] w-full" />
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="h-[200px] flex items-center justify-center">
                    <p className="text-sm text-[var(--faint)]">No stream data available</p>
                  </div>
                ) : (
                  <StreamCharts chartData={chartData} color={sportColor} onHover={handleHover} />
                )}
              </motion.div>

              {/* Splits (per-km) + Grade Adjusted Pace */}
              {(detail?.splits_metric?.length ?? 0) > 0 && (
                <motion.div variants={cardVariant} className="surface-card p-5">
                  <div className="flex items-baseline justify-between mb-4">
                    <h2 className="text-xs font-medium text-[var(--faint)] uppercase tracking-wide">Splits</h2>
                    {overallGap != null && (
                      <span className="text-[11px] text-[var(--faint)] tabular-nums">
                        Avg GAP <span className="text-[var(--dim)] font-medium">{formatPace(overallGap)}/km</span>
                      </span>
                    )}
                  </div>
                  <SplitsCard splits={detail!.splits_metric} />
                </motion.div>
              )}

              {/* Laps */}
              {(detail?.laps?.length ?? 0) > 0 && (
                <motion.div variants={cardVariant} className="surface-card p-5">
                  <h2 className="text-xs font-medium text-[var(--faint)] uppercase tracking-wide mb-4">Laps</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] text-[var(--faint)] uppercase tracking-wide border-b border-[var(--line)]">
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
                            <tr key={lap.id} className="border-b border-[var(--line)] last:border-0">
                              <td className="py-2.5 text-[var(--dim)] text-xs">{lap.lap_index}</td>
                              <td className="py-2.5 text-right text-[var(--text)] tabular-nums text-xs">{(lap.distance / 1000).toFixed(2)} km</td>
                              <td className="py-2.5 text-right text-[var(--text)] tabular-nums text-xs">{formatDuration(lap.moving_time)}</td>
                              <td className="py-2.5 text-right text-[var(--text)] tabular-nums text-xs">{lapPace > 0 ? formatPace(lapPace) + '/km' : '—'}</td>
                              <td className="py-2.5 text-right text-[var(--dim)] tabular-nums text-xs">{lap.average_heartrate ? Math.round(lap.average_heartrate) + ' bpm' : '—'}</td>
                              <td className="py-2.5 text-right text-[var(--dim)] tabular-nums text-xs">{lap.total_elevation_gain ? Math.round(lap.total_elevation_gain) + 'm' : '—'}</td>
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
                  <h2 className="text-xs font-medium text-[var(--faint)] uppercase tracking-wide mb-4">
                    Segments <span className="text-[var(--faint)] ml-1 normal-case">({detail!.segment_efforts.length})</span>
                  </h2>
                  <div className="space-y-0.5">
                    {detail!.segment_efforts.map((se) => {
                      const prColor = se.pr_rank ? PR_COLORS[se.pr_rank] : undefined;
                      return (
                        <Link key={se.id} href={`/segments/${se.segment.id}`} className="flex items-center justify-between py-2.5 px-2 rounded-xl hover:bg-[var(--color-surface-1)] transition-colors group">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm text-[var(--text)] truncate group-hover:text-[var(--text)] transition-colors">{se.name}</p>
                              {se.pr_rank && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0" style={{color: prColor, background: prColor ? prBg(prColor) : undefined}}>
                                  #{se.pr_rank}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[var(--faint)] mt-0.5">{(se.distance / 1000).toFixed(1)} km</p>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                            <div className="text-right">
                              <p className="text-sm font-medium tabular-nums text-[var(--text)]">{fmtTime(se.elapsed_time)}</p>
                              {se.average_heartrate && (
                                <p className="text-[11px] text-[var(--faint)] tabular-nums">{Math.round(se.average_heartrate)} bpm</p>
                              )}
                            </div>
                            <svg className="w-3.5 h-3.5 text-[var(--faint)] group-hover:text-[var(--dim)] transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
                  <h2 className="text-xs font-medium text-[var(--faint)] uppercase tracking-wide mb-4">Best Efforts</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] text-[var(--faint)] uppercase tracking-wide border-b border-[var(--line)]">
                          <th className="pb-2 text-left font-medium">Distance</th>
                          <th className="pb-2 text-right font-medium">Time</th>
                          <th className="pb-2 text-right font-medium">Rank</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail!.best_efforts.map((be) => {
                          const prColor = be.pr_rank ? PR_COLORS[be.pr_rank] : undefined;
                          return (
                            <tr key={be.id} className="border-b border-[var(--line)] last:border-0">
                              <td className="py-2.5 text-[var(--text)] text-xs">{be.name}</td>
                              <td className="py-2.5 text-right text-[var(--text)] tabular-nums text-xs font-medium">{fmtTime(be.elapsed_time)}</td>
                              <td className="py-2.5 text-right text-xs">
                                {be.pr_rank ? (
                                  <span className="font-bold px-1.5 py-0.5 rounded-md" style={{color: prColor, background: prColor ? prBg(prColor) : undefined}}>
                                    #{be.pr_rank}
                                  </span>
                                ) : <span className="text-[var(--faint)]">—</span>}
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
                <h2 className="text-xs font-medium text-[var(--faint)] uppercase tracking-wide mb-4">Stats</h2>
                {detailLoading && !summary ? (
                  <div className="space-y-3">
                    {Array.from({length: 5}).map((_, i) => <Skeleton key={i} className="h-10" />)}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {label: 'Distance', value: `${(summary?.distance ?? (detail?.distance ?? 0) / 1000).toFixed(2)} km`},
                      {label: 'Moving', value: formatDuration(summary?.duration ?? detail?.moving_time ?? 0)},
                      {label: 'Elapsed', value: detail?.elapsed_time ? formatDuration(detail.elapsed_time) : '—'},
                      {label: 'Avg Pace', value: summary?.avgPace && summary.avgPace > 0 ? `${formatPace(summary.avgPace)}/km` : '—'},
                      {label: 'Elevation', value: `${Math.round(summary?.elevationGain ?? detail?.total_elevation_gain ?? 0)} m`},
                      {label: 'Avg HR', value: summary?.avgHr ? `${Math.round(summary.avgHr)} bpm` : detail?.average_heartrate ? `${Math.round(detail.average_heartrate)} bpm` : '—'},
                      {label: 'Max HR', value: summary?.maxHr ? `${Math.round(summary.maxHr)} bpm` : detail?.max_heartrate ? `${Math.round(detail.max_heartrate)} bpm` : '—'},
                      {label: 'Calories', value: detail?.calories ? `${detail.calories} kcal` : '—'},
                      {label: 'Device', value: detail?.device_name ?? '—'},
                      {label: 'Shoes', value: detail?.gear?.name
                        ? `${detail.gear.name}${detail.gear.distance ? ` · ${(detail.gear.distance / 1000).toFixed(0)} km` : ''}`
                        : '—'},
                    ].map(({label, value}) => (
                      <div key={label} className="surface-raised px-3 py-2.5">
                        <p className="text-[10px] text-[var(--faint)] font-medium uppercase tracking-wide">{label}</p>
                        <p className="text-sm font-semibold text-[var(--text)] mt-0.5 tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* Top Results — medal-worthy achievements */}
              {((detail?.best_efforts?.some((b) => b.pr_rank && b.pr_rank <= 3)) ||
                (detail?.segment_efforts?.some((s) => (s.pr_rank && s.pr_rank <= 3) || s.achievements?.some((a) => a.rank <= 3)))) && (
                <motion.div variants={cardVariant} className="surface-card p-5">
                  <h2 className="text-xs font-medium text-[var(--faint)] uppercase tracking-wide mb-3">Top Results</h2>
                  <TopResultsCard
                    segmentEfforts={detail?.segment_efforts ?? []}
                    bestEfforts={detail?.best_efforts ?? []}
                    activityId={id}
                  />
                </motion.div>
              )}

              {/* Runs on this route */}
              {routeMatches && routeMatches.length >= 2 && (
                <motion.div variants={cardVariant} className="surface-card p-5">
                  <h2 className="text-xs font-medium text-[var(--faint)] uppercase tracking-wide mb-3">
                    Runs on this Route <span className="text-[var(--faint)] ml-1 normal-case">({routeMatches.length})</span>
                  </h2>
                  <RunsOnRouteCard matches={routeMatches} />
                </motion.div>
              )}

              {/* Training Load */}
              <motion.div variants={cardVariant} className="surface-card p-5">
                <h2 className="text-xs font-medium text-[var(--faint)] uppercase tracking-wide mb-3">Training Load</h2>
                <TrainingLoadCard
                  breakdown={zoneBreakdown}
                  summary={summary}
                  zones={settings.zones}
                  restingHr={settings.restingHr}
                  maxHr={settings.maxHr}
                  fitnessData={fitnessData}
                  activityDate={activityDate}
                />
              </motion.div>

              {/* Aerobic Decoupling */}
              <motion.div variants={cardVariant} className="surface-card p-5">
                <h2 className="text-xs font-medium text-[var(--faint)] uppercase tracking-wide mb-3">Aerobic Decoupling</h2>
                {streamsLoading ? (
                  <div className="h-10 flex items-center">
                    <div className="w-5 h-5 rounded-full border-2 border-[var(--line)] border-t-white/50 animate-spin" />
                  </div>
                ) : !decouplingResult || decouplingPct === null || decouplingPct === undefined ? (
                  <p className="text-sm text-[var(--faint)]">
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
                      <p className="text-xs text-[var(--dim)]">
                        {decouplingPct < 0
                          ? 'HR fell vs pace, improving or easy effort'
                          : decouplingPct < 5
                          ? 'Well coupled, strong aerobic base'
                          : decouplingPct < 8
                          ? 'Mild decoupling, acceptable'
                          : 'High decoupling, HR drifted vs pace'}
                      </p>
                      <p className="text-[10px] text-[var(--faint)] mt-0.5">Pa:Hr ratio, first vs second half</p>
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
                <h2 className="text-xs font-medium text-[var(--faint)] uppercase tracking-wide mb-4">Weather at Start</h2>
                {weatherLoading || detailLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : !detail?.start_latlng?.length ? (
                  <p className="text-sm text-[var(--faint)]">No GPS data</p>
                ) : !weather ? (
                  <p className="text-sm text-[var(--faint)]">Weather unavailable</p>
                ) : (
                  <div className="space-y-4">
                    {/* Condition + temperature */}
                    <div className="flex items-center gap-3">
                      <span className="text-3xl leading-none">{weather.conditionEmoji}</span>
                      <div>
                        <p className="text-sm text-[var(--text)]">{weather.conditionLabel}</p>
                        <p className="text-xl font-semibold text-[var(--text)] tabular-nums">
                          {weather.temperatureC}°C
                          <span className="text-sm font-normal text-[var(--faint)] ml-2">
                            feels {weather.apparentTemperatureC}°C
                          </span>
                        </p>
                      </div>
                    </div>
                    {/* Sub-stats grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="surface-raised px-3 py-2">
                        <p className="text-[10px] text-[var(--faint)] uppercase tracking-wide font-medium">Wind</p>
                        <p className="text-sm font-semibold text-[var(--text)] tabular-nums">
                          {weather.windSpeedKmh} km/h {windDirectionLabel(weather.windDirectionDeg)}
                        </p>
                      </div>
                      <div className="surface-raised px-3 py-2">
                        <p className="text-[10px] text-[var(--faint)] uppercase tracking-wide font-medium">Humidity</p>
                        <p className="text-sm font-semibold text-[var(--text)] tabular-nums">{weather.humidityPct}%</p>
                      </div>
                      <div className="surface-raised px-3 py-2 col-span-2">
                        <p className="text-[10px] text-[var(--faint)] uppercase tracking-wide font-medium">Precipitation</p>
                        <p className="text-sm font-semibold text-[var(--text)] tabular-nums">
                          {weather.precipitationMm > 0 ? `${weather.precipitationMm} mm` : 'None'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>

              {/* HR Zone breakdown */}
              <motion.div variants={cardVariant} className="surface-card p-5">
                <h2 className="text-xs font-medium text-[var(--faint)] uppercase tracking-wide mb-4">Zone Distribution</h2>
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
