'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {motion, type Variants} from 'framer-motion';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useActivitiesPaginated, useForceRefreshActivities} from '@/hooks/useStrava';
import {formatPace, formatDuration} from '@/lib/activityModel';
import type {ActivitySummary, ActivityType} from '@/lib/activityModel';
import AppHeader from '@/components/AppHeader';
import Link from 'next/link';

// ─── constants ────────────────────────────────────────────────────────────────

const SPORT_COLORS: Record<string, string> = {
  Run: '#30d158',
  Ride: '#0a84ff',
  Hike: '#ff9f0a',
  Swim: '#bf5af2',
  Walk: '#ffd60a',
};

const SPORT_TABS: {label: string; value: ActivityType | 'All'}[] = [
  {label: 'All', value: 'All'},
  {label: 'Run', value: 'Run'},
  {label: 'Ride', value: 'Ride'},
  {label: 'Hike', value: 'Hike'},
  {label: 'Swim', value: 'Swim'},
];

type SortKey = 'date' | 'distance' | 'elevation' | 'hr';

const SORT_OPTIONS: {label: string; value: SortKey}[] = [
  {label: 'Newest', value: 'date'},
  {label: 'Distance', value: 'distance'},
  {label: 'Elevation', value: 'elevation'},
  {label: 'Heart Rate', value: 'hr'},
];

const BATCH_SIZE = 30;

