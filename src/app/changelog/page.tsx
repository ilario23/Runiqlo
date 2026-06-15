'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

type BadgeType = 'FEATURE' | 'FIX' | 'REFACTOR';

const BADGE_STYLES: Record<BadgeType, string> = {
  FEATURE: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  FIX:     'bg-rose-500/15 text-rose-400 border border-rose-500/20',
  REFACTOR:'bg-sky-500/15 text-sky-400 border border-sky-500/20',
};

interface Entry {
  type: BadgeType;
  text: string;
}

interface Release {
  version: string;
  date: string;
  latest?: boolean;
  entries: Entry[];
}

const RELEASES: Release[] = [
  {
    version: '2.1.1',
    date: '13 June 2026',
    latest: true,
    entries: [
      {
        type: 'FEATURE',
        text: 'Coach now knows your VDOT — pace targets in workouts reflect your current fitness, not generic tables.',
      },
      {
        type: 'FEATURE',
        text: 'Coach knowledge upgraded: LT vs VO2max training, carb periodization, OTS detection, masters-aging adjustments, and hill training.',
      },
      {
        type: 'FEATURE',
        text: 'Strava tokens now managed server-side — no more token juggling in the browser, login state survives refreshes reliably.',
      },
      {
        type: 'FIX',
        text: 'Best-effort paces marked stale when data is older than 90 days, so coach avoids anchoring to outdated benchmarks.',
      },
    ],
  },
  {
    version: '2.1.0',
    date: '10 June 2026',
    entries: [
      {
        type: 'FEATURE',
        text: 'New: back up all your data from Settings and restore it on any device — handy safety net before switching phones.',
      },
      {
        type: 'FEATURE',
        text: "When something fails to sync, you'll now see exactly what went wrong with a single tap to retry.",
      },
      {
        type: 'REFACTOR',
        text: 'App launches faster — language files now load in the background instead of blocking startup.',
      },
      {
        type: 'REFACTOR',
        text: 'App installs about 1 MB lighter — heavy features download only when you actually use them.',
      },
      {
        type: 'FIX',
        text: 'Uploading a new profile photo now automatically removes the old one.',
      },
    ],
  },
];

function Badge({ type }: { type: BadgeType }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider ${BADGE_STYLES[type]}`}>
      {type}
    </span>
  );
}

export default function ChangelogPage() {
  return (
    <main className="min-h-screen bg-[var(--color-base)] pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-8">

        {/* Back nav */}
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)] mb-8 transition-colors"
        >
          <ChevronLeft size={16} />
          Settings
        </Link>

        {/* Header */}
        <h1 className="text-3xl font-bold text-[var(--color-ink)] mb-1">Changelog</h1>
        <p className="text-sm text-[var(--color-ink-3)] mb-10">See what&apos;s new in this version</p>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[11px] top-2 bottom-0 w-px bg-[var(--color-surface-2)]" />

          <div className="space-y-10">
            {RELEASES.map((release) => (
              <div key={release.version} className="relative pl-8">
                {/* Dot */}
                <div className="absolute left-0 top-1.5 w-[23px] h-[23px] rounded-full border-2 border-[var(--color-surface-2)] bg-[var(--color-base)] flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-[var(--color-ink-3)]" />
                </div>

                {/* Version header */}
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-xl font-bold text-[var(--color-ink)]">v{release.version}</span>
                  {release.latest && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-500/15 text-violet-400 border border-violet-500/20">
                      Latest
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--color-ink-3)] mb-4">{release.date}</p>

                {/* Entries */}
                <div className="surface-card divide-y divide-[var(--color-surface-2)]">
                  {release.entries.map((entry, i) => (
                    <div key={i} className="flex items-start gap-4 px-5 py-4">
                      <div className="pt-0.5 shrink-0">
                        <Badge type={entry.type} />
                      </div>
                      <p className="text-sm text-[var(--color-ink-2)] leading-relaxed">{entry.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
