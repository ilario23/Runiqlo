'use client';

import {use, useMemo} from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {motion, type Variants} from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useAllSegments, useSegmentDetail, useSegmentEfforts} from '@/hooks/useStrava';
import {decodePolyline} from '@/lib/polyline';
import AppHeader from '@/components/AppHeader';
import type {ZoneSegment} from '@/components/RouteMapLeaflet';
import type {SegmentEffortRecord} from '@/lib/stravaCache';

const RouteMapLeaflet = dynamic(() => import('@/components/RouteMapLeaflet'), {ssr: false});

// ─── constants ────────────────────────────────────────────────────────────────

const CLIMB_LABELS: Record<number, string> = {
  1: 'Cat 4', 2: 'Cat 3', 3: 'Cat 2', 4: 'Cat 1', 5: 'HC',
};

const cardVariant: Variants = {
  hidden: {opacity: 0, y: 16},
  show: {opacity: 1, y: 0, transition: {duration: 0.3, ease: 'easeOut'}},
};
const containerVariant: Variants = {
  show: {transition: {staggerChildren: 0.06}},
};

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

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
}

function fmtPace(elapsedSecs: number, distanceMeters: number): string {
  if (!distanceMeters) return '—';
  const minsPerKm = elapsedSecs / 60 / (distanceMeters / 1000);
  const mins = Math.floor(minsPerKm);
  const secs = Math.round((minsPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function gradeColor(grade: number): string {
  if (grade >= 15) return '#ff453a';
  if (grade >= 8) return '#ff9f0a';
  if (grade >= 4) return '#ffd60a';
  return '#30d158';
}

function prBadge(rank: number | null) {
  if (rank === 1) return <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[#F59E0B]/15 text-[#F59E0B] font-semibold flex-shrink-0">PR</span>;
  if (rank === 2) return <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-white/[0.08] text-white/50 flex-shrink-0">2nd</span>;
  if (rank === 3) return <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-white/[0.06] text-white/40 flex-shrink-0">3rd</span>;
  return null;
}

function StatTile({label, value, accent}: {label: string; value: string | number; accent?: string}) {
  return (
    <div className="px-3 py-2.5 rounded-xl bg-white/[0.04] flex flex-col gap-0.5">
      <p className="text-[11px] text-white/35 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold tabular-nums" style={{color: accent ?? 'rgba(255,255,255,0.85)'}}>
        {value}
      </p>
    </div>
  );
}

// ─── Progress chart ───────────────────────────────────────────────────────────

function ProgressChart({efforts}: {efforts: SegmentEffortRecord[]}) {
  const data = useMemo(() =>
    efforts.map((e) => ({
      date: e.activityDate,
      label: new Date(e.activityDate).toLocaleDateString(undefined, {month: 'short', year: '2-digit'}),
      time: e.elapsed_time,
      pr: e.pr_rank === 1,
    })),
    [efforts],
  );

  if (efforts.length < 2) {
    return (
      <div className="h-[160px] flex items-center justify-center">
        <p className="text-sm text-white/25">Run this segment again to see your progress trend</p>
      </div>
    );
  }

  const times = data.map((d) => d.time);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const padding = Math.max(10, (maxT - minT) * 0.15);

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{top: 8, right: 8, bottom: 0, left: 0}}>
        <XAxis
          dataKey="label"
          tick={{fontSize: 10, fill: 'rgba(255,255,255,0.3)'}}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[minT - padding, maxT + padding]}
          reversed
          tick={{fontSize: 10, fill: 'rgba(255,255,255,0.3)'}}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmtTime}
          width={48}
        />
        <RechartsTooltip
          contentStyle={{background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 12}}
          labelStyle={{color: 'rgba(255,255,255,0.5)', marginBottom: 4}}
          formatter={(val) => [fmtTime(Number(val)), 'Time']}
        />
        <Line
          type="monotone"
          dataKey="time"
          stroke="#30d158"
          strokeWidth={2}
          dot={(props) => {
            const {cx, cy, payload} = props;
            return (
              <circle
                key={`dot-${payload.date}`}
                cx={cx}
                cy={cy}
                r={payload.pr ? 5 : 3}
                fill={payload.pr ? '#F59E0B' : '#30d158'}
                stroke={payload.pr ? '#F59E0B' : '#30d158'}
                strokeWidth={1}
              />
            );
          }}
          activeDot={{r: 5, fill: '#30d158'}}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SegmentDetailPage({params}: {params: Promise<{id: string}>}) {
  const {id} = use(params);
  const segmentId = Number(id);

  const {isAuthenticated, isLoading: authLoading} = useStravaAuth();
  const {data: allSegmentsData} = useAllSegments();
  const {data: detail, isLoading: detailLoading} = useSegmentDetail(isNaN(segmentId) ? undefined : segmentId);
  const {data: efforts = [], isLoading: effortsLoading} = useSegmentEfforts(isNaN(segmentId) ? undefined : segmentId);

  const aggregated = useMemo(
    () => allSegmentsData?.segments.find((s) => s.id === segmentId) ?? null,
    [allSegmentsData, segmentId],
  );

  const mapSegments = useMemo((): ZoneSegment[] => {
    const polyline = detail?.map?.polyline;
    if (!polyline) return [];
    const points = decodePolyline(polyline);
    if (points.length < 2) return [];
    return [{points, color: '#30d158'}];
  }, [detail]);

  const effortsNewestFirst = useMemo(() => [...efforts].reverse(), [efforts]);

  const stats = useMemo(() => {
    if (!efforts.length) return null;
    const prTime = Math.min(...efforts.map((e) => e.elapsed_time));
    const avgTime = Math.round(efforts.reduce((s, e) => s + e.elapsed_time, 0) / efforts.length);
    const hrEfforts = efforts.filter((e) => e.average_heartrate != null);
    const avgHr = hrEfforts.length
      ? Math.round(hrEfforts.reduce((s, e) => s + (e.average_heartrate ?? 0), 0) / hrEfforts.length)
      : null;
    return {prTime, avgTime, avgHr};
  }, [efforts]);

  // ── Auth guards ────────────────────────────────────────────────────────────

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

  if (isNaN(segmentId)) {
    return (
      <>
        <AppHeader />
        <div className="pt-[72px] flex items-center justify-center min-h-screen">
          <p className="text-sm text-white/40">Invalid segment ID</p>
        </div>
      </>
    );
  }

  const segName = aggregated?.name ?? detail?.name ?? 'Segment';
  const segGrade = aggregated?.average_grade ?? detail?.average_grade;
  const segDist = aggregated?.distance ?? detail?.distance;
  const segCity = aggregated?.city ?? detail?.city;
  const segState = aggregated?.state ?? detail?.state;
  const segClimb = aggregated?.climb_category ?? detail?.climb_category ?? 0;
  const gColor = segGrade != null ? gradeColor(segGrade) : '#30d158';

  return (
    <>
      <AppHeader />
      <main className="pt-[72px] pb-8 px-5 min-h-screen">
        <div className="max-w-[1100px] mx-auto">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 py-3 text-xs text-white/35">
            <Link href="/segments" className="hover:text-white/60 transition-colors">Segments</Link>
            <span>/</span>
            <span className="text-white/55 truncate max-w-[200px]">{segName}</span>
          </div>

          {/* Title row */}
          <div className="mb-5">
            <div className="flex items-center gap-3 flex-wrap">
              {segGrade != null && (
                <span
                  className="text-xs font-bold tabular-nums px-2 py-1 rounded-lg"
                  style={{color: gColor, background: `${gColor}18`}}
                >
                  {segGrade.toFixed(1)}%
                </span>
              )}
              <h1 className="text-xl font-semibold tracking-tight text-white">{segName}</h1>
              {segClimb > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-white/[0.08] text-white/50">
                  {CLIMB_LABELS[segClimb] ?? `Cat ${segClimb}`}
                </span>
              )}
            </div>
            {(segCity || segState) && (
              <p className="text-sm text-white/35 mt-1 ml-0">
                {[segCity, segState].filter(Boolean).join(', ')}
              </p>
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
                {detailLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : mapSegments.length >= 1 ? (
                  <RouteMapLeaflet segments={mapSegments} hoverPos={null} color="#fc4c02" />
                ) : (
                  <div className="w-full h-[300px] flex items-center justify-center">
                    <p className="text-sm text-white/25">No map data</p>
                  </div>
                )}
              </motion.div>

              {/* Effort history */}
              <motion.div variants={cardVariant} className="bento-card p-5">
                <h2 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-4">History</h2>
                {effortsLoading ? (
                  <div className="space-y-2">
                    {Array.from({length: 5}).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : effortsNewestFirst.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-white/25">No efforts recorded yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] text-white/30 uppercase tracking-wide border-b border-white/[0.05]">
                          <th className="pb-2 text-left font-medium">Date</th>
                          <th className="pb-2 text-right font-medium">Time</th>
                          <th className="pb-2 text-right font-medium">Pace</th>
                          <th className="pb-2 text-right font-medium hidden sm:table-cell">Avg HR</th>
                          <th className="pb-2 text-right font-medium hidden sm:table-cell">Max HR</th>
                          <th className="pb-2 text-right font-medium w-[50px]"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {effortsNewestFirst.map((effort) => (
                          <tr
                            key={effort.effortId}
                            className={`border-b border-white/[0.04] last:border-0 ${effort.pr_rank === 1 ? 'bg-[#F59E0B]/[0.04]' : ''}`}
                          >
                            <td className="py-2.5 text-white/60 text-xs">
                              <Link
                                href={`/activities/${effort.activityId}`}
                                className="hover:text-white/90 transition-colors"
                              >
                                {fmtDate(effort.activityDate)}
                              </Link>
                            </td>
                            <td className="py-2.5 text-right font-semibold tabular-nums text-white/80">
                              {fmtTime(effort.elapsed_time)}
                            </td>
                            <td className="py-2.5 text-right tabular-nums text-white/50 text-xs">
                              {fmtPace(effort.elapsed_time, effort.distance)}/km
                            </td>
                            <td className="py-2.5 text-right tabular-nums text-white/50 text-xs hidden sm:table-cell">
                              {effort.average_heartrate != null ? Math.round(effort.average_heartrate) : '—'}
                            </td>
                            <td className="py-2.5 text-right tabular-nums text-white/50 text-xs hidden sm:table-cell">
                              {effort.max_heartrate != null ? effort.max_heartrate : '—'}
                            </td>
                            <td className="py-2.5 text-right">
                              {prBadge(effort.pr_rank)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>

              {/* Progress chart */}
              <motion.div variants={cardVariant} className="bento-card p-5">
                <h2 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-4">Progress</h2>
                {effortsLoading ? (
                  <Skeleton className="h-[180px] w-full" />
                ) : (
                  <ProgressChart efforts={efforts} />
                )}
              </motion.div>

            </div>

            {/* ── Right column ── */}
            <div className="col-span-12 lg:col-span-4 space-y-4">

              {/* Stats */}
              <motion.div variants={cardVariant} className="bento-card p-5">
                <h2 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-4">Stats</h2>
                {effortsLoading && !aggregated ? (
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({length: 6}).map((_, i) => <Skeleton key={i} className="h-14" />)}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {stats && (
                      <StatTile label="PR Time" value={fmtTime(stats.prTime)} accent="#F59E0B" />
                    )}
                    <StatTile label="Total Efforts" value={efforts.length || aggregated?.effortCount || '—'} />
                    {stats && <StatTile label="Avg Time" value={fmtTime(stats.avgTime)} />}
                    {stats?.avgHr != null && <StatTile label="Avg HR" value={`${stats.avgHr} bpm`} />}
                    {segDist != null && (
                      <StatTile label="Distance" value={`${(segDist / 1000).toFixed(2)} km`} />
                    )}
                    {segGrade != null && (
                      <StatTile label="Avg Grade" value={`${segGrade.toFixed(1)}%`} accent={gColor} />
                    )}
                    {(aggregated?.maximum_grade ?? detail?.maximum_grade) != null && (
                      <StatTile
                        label="Max Grade"
                        value={`${(aggregated?.maximum_grade ?? detail?.maximum_grade)!.toFixed(1)}%`}
                      />
                    )}
                    {detail?.total_elevation_gain != null && (
                      <StatTile label="Elev Gain" value={`${Math.round(detail.total_elevation_gain)} m`} />
                    )}
                  </div>
                )}
              </motion.div>

            </div>
          </motion.div>
        </div>
      </main>
    </>
  );
}
