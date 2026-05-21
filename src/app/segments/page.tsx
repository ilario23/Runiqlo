'use client';

import {useMemo, useState} from 'react';
import Link from 'next/link';
import {motion, type Variants} from 'framer-motion';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useAllSegments} from '@/hooks/useStrava';
import type {AggregatedSegment} from '@/lib/stravaCache';
import AppHeader from '@/components/AppHeader';

// ─── constants ────────────────────────────────────────────────────────────────

const CLIMB_LABELS: Record<number, string> = {
  1: 'Cat 4',
  2: 'Cat 3',
  3: 'Cat 2',
  4: 'Cat 1',
  5: 'HC',
};

type SortKey = 'grade' | 'distance' | 'efforts' | 'pr' | 'date';

const containerVariant: Variants = {
  show: {transition: {staggerChildren: 0.04}},
};
const rowVariant: Variants = {
  hidden: {opacity: 0, y: 8},
  show: {opacity: 1, y: 0, transition: {duration: 0.2, ease: 'easeOut'}},
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtTime(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
}

function gradeColor(grade: number): string {
  if (grade >= 15) return '#ff453a';
  if (grade >= 8) return '#ff9f0a';
  if (grade >= 4) return '#ffd60a';
  return '#30d158';
}

function Skeleton({className = ''}: {className?: string}) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.06] ${className}`} />;
}

// ─── Segment row ──────────────────────────────────────────────────────────────

function SegmentRow({segment}: {segment: AggregatedSegment}) {
  const gColor = gradeColor(segment.average_grade);

  return (
    <motion.div
      variants={rowVariant}
      className="flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-white/[0.04] transition-colors group border border-transparent hover:border-white/[0.06]"
    >
      {/* Grade badge */}
      <div
        className="flex-shrink-0 text-xs font-bold tabular-nums px-2 py-1 rounded-lg min-w-[46px] text-center"
        style={{color: gColor, background: `${gColor}18`}}
      >
        {segment.average_grade.toFixed(1)}%
      </div>

      {/* Name + location */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white/85 truncate group-hover:text-white transition-colors">
            {segment.name}
          </p>
          {segment.starred && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#F59E0B]/15 text-[#F59E0B] flex-shrink-0">★</span>
          )}
          {segment.climb_category > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-white/[0.08] text-white/50 flex-shrink-0">
              {CLIMB_LABELS[segment.climb_category] ?? `Cat ${segment.climb_category}`}
            </span>
          )}
        </div>
        <p className="text-[11px] text-white/35 mt-0.5">
          {[segment.city, segment.state].filter(Boolean).join(', ')}
        </p>
      </div>

      {/* Stats */}
      <div className="hidden sm:flex items-center gap-5 flex-shrink-0">
        <div className="text-right w-[55px]">
          <p className="text-sm font-semibold tabular-nums text-white/80">
            {(segment.distance / 1000).toFixed(1)}
            <span className="text-[11px] font-normal text-white/35 ml-0.5">km</span>
          </p>
          <p className="text-[11px] text-white/35">dist</p>
        </div>

        <div className="text-right w-[44px]">
          <p className="text-sm font-semibold tabular-nums text-white/80">{segment.effortCount}</p>
          <p className="text-[11px] text-white/35">runs</p>
        </div>

        <div className="text-right w-[60px]">
          <p className="text-sm font-semibold tabular-nums text-[#F59E0B]">
            {fmtTime(segment.prTime)}
          </p>
          <p className="text-[11px] text-white/35">PR</p>
        </div>

        <div className="text-right w-[90px]">
          <p className="text-[11px] tabular-nums text-white/40">{fmtDate(segment.lastRunDate)}</p>
          <p className="text-[11px] text-white/25">last run</p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Sort button ──────────────────────────────────────────────────────────────

function SortBtn({
  label, sortKey, active, asc, onClick,
}: {label: string; sortKey: SortKey; active: boolean; asc: boolean; onClick: () => void}) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] font-medium uppercase tracking-wide transition-colors flex items-center gap-1 ${
        active ? 'text-white/60' : 'text-white/25 hover:text-white/40'
      }`}
    >
      {label}
      {active && <span className="text-[9px]">{asc ? '↑' : '↓'}</span>}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SegmentsPage() {
  const {isAuthenticated, isLoading: authLoading} = useStravaAuth();
  const {data, isLoading} = useAllSegments();
  const [sortKey, setSortKey] = useState<SortKey>('efforts');
  const [sortAsc, setSortAsc] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);

  const sorted = useMemo(() => {
    if (!data?.segments) return [];
    let list = starredOnly ? data.segments.filter((s) => s.starred) : data.segments;
    list = [...list].sort((a, b) => {
      let va: number, vb: number;
      switch (sortKey) {
        case 'grade':    va = a.average_grade; vb = b.average_grade; break;
        case 'distance': va = a.distance;       vb = b.distance;      break;
        case 'efforts':  va = a.effortCount;    vb = b.effortCount;   break;
        case 'pr':       va = a.prTime;         vb = b.prTime;        break;
        case 'date':     va = a.lastRunDate < b.lastRunDate ? -1 : a.lastRunDate > b.lastRunDate ? 1 : 0; return sortAsc ? va : -va;
        default:         va = 0; vb = 0;
      }
      return sortAsc ? va - vb : vb - va;
    });
    return list;
  }, [data, sortKey, sortAsc, starredOnly]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(key === 'pr'); }
  };

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

  const coverage = data ? `${data.activitiesWithDetails} of ${data.totalActivities} activities loaded` : null;

  return (
    <>
      <AppHeader />
      <main className="pt-[72px] pb-8 px-5 min-h-screen">
        <div className="max-w-[960px] mx-auto space-y-4">

          {/* Title + controls */}
          <div className="pt-2 pb-1 flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-white">Segments</h1>
              <p className="text-sm text-white/35 mt-0.5">
                {data
                  ? `${sorted.length} segment${sorted.length !== 1 ? 's' : ''} · ${coverage}`
                  : 'Loading…'}
              </p>
            </div>
            {data && data.segments.some((s) => s.starred) && (
              <button
                onClick={() => setStarredOnly((v) => !v)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  starredOnly
                    ? 'border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]'
                    : 'border-white/10 bg-white/[0.04] text-white/40 hover:text-white/60'
                }`}
              >
                ★ Starred only
              </button>
            )}
          </div>

          {/* List */}
          <div className="bento-card overflow-hidden">
            {/* Column headers */}
            <div className="hidden sm:flex items-center gap-4 px-4 py-2.5 border-b border-white/[0.05]">
              <div className="w-[46px]">
                <SortBtn label="Grade" sortKey="grade" active={sortKey === 'grade'} asc={sortAsc} onClick={() => handleSort('grade')} />
              </div>
              <div className="flex-1 text-[10px] font-medium text-white/25 uppercase tracking-wide">Segment</div>
              <div className="flex items-center gap-5">
                <div className="w-[55px] text-right">
                  <SortBtn label="Dist" sortKey="distance" active={sortKey === 'distance'} asc={sortAsc} onClick={() => handleSort('distance')} />
                </div>
                <div className="w-[44px] text-right">
                  <SortBtn label="Runs" sortKey="efforts" active={sortKey === 'efforts'} asc={sortAsc} onClick={() => handleSort('efforts')} />
                </div>
                <div className="w-[60px] text-right">
                  <SortBtn label="PR" sortKey="pr" active={sortKey === 'pr'} asc={sortAsc} onClick={() => handleSort('pr')} />
                </div>
                <div className="w-[90px] text-right">
                  <SortBtn label="Last run" sortKey="date" active={sortKey === 'date'} asc={sortAsc} onClick={() => handleSort('date')} />
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
                <p className="text-sm text-white/25">No segments found</p>
                <p className="text-xs text-white/20 mt-1">
                  {data && data.activitiesWithDetails === 0
                    ? 'Open an activity to load its segment data'
                    : 'No segments in your cached activities'}
                </p>
              </div>
            ) : (
              <motion.div
                variants={containerVariant}
                initial="hidden"
                animate="show"
                className="p-2"
              >
                {sorted.map((seg) => (
                  <SegmentRow key={seg.id} segment={seg} />
                ))}
              </motion.div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
