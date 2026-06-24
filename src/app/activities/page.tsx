'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {motion, type Variants} from 'framer-motion';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useActivitiesPaginated, useForceRefreshActivities, useAllSegments} from '@/hooks/useStrava';
import {formatPace, formatDuration, SPORT_COLORS, COLORS} from '@/lib/activityModel';
import type {ActivitySummary, ActivityType} from '@/lib/activityModel';
import type {AggregatedSegment} from '@/lib/stravaCache';
import {Skeleton} from '@/components/ui/skeleton';
import AppHeader from '@/components/AppHeader';
import {Tile, Readout} from '@/components/rq2/ui';
import Link from 'next/link';

// ─── constants ────────────────────────────────────────────────────────────────

type ActiveTab = 'activities' | 'segments';

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

const CLIMB_LABELS: Record<number, string> = {
  1: 'Cat 4',
  2: 'Cat 3',
  3: 'Cat 2',
  4: 'Cat 1',
  5: 'HC',
};

type SegSortKey = 'grade' | 'distance' | 'efforts' | 'pr' | 'date';

const containerVariant: Variants = {
  show: {transition: {staggerChildren: 0.04}},
};
const rowVariant: Variants = {
  hidden: {opacity: 0},
  show: {opacity: 1, transition: {duration: 0.25, ease: 'easeOut'}},
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fmtTime(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtSegDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
}

function gradeColor(grade: number): string {
  if (grade >= 15) return COLORS.red;
  if (grade >= 8) return COLORS.orange;
  if (grade >= 4) return COLORS.yellow;
  return COLORS.green;
}

function ConnectPrompt() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="surface-card p-10 max-w-sm w-full text-center space-y-5">
        <h2 className="h-section" style={{fontSize: 24}}>Connect Strava</h2>
        <p className="body-serif" style={{fontStyle: 'italic'}}>Link your account to view your activities</p>
        <Link href="/settings" className="btn ink w-full justify-center">Go to Settings →</Link>
      </div>
    </div>
  );
}

// ─── Activity row ─────────────────────────────────────────────────────────────

function ActivityRow({activity, onClick}: {activity: ActivitySummary; onClick: () => void}) {
  const color = SPORT_COLORS[activity.type] ?? 'var(--color-ink-3)';

  return (
    <motion.div
      variants={rowVariant}
      onClick={onClick}
      className="flex items-center gap-4 px-4 py-3.5 hover:bg-[var(--color-surface-1)] transition-colors cursor-pointer group border-b border-[var(--color-border)] last:border-0"
    >
      <div
        className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
        style={{background: color}}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-ink)] truncate group-hover:text-[var(--color-rust)] transition-colors">
          {activity.name}
        </p>
        <p className="text-[11px] text-[var(--color-ink-3)] mt-0.5">
          {fmtDate(activity.date)} · {activity.type}
          {activity.distance > 0 && (
            <span className="sm:hidden">
              {' · '}
              <span className="font-mono tabular-nums text-[var(--color-ink-2)]">
                {activity.distance.toFixed(1)} km
              </span>
            </span>
          )}
        </p>
      </div>
      <div className="hidden sm:flex items-center gap-6 text-right flex-shrink-0">
        <div>
          <p className="text-sm font-mono font-semibold tabular-nums text-[var(--color-ink)]">
            {activity.distance.toFixed(1)}
            <span className="text-[11px] font-normal text-[var(--color-ink-3)] ml-0.5">km</span>
          </p>
          {activity.avgPace > 0 && (
            <p className="text-[11px] text-[var(--color-ink-3)] font-mono tabular-nums">
              {formatPace(activity.avgPace)}/km
            </p>
          )}
        </div>
        <div className="w-[56px]">
          {activity.elevationGain > 0 && (
            <>
              <p className="text-sm font-mono font-semibold tabular-nums text-[var(--color-ink)]">
                {Math.round(activity.elevationGain)}
                <span className="text-[11px] font-normal text-[var(--color-ink-3)] ml-0.5">m</span>
              </p>
              <p className="text-[11px] text-[var(--color-ink-3)]">elev</p>
            </>
          )}
        </div>
        <div className="w-[52px]">
          {activity.avgHr > 0 && (
            <>
              <p className="text-sm font-mono font-semibold tabular-nums text-[var(--color-ink)]">
                {Math.round(activity.avgHr)}
              </p>
              <p className="text-[11px] text-[var(--color-ink-3)]">bpm</p>
            </>
          )}
        </div>
        <div className="w-[56px]">
          <p className="text-sm font-mono font-semibold tabular-nums text-[var(--color-ink)]">
            {formatDuration(activity.duration)}
          </p>
          <p className="text-[11px] text-[var(--color-ink-3)]">time</p>
        </div>
      </div>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-[var(--color-ink-3)] group-hover:text-[var(--color-rust)]/40 flex-shrink-0 transition-colors"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </motion.div>
  );
}

