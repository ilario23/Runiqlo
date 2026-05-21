'use client';

import {use, useMemo, useState} from 'react';
import Link from 'next/link';
import {motion, type Variants} from 'framer-motion';
import {
  AreaChart,
  Area,
  LineChart,
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
} from '@/hooks/useStrava';
import {formatPace, formatDuration, ZONE_COLORS, ZONE_NAMES} from '@/lib/activityModel';
import {decodePolyline, polylineToSvgPath} from '@/lib/polyline';
import AppHeader from '@/components/AppHeader';

// ─── constants ────────────────────────────────────────────────────────────────

const SPORT_COLORS: Record<string, string> = {
  Run: '#30d158',
  Ride: '#0a84ff',
  Hike: '#ff9f0a',
  Swim: '#bf5af2',
  Walk: '#ffd60a',
};

const cardVariant: Variants = {
  hidden: {opacity: 0, y: 16},
  show: {opacity: 1, y: 0, transition: {duration: 0.3, ease: 'easeOut'}},
};
const containerVariant: Variants = {
  show: {transition: {staggerChildren: 0.06}},
};

type ChartTab = 'elevation' | 'hr' | 'pace';

// ─── helpers ──────────────────────────────────────────────────────────────────

function Skeleton({className = ''}: {className?: string}) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.06] ${className}`} />;
}

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

// ─── Route Map ────────────────────────────────────────────────────────────────

function RouteMap({polyline, color}: {polyline: string | undefined; color: string}) {
  const W = 600;
  const H = 280;

  const path = useMemo(() => {
    if (!polyline) return '';
    const pts = decodePolyline(polyline);
    return polylineToSvgPath(pts, W, H, 16);
  }, [polyline]);

  if (!polyline || !path) {
    return (
      <div className="w-full h-[280px] flex items-center justify-center">
        <p className="text-sm text-white/25">No route data</p>
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-[280px]"
    >
      <defs>
        <filter id="route-glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      {/* Shadow path */}
      <path d={path} fill="none" stroke={color} strokeWidth="5" strokeOpacity={0.15} strokeLinecap="round" strokeLinejoin="round" />
      {/* Main path */}
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeOpacity={0.9} strokeLinecap="round" strokeLinejoin="round" filter="url(#route-glow)" />
    </svg>
  );
}

// ─── Charts ───────────────────────────────────────────────────────────────────

interface ChartPoint {
  dist: number;
  elevation?: number;
  hr?: number;
  pace?: number;
}

function StreamCharts({chartData, color}: {chartData: ChartPoint[]; color: string}) {
  const [tab, setTab] = useState<ChartTab>('elevation');

  const tabs: {value: ChartTab; label: string}[] = [
    {value: 'elevation', label: 'Elevation'},
    {value: 'hr', label: 'Heart Rate'},
    {value: 'pace', label: 'Pace'},
  ];

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex items-center gap-1 mb-4">
        {tabs.map(({value, label}) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              tab === value
                ? 'bg-white/[0.10] text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          {tab === 'elevation' ? (
            <AreaChart data={chartData} margin={{top: 4, right: 4, left: -24, bottom: 0}}>
              <defs>
                <linearGradient id="gradElev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="dist" tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 9}} tickFormatter={(v) => `${v.toFixed(0)}km`} axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 9}} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}m`} />
              <RechartsTooltip
                content={({active, payload}) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bento-card px-3 py-2 text-xs">
                      <p className="text-white/60">{Number(payload[0]?.payload?.dist).toFixed(2)} km</p>
                      <p className="text-white font-medium">{Math.round(Number(payload[0]?.value))} m</p>
                    </div>
                  );
                }}
                cursor={{stroke: 'rgba(255,255,255,0.1)'}}
              />
              <Area type="monotone" dataKey="elevation" stroke={color} strokeWidth={1.5} fill="url(#gradElev)" dot={false} activeDot={{r: 3, fill: color}} />
            </AreaChart>
          ) : tab === 'hr' ? (
            <AreaChart data={chartData} margin={{top: 4, right: 4, left: -24, bottom: 0}}>
              <defs>
                <linearGradient id="gradHR" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff453a" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ff453a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="dist" tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 9}} tickFormatter={(v) => `${v.toFixed(0)}km`} axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 9}} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}`} />
              <RechartsTooltip
                content={({active, payload}) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bento-card px-3 py-2 text-xs">
                      <p className="text-white/60">{Number(payload[0]?.payload?.dist).toFixed(2)} km</p>
                      <p className="text-white font-medium">{Math.round(Number(payload[0]?.value))} bpm</p>
                    </div>
                  );
                }}
                cursor={{stroke: 'rgba(255,255,255,0.1)'}}
              />
              <Area type="monotone" dataKey="hr" stroke="#ff453a" strokeWidth={1.5} fill="url(#gradHR)" dot={false} activeDot={{r: 3, fill: '#ff453a'}} />
            </AreaChart>
          ) : (
            <LineChart data={chartData} margin={{top: 4, right: 4, left: -24, bottom: 0}}>
              <XAxis dataKey="dist" tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 9}} tickFormatter={(v) => `${v.toFixed(0)}km`} axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 9}} axisLine={false} tickLine={false} tickFormatter={(v) => (v > 0 ? formatPace(v) : '')} reversed />
              <RechartsTooltip
                content={({active, payload}) => {
                  if (!active || !payload?.length) return null;
                  const pace = Number(payload[0]?.value);
                  if (!pace || pace <= 0) return null;
                  return (
                    <div className="bento-card px-3 py-2 text-xs">
                      <p className="text-white/60">{Number(payload[0]?.payload?.dist).toFixed(2)} km</p>
                      <p className="text-white font-medium">{formatPace(pace)}/km</p>
                    </div>
                  );
                }}
                cursor={{stroke: 'rgba(255,255,255,0.1)'}}
              />
              <Line type="monotone" dataKey="pace" stroke={color} strokeWidth={1.5} dot={false} activeDot={{r: 3, fill: color}} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
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
        const color = ZONE_COLORS[z];
        return (
          <div key={z}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-white/50 font-medium">Z{z} · {ZONE_NAMES[z]}</span>
              <span className="text-[11px] text-white/40">{pct}% · {formatDuration(zone?.time ?? 0)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{background: color}}
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

  const summary = useMemo(
    () => allActivities?.find((a) => a.id === id),
    [allActivities, id],
  );

  const sportColor = SPORT_COLORS[summary?.type ?? detail?.sport_type ?? 'Run'] ?? '#30d158';

  // Subsample stream data for charts (every ~10 points to keep chart snappy)
  const chartData = useMemo((): ChartPoint[] => {
    if (!streams || streams.length === 0) return [];
    const step = Math.max(1, Math.floor(streams.length / 300));
    return streams
      .filter((_, i) => i % step === 0)
      .map((pt) => ({
        dist: pt.distance / 1000,
        elevation: pt.altitude > 0 ? pt.altitude : undefined,
        hr: pt.heartrate > 0 ? pt.heartrate : undefined,
        pace: pt.velocity > 0.5 ? pt.velocity > 0 ? 1 / (pt.velocity * 60 / 1000) : undefined : undefined,
      }));
  }, [streams]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-[#0a84ff] animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <AppHeader />
        <div className="pt-[72px] flex items-center justify-center min-h-screen">
          <Link href="/settings" className="text-[#0a84ff] text-sm">Connect Strava →</Link>
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
              <motion.div variants={cardVariant} className="bento-card p-4">
                <h2 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-3">Route</h2>
                {detailLoading && !summary?.polyline ? (
                  <Skeleton className="h-[280px] w-full" />
                ) : (
                  <RouteMap polyline={summary?.polyline ?? detail?.map?.summary_polyline ?? undefined} color={sportColor} />
                )}
              </motion.div>

              {/* Charts */}
              <motion.div variants={cardVariant} className="bento-card p-5">
                <h2 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-4">Analysis</h2>
                {streamsLoading ? (
                  <Skeleton className="h-[200px] w-full" />
                ) : chartData.length === 0 ? (
                  <div className="h-[200px] flex items-center justify-center">
                    <p className="text-sm text-white/25">No stream data available</p>
                  </div>
                ) : (
                  <StreamCharts chartData={chartData} color={sportColor} />
                )}
              </motion.div>

              {/* Laps */}
              {(detail?.laps?.length ?? 0) > 0 && (
                <motion.div variants={cardVariant} className="bento-card p-5">
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
                <motion.div variants={cardVariant} className="bento-card p-5">
                  <h2 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-4">
                    Segments <span className="text-white/25 ml-1 normal-case">({detail!.segment_efforts.length})</span>
                  </h2>
                  <div className="space-y-0.5">
                    {detail!.segment_efforts.map((se) => {
                      const prColors: Record<number, string> = {1: '#F59E0B', 2: '#9CA3AF', 3: '#CD7C32'};
                      const prColor = se.pr_rank ? prColors[se.pr_rank] : undefined;
                      return (
                        <div
                          key={se.id}
                          className="flex items-center justify-between py-2.5 px-2 rounded-xl hover:bg-white/[0.03] transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm text-white/75 truncate">{se.name}</p>
                              {se.pr_rank && (
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                                  style={{color: prColor, background: `${prColor}20`}}
                                >
                                  #{se.pr_rank}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-white/30 mt-0.5">
                              {(se.distance / 1000).toFixed(1)} km
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0 ml-4">
                            <p className="text-sm font-medium tabular-nums text-white/70">{fmtTime(se.elapsed_time)}</p>
                            {se.average_heartrate && (
                              <p className="text-[11px] text-white/30 tabular-nums">{Math.round(se.average_heartrate)} bpm</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Best efforts */}
              {(detail?.best_efforts?.length ?? 0) > 0 && (
                <motion.div variants={cardVariant} className="bento-card p-5">
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
                          const prColors: Record<number, string> = {1: '#F59E0B', 2: '#9CA3AF', 3: '#CD7C32'};
                          const prColor = be.pr_rank ? prColors[be.pr_rank] : undefined;
                          return (
                            <tr key={be.id} className="border-b border-white/[0.04] last:border-0">
                              <td className="py-2.5 text-white/70 text-xs">{be.name}</td>
                              <td className="py-2.5 text-right text-white/70 tabular-nums text-xs font-medium">{fmtTime(be.elapsed_time)}</td>
                              <td className="py-2.5 text-right text-xs">
                                {be.pr_rank ? (
                                  <span
                                    className="font-bold px-1.5 py-0.5 rounded-md"
                                    style={{color: prColor, background: `${prColor}20`}}
                                  >
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
              <motion.div variants={cardVariant} className="bento-card p-5">
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
                      <div key={label} className="bento-card px-3 py-2.5">
                        <p className="text-[10px] text-white/35 font-medium uppercase tracking-wide">{label}</p>
                        <p className="text-sm font-semibold text-white/85 mt-0.5 tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* HR Zone breakdown */}
              <motion.div variants={cardVariant} className="bento-card p-5">
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
