'use client';

import Link from 'next/link';
import {formatPace, formatDuration, COLORS} from '@/lib/activityModel';
import {gapForSegment} from '@/lib/gap';
import type {StravaSplit, StravaSegmentEffort, StravaBestEffort} from '@/lib/strava';
import type {RouteMatch} from '@/lib/routeMatch';

const MEDAL: Record<number, {color: string; label: string}> = {
  1: {color: COLORS.gold, label: '1st'},
  2: {color: 'var(--color-medal-silver)', label: '2nd'},
  3: {color: 'var(--color-medal-bronze)', label: '3rd'},
};
const medalBg = (c: string) => `color-mix(in srgb, ${c} 12%, transparent)`;

function paceFromSpeed(mps: number): number {
  return mps > 0 ? 1 / (mps * 60 / 1000) : 0;
}

// ─── Per-km Splits + Grade Adjusted Pace ───────────────────────────────────────

export function SplitsCard({splits}: {splits: StravaSplit[]}) {
  if (!splits || splits.length === 0) return null;

  const paces = splits.map((s) => paceFromSpeed(s.average_speed)).filter((p) => p > 0);
  const fastest = Math.min(...paces);
  const slowest = Math.max(...paces);
  const range = slowest - fastest || 1;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] text-[var(--faint)] uppercase tracking-wide border-b border-[var(--line)]">
            <th className="pb-2 text-left font-medium">Km</th>
            <th className="pb-2 text-left font-medium w-[40%]">Pace</th>
            <th className="pb-2 text-right font-medium">GAP</th>
            <th className="pb-2 text-right font-medium">Elev</th>
            <th className="pb-2 text-right font-medium">HR</th>
          </tr>
        </thead>
        <tbody>
          {splits.map((s) => {
            const pace = paceFromSpeed(s.average_speed);
            const gap = gapForSegment(s.average_speed, s.distance, s.elevation_difference);
            // Bar: faster splits → longer bar. 35%..100% so slowest still shows.
            const frac = pace > 0 ? 1 - (pace - fastest) / range : 0;
            const width = 35 + frac * 65;
            const isFastest = pace > 0 && pace === fastest;
            return (
              <tr key={s.split} className="border-b border-[var(--line)] last:border-0">
                <td className="py-2 text-[var(--dim)] text-xs tabular-nums">{s.split}</td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs tabular-nums text-[var(--text)] w-9 flex-shrink-0">
                      {pace > 0 ? formatPace(pace) : '—'}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--color-surface-1)] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${width}%`,
                          background: isFastest ? COLORS.green : 'var(--faint)',
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td className="py-2 text-right text-xs tabular-nums text-[var(--dim)]">
                  {gap != null ? formatPace(gap) : '—'}
                </td>
                <td className="py-2 text-right text-xs tabular-nums text-[var(--faint)]">
                  {Math.round(s.elevation_difference) > 0 ? '+' : ''}{Math.round(s.elevation_difference)}m
                </td>
                <td className="py-2 text-right text-xs tabular-nums text-[var(--faint)]">
                  {s.average_heartrate ? Math.round(s.average_heartrate) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-[var(--faint)] mt-3">
        GAP = grade-adjusted pace (flat-equivalent effort). Pace in min/km.
      </p>
    </div>
  );
}

// ─── Top Results — medal-worthy achievements ───────────────────────────────────

interface TopResult {
  key: string;
  rank: number;
  label: string;
  detail: string;
  href?: string;
}

export function TopResultsCard({
  segmentEfforts,
  bestEfforts,
}: {
  segmentEfforts: StravaSegmentEffort[];
  bestEfforts: StravaBestEffort[];
  activityId: string;
}) {
  const results: TopResult[] = [];

  for (const be of bestEfforts ?? []) {
    if (be.pr_rank && be.pr_rank <= 3) {
      results.push({
        key: `be-${be.id}`,
        rank: be.pr_rank,
        label: be.name,
        detail: formatDuration(be.elapsed_time),
      });
    }
  }

  for (const se of segmentEfforts ?? []) {
    // Prefer the richest achievement (lowest rank) attached to this effort.
    const ach = (se.achievements ?? [])
      .filter((a) => a.rank >= 1 && a.rank <= 3)
      .sort((a, b) => a.rank - b.rank)[0];
    const rank = ach?.rank ?? (se.pr_rank && se.pr_rank <= 3 ? se.pr_rank : undefined);
    if (rank) {
      results.push({
        key: `se-${se.id}`,
        rank,
        label: se.name,
        detail: formatDuration(se.elapsed_time),
        href: `/segments/${se.segment.id}`,
      });
    }
  }

  if (results.length === 0) return null;
  results.sort((a, b) => a.rank - b.rank);

  return (
    <ul className="space-y-1.5">
      {results.map((r) => {
        const medal = MEDAL[r.rank];
        const row = (
          <div className="flex items-center justify-between gap-3 py-1.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                style={{color: medal.color, background: medalBg(medal.color)}}
              >
                {medal.label}
              </span>
              <span className="text-sm text-[var(--text)] truncate">{r.label}</span>
            </div>
            <span className="text-xs tabular-nums text-[var(--dim)] flex-shrink-0">{r.detail}</span>
          </div>
        );
        return (
          <li key={r.key}>
            {r.href ? (
              <Link href={r.href} className="block rounded-lg px-2 -mx-2 hover:bg-[var(--color-surface-1)] transition-colors">
                {row}
              </Link>
            ) : (
              <div className="px-2 -mx-2">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ─── Runs on this route — pace progression ─────────────────────────────────────

export function RunsOnRouteCard({matches}: {matches: RouteMatch[]}) {
  if (!matches || matches.length < 2) return null;

  const paces = matches.map((m) => m.activity.avgPace).filter((p) => p > 0);
  const fastest = Math.min(...paces);
  const slowest = Math.max(...paces);
  const range = slowest - fastest || 1;

  return (
    <ul className="space-y-1">
      {matches.map((m) => {
        const a = m.activity;
        const frac = a.avgPace > 0 ? 1 - (a.avgPace - fastest) / range : 0;
        const width = 30 + frac * 70;
        return (
          <li key={a.id}>
            <Link
              href={`/activities/${a.id}`}
              className={`flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-lg transition-colors ${
                m.isCurrent ? 'bg-[var(--color-surface-1)]' : 'hover:bg-[var(--color-surface-1)]'
              }`}
            >
              <span className="text-[11px] text-[var(--faint)] tabular-nums w-[68px] flex-shrink-0">
                {new Date(a.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: '2-digit'})}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--color-surface-1)] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{width: `${width}%`, background: m.isFastest ? COLORS.green : 'var(--faint)'}}
                />
              </div>
              <span className="text-xs tabular-nums text-[var(--text)] w-[58px] text-right flex-shrink-0">
                {a.avgPace > 0 ? `${formatPace(a.avgPace)}/km` : '—'}
              </span>
              {m.isFastest && (
                <span className="text-[9px] font-bold uppercase tracking-wide flex-shrink-0" style={{color: COLORS.green}}>
                  PR
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