// ─── Segment row ──────────────────────────────────────────────────────────────

function SegmentRow({segment, onClick}: {segment: AggregatedSegment; onClick?: () => void}) {
  const gColor = gradeColor(segment.average_grade);

  return (
    <motion.div
      variants={rowVariant}
      onClick={onClick}
      className="flex items-center gap-4 px-4 py-3.5 hover:bg-[var(--color-surface-1)] transition-colors group border-b border-[var(--color-border)] last:border-0 cursor-pointer"
    >
      <div
        className="flex-shrink-0 text-xs font-mono font-bold tabular-nums px-2 py-1 rounded-lg min-w-[46px] text-center"
        style={{color: gColor, background: `${gColor}18`}}
      >
        {segment.average_grade.toFixed(1)}%
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[var(--color-ink)] truncate group-hover:text-[var(--color-rust)] transition-colors">
            {segment.name}
          </p>
          {segment.starred && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gold/15 text-gold flex-shrink-0">★</span>
          )}
          {segment.climb_category > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[var(--color-paper-3)] text-[var(--color-ink-2)] flex-shrink-0">
              {CLIMB_LABELS[segment.climb_category] ?? `Cat ${segment.climb_category}`}
            </span>
          )}
        </div>
        <p className="text-[11px] text-[var(--color-ink-3)] mt-0.5">
          {[segment.city, segment.state].filter(Boolean).join(', ')}
        </p>
      </div>
      <div className="hidden sm:flex items-center gap-5 flex-shrink-0">
        <div className="text-right w-[55px]">
          <p className="text-sm font-mono font-semibold tabular-nums text-[var(--color-ink)]">
            {(segment.distance / 1000).toFixed(1)}
            <span className="text-[11px] font-normal text-[var(--color-ink-3)] ml-0.5">km</span>
          </p>
          <p className="text-[11px] text-[var(--color-ink-3)]">dist</p>
        </div>
        <div className="text-right w-[44px]">
          <p className="text-sm font-mono font-semibold tabular-nums text-[var(--color-ink)]">{segment.effortCount}</p>
          <p className="text-[11px] text-[var(--color-ink-3)]">runs</p>
        </div>
        <div className="text-right w-[60px]">
          <p className="text-sm font-mono font-semibold tabular-nums text-gold">
            {fmtTime(segment.prTime)}
          </p>
          <p className="text-[11px] text-[var(--color-ink-3)]">PR</p>
        </div>
        <div className="text-right w-[90px]">
          <p className="text-[11px] font-mono tabular-nums text-[var(--color-ink-3)]">{fmtSegDate(segment.lastRunDate)}</p>
          <p className="text-[11px] text-[var(--color-ink-3)]">last run</p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Sort button ──────────────────────────────────────────────────────────────