const containerVariant: Variants = {
  show: {transition: {staggerChildren: 0.04}},
};
const rowVariant: Variants = {
  hidden: {opacity: 0, y: 10},
  show: {opacity: 1, y: 0, transition: {duration: 0.25, ease: 'easeOut'}},
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function Skeleton({className = ''}: {className?: string}) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.06] ${className}`} />;
}

function ConnectPrompt() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bento-card p-10 max-w-sm w-full text-center space-y-5">
        <h2 className="text-lg font-semibold text-white">Connect Strava</h2>
        <p className="text-sm text-white/40">Link your account to view your activities</p>
        <Link
          href="/settings"
          className="block w-full bg-[#fc4c02] hover:bg-[#fc4c02]/90 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
        >
          Go to Settings
        </Link>
      </div>
    </div>
  );
}

// ─── Activity row ─────────────────────────────────────────────────────────────

function ActivityRow({activity, onClick}: {activity: ActivitySummary; onClick: () => void}) {
  const color = SPORT_COLORS[activity.type] ?? '#ffffff60';

  return (
    <motion.div
      variants={rowVariant}
      onClick={onClick}
      className="flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer group border border-transparent hover:border-white/[0.06]"
    >
      {/* Sport dot */}
      <div
        className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
        style={{background: color}}
      />

      {/* Name + date */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white/85 truncate group-hover:text-white transition-colors">
          {activity.name}
        </p>
        <p className="text-[11px] text-white/45 mt-0.5">
          {fmtDate(activity.date)} · {activity.type}
        </p>
      </div>

      {/* Stats */}
      <div className="hidden sm:flex items-center gap-6 text-right flex-shrink-0">
        <div>
          <p className="text-sm font-mono font-semibold tabular-nums text-white/80">
            {activity.distance.toFixed(1)}
            <span className="text-[11px] font-normal text-white/45 ml-0.5">km</span>
          </p>
          {activity.avgPace > 0 && (
            <p className="text-[11px] text-white/45 font-mono tabular-nums">
              {formatPace(activity.avgPace)}/km
            </p>
          )}
        </div>

        <div className="w-[56px]">
          {activity.elevationGain > 0 && (
            <>
              <p className="text-sm font-mono font-semibold tabular-nums text-white/80">
                {Math.round(activity.elevationGain)}
                <span className="text-[11px] font-normal text-white/45 ml-0.5">m</span>
              </p>
              <p className="text-[11px] text-white/45">elev</p>
            </>
          )}
        </div>

        <div className="w-[52px]">
          {activity.avgHr > 0 && (
            <>
              <p className="text-sm font-mono font-semibold tabular-nums text-white/80">
                {Math.round(activity.avgHr)}
              </p>
              <p className="text-[11px] text-white/45">bpm</p>
            </>
          )}
        </div>

        <div className="w-[56px]">
          <p className="text-sm font-mono font-semibold tabular-nums text-white/80">
            {formatDuration(activity.duration)}
          </p>
          <p className="text-[11px] text-white/45">time</p>
        </div>
      </div>

      {/* Chevron */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-white/20 group-hover:text-white/40 flex-shrink-0 transition-colors"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ActivitiesPage() {
  const router = useRouter();
  const {isAuthenticated, isLoading: authLoading} = useStravaAuth();
  const {data: activities, isLoading, isFullyLoaded} = useActivitiesPaginated(BATCH_SIZE);
  const forceRefresh = useForceRefreshActivities();

  const [sportFilter, setSportFilter] = useState<ActivityType | 'All'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!activities) return [];
    let list = sportFilter === 'All' ? activities : activities.filter((a) => a.type === sportFilter);
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'distance': return b.distance - a.distance;
        case 'elevation': return b.elevationGain - a.elevationGain;
        case 'hr': return b.avgHr - a.avgHr;
        default: return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
    });
    return list;
  }, [activities, sportFilter, sortKey]);

  // Reset visible count when filter/sort changes
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [sportFilter, sortKey]);

  const visibleActivities = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  const loadMore = useCallback(() => {
    setVisibleCount((n) => Math.min(n + BATCH_SIZE, filtered.length));
  }, [filtered.length]);

  // Intersection observer — load next batch when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      {rootMargin: '200px'},
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-[#0a84ff] animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return (
    <>
      <AppHeader />
      <div className="pt-[72px] flex items-center justify-center min-h-screen">
        <ConnectPrompt />
      </div>
    </>
  );

  return (
    <>
      <AppHeader onRefresh={forceRefresh} />
      <main className="pt-[72px] pb-8 px-5 min-h-screen">
        <div className="max-w-[1100px] mx-auto space-y-4">

          {/* Page title */}
          <div className="pt-2 pb-1">
            <h1 className="text-xl font-semibold tracking-tight text-white">Activities</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-sm text-white/50">
                {activities
                  ? isFullyLoaded
                    ? `${activities.length} activities synced`
                    : `${activities.length}+ activities`
                  : 'Loading…'}
              </p>
              {activities && !isFullyLoaded && (
                <div className="flex items-center gap-2">
                  <div className="h-1 w-24 rounded-full bg-white/[0.08] overflow-hidden">
                    <div className="h-full w-1/3 rounded-full bg-[#0a84ff] animate-pulse" />
                  </div>
                  <span className="text-[11px] text-white/45">syncing…</span>
                </div>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Sport tabs */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.05]">
              {SPORT_TABS.map(({label, value}) => {
                const active = sportFilter === value;
                const color = value !== 'All' ? SPORT_COLORS[value] : undefined;
                return (
                  <button
                    key={value}
                    onClick={() => setSportFilter(value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      active ? 'bg-white/[0.10] text-white' : 'text-white/40 hover:text-white/70'
                    }`}
                    style={active && color ? {color} : undefined}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Sort select */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/30">Sort:</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="bg-white/[0.06] border border-white/[0.08] text-white/70 text-xs rounded-lg px-2.5 py-1.5 outline-none cursor-pointer hover:bg-white/[0.09] transition-colors"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-[#111]">
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Activity list */}
          <div className="bento-card overflow-hidden">
            {/* Column headers */}
            <div className="hidden sm:flex items-center gap-4 px-4 py-2.5 border-b border-white/[0.05]">
              <div className="w-2 flex-shrink-0" />
              <div className="flex-1 text-[10px] font-medium text-white/25 uppercase tracking-wide">Activity</div>
              <div className="flex items-center gap-6 text-right">
                <div className="w-[72px] text-[10px] font-medium text-white/25 uppercase tracking-wide text-right">Distance</div>
                <div className="w-[56px] text-[10px] font-medium text-white/25 uppercase tracking-wide text-right">Elev</div>
                <div className="w-[52px] text-[10px] font-medium text-white/25 uppercase tracking-wide text-right">HR</div>
                <div className="w-[56px] text-[10px] font-medium text-white/25 uppercase tracking-wide text-right">Time</div>
              </div>
              <div className="w-[14px]" />
            </div>

            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({length: 10}).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 py-2">
                    <Skeleton className="w-2 h-2 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-2/3" />
                      <Skeleton className="h-2.5 w-1/4" />
                    </div>
                    <Skeleton className="h-3 w-20 hidden sm:block" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-white/25">No activities found</p>
              </div>
            ) : (
              <motion.div
                variants={containerVariant}
                initial="hidden"
                animate="show"
                className="p-2"
              >
                {visibleActivities.map((a) => (
                  <ActivityRow
                    key={a.id}
                    activity={a}
                    onClick={() => router.push(`/activities/${a.id}`)}
                  />
                ))}
              </motion.div>
            )}

            {/* Sentinel — triggers next batch load; hidden once all visible */}
            {visibleCount < filtered.length && (
              <div ref={sentinelRef} className="p-4 space-y-2">
                {Array.from({length: 3}).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 py-2">
                    <Skeleton className="w-2 h-2 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-2/3" />
                      <Skeleton className="h-2.5 w-1/4" />
                    </div>
                    <Skeleton className="h-3 w-20 hidden sm:block" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {activities && filtered.length > 0 && (
            <p className="text-center text-[11px] text-white/20">
              {!isFullyLoaded
                ? `Showing ${visibleActivities.length} activities…`
                : visibleCount >= filtered.length
                  ? `${filtered.length} ${sportFilter === 'All' ? '' : sportFilter + ' '}activit${filtered.length === 1 ? 'y' : 'ies'}`
                  : `${visibleActivities.length} of ${filtered.length} ${sportFilter === 'All' ? '' : sportFilter + ' '}activities`
              }
            </p>
          )}
        </div>
      </main>
    </>
  );
}
