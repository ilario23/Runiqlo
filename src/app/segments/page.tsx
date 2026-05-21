'use client';

import {useMemo} from 'react';
import Link from 'next/link';
import {motion, type Variants} from 'framer-motion';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useStarredSegments} from '@/hooks/useStrava';
import type {StravaStarredSegment} from '@/lib/strava';
import AppHeader from '@/components/AppHeader';

// ─── constants ────────────────────────────────────────────────────────────────

const CLIMB_LABELS: Record<number, string> = {
  1: 'Cat 4',
  2: 'Cat 3',
  3: 'Cat 2',
  4: 'Cat 1',
  5: 'HC',
};

const containerVariant: Variants = {
  show: {transition: {staggerChildren: 0.05}},
};
const rowVariant: Variants = {
  hidden: {opacity: 0, y: 10},
  show: {opacity: 1, y: 0, transition: {duration: 0.25, ease: 'easeOut'}},
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtTime(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
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

function SegmentRow({segment}: {segment: StravaStarredSegment}) {
  const elevGain = segment.elevation_high - segment.elevation_low;
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
      <div className="hidden sm:flex items-center gap-6 flex-shrink-0">
        <div className="text-right w-[60px]">
          <p className="text-sm font-semibold tabular-nums text-white/80">
            {(segment.distance / 1000).toFixed(1)}
            <span className="text-[11px] font-normal text-white/35 ml-0.5">km</span>
          </p>
          <p className="text-[11px] text-white/35">distance</p>
        </div>

        <div className="text-right w-[50px]">
          {elevGain > 0 ? (
            <>
              <p className="text-sm font-semibold tabular-nums text-white/80">
                +{Math.round(elevGain)}
                <span className="text-[11px] font-normal text-white/35 ml-0.5">m</span>
              </p>
              <p className="text-[11px] text-white/35">gain</p>
            </>
          ) : <span className="text-white/20">—</span>}
        </div>

        <div className="text-right w-[60px]">
          {segment.athlete_pr_effort ? (
            <>
              <p className="text-sm font-semibold tabular-nums text-[#F59E0B]">
                {fmtTime(segment.athlete_pr_effort.elapsed_time)}
              </p>
              <p className="text-[11px] text-white/35">PR</p>
            </>
          ) : (
            <p className="text-[11px] text-white/25">No PR</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SegmentsPage() {
  const {isAuthenticated, isLoading: authLoading} = useStravaAuth();
  const {data: segments, isLoading} = useStarredSegments();

  const sorted = useMemo(
    () => (segments ? [...segments].sort((a, b) => b.average_grade - a.average_grade) : []),
    [segments],
  );

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

  return (
    <>
      <AppHeader />
      <main className="pt-[72px] pb-8 px-5 min-h-screen">
        <div className="max-w-[900px] mx-auto space-y-4">

          {/* Title */}
          <div className="pt-2 pb-1">
            <h1 className="text-xl font-semibold tracking-tight text-white">Starred Segments</h1>
            <p className="text-sm text-white/35 mt-0.5">
              {segments ? `${segments.length} starred` : 'Loading…'}
            </p>
          </div>

          {/* List */}
          <div className="bento-card overflow-hidden">
            {/* Column headers */}
            <div className="hidden sm:flex items-center gap-4 px-4 py-2.5 border-b border-white/[0.05]">
              <div className="w-[46px] text-[10px] font-medium text-white/25 uppercase tracking-wide">Grade</div>
              <div className="flex-1 text-[10px] font-medium text-white/25 uppercase tracking-wide">Segment</div>
              <div className="flex items-center gap-6">
                <div className="w-[60px] text-[10px] font-medium text-white/25 uppercase tracking-wide text-right">Distance</div>
                <div className="w-[50px] text-[10px] font-medium text-white/25 uppercase tracking-wide text-right">Gain</div>
                <div className="w-[60px] text-[10px] font-medium text-white/25 uppercase tracking-wide text-right">PR Time</div>
              </div>
            </div>

            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({length: 6}).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 py-2">
                    <Skeleton className="h-7 w-[46px] rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-2/3" />
                      <Skeleton className="h-2.5 w-1/4" />
                    </div>
                    <Skeleton className="h-3 w-28 hidden sm:block" />
                  </div>
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-white/25">No starred segments</p>
                <p className="text-xs text-white/20 mt-1">Star segments on Strava to see them here</p>
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