function SortBtn({
  label, active, asc, onClick,
}: {label: string; active: boolean; asc: boolean; onClick: () => void}) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] font-medium uppercase tracking-wide transition-colors flex items-center gap-1 ${
        active ? 'text-[var(--color-ink-2)]' : 'text-[var(--color-ink-3)] hover:text-[var(--color-ink-3)]'
      }`}
    >
      {label}
      {active && <span className="text-[9px]">{asc ? '↑' : '↓'}</span>}
    </button>
  );
}

// ─── Segments tab (lazy — useAllSegments only fires when this mounts) ────────

function SegmentsTab({router}: {router: ReturnType<typeof useRouter>}) {
  const {data: segments, isLoading} = useAllSegments();
  const [segSortKey, setSegSortKey] = useState<SegSortKey>('efforts');
  const [segSortAsc, setSegSortAsc] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);

  const sorted = useMemo(() => {
    if (!segments) return [];
    let list = starredOnly ? segments.filter((s) => s.starred) : segments;
    list = [...list].sort((a, b) => {
      let va: number, vb: number;
      switch (segSortKey) {
        case 'grade':    va = a.average_grade; vb = b.average_grade; break;
        case 'distance': va = a.distance;       vb = b.distance;      break;
        case 'efforts':  va = a.effortCount;    vb = b.effortCount;   break;
        case 'pr':       va = a.prTime;         vb = b.prTime;        break;
        case 'date':     va = a.lastRunDate < b.lastRunDate ? -1 : a.lastRunDate > b.lastRunDate ? 1 : 0; return segSortAsc ? va : -va;
        default:         va = 0; vb = 0;
      }
      return segSortAsc ? va - vb : vb - va;
    });
    return list;
  }, [segments, segSortKey, segSortAsc, starredOnly]);

  const handleSort = (key: SegSortKey) => {
    if (segSortKey === key) setSegSortAsc((v) => !v);
    else { setSegSortKey(key); setSegSortAsc(key === 'pr'); }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-[var(--color-ink-2)]">
          {segments
            ? `${sorted.length} segment${sorted.length !== 1 ? 's' : ''}`
            : 'Loading…'}
        </p>
        <div className="flex items-center gap-3">
          {segments && segments.some((s) => s.starred) && (
            <button
              onClick={() => setStarredOnly((v) => !v)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                starredOnly
                  ? 'border-gold/40 bg-gold/10 text-gold'
                  : 'border-[var(--color-rule)] bg-[var(--color-paper-2)] text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]'
              }`}
            >
              ★ Starred only
            </button>
          )}
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="hidden sm:flex items-center gap-4 px-4 py-2.5 border-b border-[var(--color-rule)]">
          <div className="w-[46px]">
            <SortBtn label="Grade" active={segSortKey === 'grade'} asc={segSortAsc} onClick={() => handleSort('grade')} />
          </div>
          <div className="flex-1 text-[10px] font-medium text-[var(--color-ink-3)] uppercase tracking-wide">Segment</div>
          <div className="flex items-center gap-5">
            <div className="w-[55px] text-right">
              <SortBtn label="Dist" active={segSortKey === 'distance'} asc={segSortAsc} onClick={() => handleSort('distance')} />
            </div>
            <div className="w-[44px] text-right">
              <SortBtn label="Runs" active={segSortKey === 'efforts'} asc={segSortAsc} onClick={() => handleSort('efforts')} />
            </div>
            <div className="w-[60px] text-right">
              <SortBtn label="PR" active={segSortKey === 'pr'} asc={segSortAsc} onClick={() => handleSort('pr')} />
            </div>
            <div className="w-[90px] text-right">
              <SortBtn label="Last run" active={segSortKey === 'date'} asc={segSortAsc} onClick={() => handleSort('date')} />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({length: 8}).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-2">
                <Skeleton className="h-7 w-[46px] rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-2.5 w-1/4" />
                </div>
                <Skeleton className="h-3 w-40 hidden sm:block" />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-[var(--color-ink-3)]">No segments found</p>
            <p className="text-xs text-[var(--color-ink-3)] mt-1">Open an activity to load its segment data</p>
          </div>
        ) : (
          <motion.div variants={containerVariant} initial="hidden" animate="show" className="p-2">
            {sorted.map((seg) => (
              <SegmentRow key={seg.id} segment={seg} onClick={() => router.push(`/segments/${seg.id}`)} />
            ))}
          </motion.div>
        )}
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ActivitiesPage() {
  const router = useRouter();
  const {isAuthenticated, isLoading: authLoading} = useStravaAuth();
  const {data: activities, isLoading, isFullyLoaded} = useActivitiesPaginated(BATCH_SIZE);
  const forceRefresh = useForceRefreshActivities();

  const [activeTab, setActiveTab] = useState<ActiveTab>('activities');
  const [sportFilter, setSportFilter] = useState<ActivityType | 'All'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Initialize tab from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'segments') setActiveTab('segments');
  }, []);

  const switchTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    const url = tab === 'segments' ? '/activities?tab=segments' : '/activities';
    window.history.replaceState(null, '', url);
  };

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

  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [sportFilter, sortKey]);

  const visibleActivities = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  const stats = useMemo(() => {
    if (!filtered.length) return null;
    const volume = filtered.reduce((s, a) => s + a.distance, 0);
    const time = filtered.reduce((s, a) => s + a.duration, 0);
    const paced = filtered.filter((a) => a.avgPace > 0);
    const avgPace = paced.length ? paced.reduce((s, a) => s + a.avgPace, 0) / paced.length : 0;
    return {count: filtered.length, volume, time, avgPace};
  }, [filtered]);

  const loadMore = useCallback(() => {
    setVisibleCount((n) => Math.min(n + BATCH_SIZE, filtered.length));
  }, [filtered.length]);

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
        <div className="w-8 h-8 rounded-full border-2 border-[var(--color-rule)] border-t-[var(--color-rust)] animate-spin" />
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
      <main className="scroll" style={{minHeight: '100dvh', paddingTop: 52, paddingBottom: 96}}>
        <div className="rise max-w-[1100px] mx-auto space-y-4" style={{padding: 'var(--pad)'}}>

          {/* Stat tiles */}
          {activeTab === 'activities' && (
            <div className="grid grid-cols-2 md:grid-cols-4" style={{gap: 'var(--gap)'}}>
              <Tile pad><Readout label={isFullyLoaded ? 'ACTIVITIES' : 'ACTIVITIES (SO FAR)'} value={stats?.count ?? '—'} unit="runs" size="var(--fs-xl)" /></Tile>
              <Tile pad><Readout label="VOLUME" value={stats ? stats.volume.toFixed(0) : '—'} unit="km" size="var(--fs-xl)" /></Tile>
              <Tile pad><Readout label="MOVING TIME" value={stats ? (stats.time / 3600).toFixed(1) : '—'} unit="h" size="var(--fs-xl)" /></Tile>
              <Tile pad><Readout label="AVG PACE" value={stats && stats.avgPace > 0 ? formatPace(stats.avgPace) : '—'} unit="/km" size="var(--fs-xl)" color="var(--accent)" /></Tile>
            </div>
          )}

          {/* Tab bar */}
          <div className="flex items-center border-b border-[var(--color-border)]">
            {([
              {value: 'activities' as ActiveTab, label: 'Activities'},
              {value: 'segments' as ActiveTab, label: 'Segments'},
            ]).map(({value, label}) => (
              <button
                key={value}
                onClick={() => switchTab(value)}
                className={`px-4 pb-2.5 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
                  activeTab === value
                    ? 'text-[var(--color-ink)] border-[var(--color-accent)]'
                    : 'text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)] border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Activities tab ───────────────────────────────────────────── */}
          {activeTab === 'activities' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center border-b border-[var(--color-border)]">
                  {SPORT_TABS.map(({label, value}) => {
                    const active = sportFilter === value;
                    const color = value !== 'All' ? SPORT_COLORS[value] : undefined;
                    return (
                      <button
                        key={value}
                        onClick={() => setSportFilter(value)}
                        className={`px-3 pb-2 text-xs font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
                          active ? 'text-[var(--color-ink)] border-[var(--color-accent)]' : 'text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)] border-transparent'
                        }`}
                        style={active && color ? {color, borderColor: color} : undefined}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--color-ink-3)]">Sort:</span>
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    className="bg-[var(--color-surface-1)] border border-[var(--color-border)] text-[var(--color-ink)]/70 text-xs rounded-lg px-2.5 py-1.5 outline-none cursor-pointer hover:bg-[var(--color-surface-2)] transition-colors"
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value} className="bg-[var(--color-paper)]">
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="surface-card overflow-hidden">
                <div className="hidden sm:flex items-center gap-4 px-4 py-2.5 border-b border-[var(--color-rule)]">
                  <div className="w-2 flex-shrink-0" />
                  <div className="flex-1 text-[10px] font-medium text-[var(--color-ink-3)] uppercase tracking-wide">Activity</div>
                  <div className="flex items-center gap-6 text-right">
                    <div className="w-[72px] text-[10px] font-medium text-[var(--color-ink-3)] uppercase tracking-wide text-right">Distance</div>
                    <div className="w-[56px] text-[10px] font-medium text-[var(--color-ink-3)] uppercase tracking-wide text-right">Elev</div>
                    <div className="w-[52px] text-[10px] font-medium text-[var(--color-ink-3)] uppercase tracking-wide text-right">HR</div>
                    <div className="w-[56px] text-[10px] font-medium text-[var(--color-ink-3)] uppercase tracking-wide text-right">Time</div>
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
                    <p className="text-sm text-[var(--color-ink-3)]">No activities found</p>
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
                <p className="text-center text-[11px] text-[var(--color-ink-3)]">
                  {!isFullyLoaded
                    ? `Showing ${visibleActivities.length} activities…`
                    : visibleCount >= filtered.length
                      ? `${filtered.length} ${sportFilter === 'All' ? '' : sportFilter + ' '}activit${filtered.length === 1 ? 'y' : 'ies'}`
                      : `${visibleActivities.length} of ${filtered.length} ${sportFilter === 'All' ? '' : sportFilter + ' '}activities`
                  }
                </p>
              )}
            </>
          )}

          {/* ── Segments tab ─────────────────────────────────────────────── */}
          {activeTab === 'segments' && <SegmentsTab router={router} />}
        </div>
      </main>
    </>
  );
}
