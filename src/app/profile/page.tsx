'use client';

import {useState} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {motion, type Variants} from 'framer-motion';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useAthleteStats, useAthleteGear} from '@/hooks/useStrava';
import {COLORS} from '@/lib/activityModel';
import {Skeleton} from '@/components/ui/skeleton';
import type {StravaActivityTotal, StravaAthleteStats} from '@/lib/strava';
import AppHeader from '@/components/AppHeader';
import AthleteNotesCard from '@/components/AthleteNotesCard';

// ─── animation ────────────────────────────────────────────────────────────────

const cardVariant: Variants = {
  hidden: {opacity: 0},
  show: {opacity: 1, transition: {duration: 0.35, ease: 'easeOut'}},
};
const containerVariant: Variants = {
  show: {transition: {staggerChildren: 0.08}},
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtKm(meters: number) {
  return (meters / 1000).toLocaleString('en-US', {maximumFractionDigits: 0});
}

function fmtHrs(seconds: number) {
  return (seconds / 3600).toLocaleString('en-US', {maximumFractionDigits: 0});
}

const STATS_PERIODS = [
  {key: 'ytd', short: 'YTD'},
  {key: 'alltime', short: 'All time'},
  {key: 'recent', short: '4 weeks'},
] as const;

type StatsPeriod = typeof STATS_PERIODS[number]['key'];

const PERIOD_KEYS = {
  ytd:     {run: 'ytd_run_totals',    ride: 'ytd_ride_totals',    swim: 'ytd_swim_totals'},
  alltime: {run: 'all_run_totals',    ride: 'all_ride_totals',    swim: 'all_swim_totals'},
  recent:  {run: 'recent_run_totals', ride: 'recent_ride_totals', swim: 'recent_swim_totals'},
} as const satisfies Record<StatsPeriod, Record<'run'|'ride'|'swim', keyof StravaAthleteStats>>;

// ─── Sport stat column ────────────────────────────────────────────────────────

function SportStats({
  label,
  color,
  totals,
  isLoading,
}: {
  label: string;
  color: string;
  totals: StravaActivityTotal | undefined;
  isLoading: boolean;
}) {
  const activityLabel = label === 'Run' ? 'runs' : label === 'Ride' ? 'rides' : 'swims';
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background: color}} />
        <span className="text-[10px] font-semibold text-white/35 uppercase tracking-widest">{label}</span>
      </div>
      {isLoading ? (
        <div className="space-y-2.5">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      ) : totals && totals.count > 0 ? (
        <>
          <p className="text-3xl font-mono font-bold tabular-nums tracking-tight text-white leading-none mb-1">
            {fmtKm(totals.distance)}
          </p>
          <p className="text-[10px] text-white/25 uppercase tracking-wide mb-4">km</p>
          <div className="space-y-1 text-[11px]">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono font-semibold tabular-nums text-white/55">{totals.count}</span>
              <span className="text-white/25">{activityLabel}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono font-semibold tabular-nums text-white/55">{fmtHrs(totals.moving_time)}</span>
              <span className="text-white/25">hrs</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono font-semibold tabular-nums text-white/55">
                {Math.round(totals.elevation_gain / 1000).toLocaleString()}
              </span>
              <span className="text-white/25">km elev</span>
            </div>
          </div>
        </>
      ) : (
        <p className="text-3xl font-mono font-bold text-white/10 leading-none">—</p>
      )}
    </div>
  );
}

// ─── Gear item ────────────────────────────────────────────────────────────────

function GearItem({
  name,
  distanceM,
  isPrimary,
  isRetired,
  icon,
}: {
  name: string;
  distanceM: number;
  isPrimary: boolean;
  isRetired: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className={`flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors ${
      isRetired ? 'opacity-35' : 'hover:bg-[var(--color-surface-1)]'
    }`}>
      <div className="w-9 h-9 rounded-xl bg-[var(--color-surface-1)] flex items-center justify-center flex-shrink-0 text-white/40">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white/80 truncate">{name}</p>
          {isPrimary && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--color-accent-dim)] text-[var(--color-accent)] font-medium flex-shrink-0">
              Primary
            </span>
          )}
          {isRetired && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--color-surface-1)] text-white/25 flex-shrink-0">
              Retired
            </span>
          )}
        </div>
        <p className="text-[11px] text-white/35 mt-0.5 font-mono tabular-nums">
          {fmtKm(distanceM)} km
        </p>
      </div>
    </div>
  );
}

const BikeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="6" cy="15" r="4" /><circle cx="18" cy="15" r="4" />
    <path d="M6 15l4-8h4l2 4M10 7l4 8M14 7h3l1 4" />
  </svg>
);

const ShoeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 14l4-4 2 2 5-5 4 3v4H3z" /><path d="M3 14v3h15v-3" />
  </svg>
);

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const {isAuthenticated, isLoading: authLoading, athlete} = useStravaAuth();
  const {data: stats, isLoading: statsLoading} = useAthleteStats();
  const {data: gear, isLoading: gearLoading} = useAthleteGear();
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('ytd');

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{background: 'var(--color-base)'}}>
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !athlete) {
    return (
      <>
        <AppHeader />
        <div className="pt-[72px] flex items-center justify-center min-h-screen">
          <Link href="/settings" className="text-sm hover:opacity-75 transition-opacity" style={{color: 'var(--color-accent)'}}>
            Connect Strava →
          </Link>
        </div>
      </>
    );
  }

  const retiredIds = new Set(gear?.retiredGearIds ?? []);

  const ytdKm = !stats ? null : fmtKm(
    (stats.ytd_run_totals?.distance ?? 0) +
    (stats.ytd_ride_totals?.distance ?? 0) +
    (stats.ytd_swim_totals?.distance ?? 0),
  );
  const ytdCount = !stats ? 0 :
    (stats.ytd_run_totals?.count ?? 0) +
    (stats.ytd_ride_totals?.count ?? 0) +
    (stats.ytd_swim_totals?.count ?? 0);

  const location = [athlete.city, athlete.country].filter(Boolean).join(', ');

  return (
    <>
      <AppHeader />
      <main className="pt-14 pb-12 min-h-screen" style={{background: 'var(--color-base)'}}>
        <div className="max-w-[760px] mx-auto px-5">
          <motion.div variants={containerVariant} initial="hidden" animate="show" className="space-y-4">

            {/* ── Athlete stage — open, no card wrapper ─────────────────── */}
            <motion.section variants={cardVariant} className="pt-8 pb-7 border-b border-[var(--color-border)]">
              <div className="flex items-start gap-6">

                {/* Avatar */}
                {athlete.profile_medium ? (
                  <div className="w-20 h-20 md:w-[88px] md:h-[88px] rounded-2xl overflow-hidden flex-shrink-0 ring-1 ring-white/[0.10]">
                    <Image
                      src={athlete.profile_medium}
                      alt={`${athlete.firstname} ${athlete.lastname}`}
                      width={88} height={88}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 md:w-[88px] md:h-[88px] rounded-2xl bg-[var(--color-surface-1)] flex items-center justify-center text-white/50 font-bold text-2xl flex-shrink-0 ring-1 ring-white/[0.08]">
                    {athlete.firstname[0]}{athlete.lastname[0]}
                  </div>
                )}

                {/* Identity + hero stat */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h1 className="text-[26px] md:text-[32px] font-bold tracking-tight leading-none">
                        <span className="text-white">{athlete.firstname} </span>
                        <span style={{color: 'rgba(255,255,255,0.4)'}} className="font-medium">{athlete.lastname}</span>
                      </h1>
                      <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                        {athlete.username && (
                          <span className="text-[11px] text-white/30">@{athlete.username}</span>
                        )}
                        {location && (
                          <>
                            <span className="text-white/15 text-xs select-none">·</span>
                            <span className="text-[11px] text-white/30">{location}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Connected indicator */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 mt-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent-green" />
                      <span className="text-[10px] font-medium text-white/30 uppercase tracking-wide hidden sm:block">Connected</span>
                    </div>
                  </div>

                  {/* YTD hero number */}
                  <div className="mt-6">
                    {statsLoading ? (
                      <Skeleton className="h-11 w-32" />
                    ) : ytdKm ? (
                      <div className="flex items-baseline gap-3">
                        <span
                          className="font-mono font-bold tabular-nums tracking-tight text-white leading-none"
                          style={{fontSize: 'clamp(2.4rem, 5vw, 3.2rem)'}}
                        >
                          {ytdKm}
                        </span>
                        <div className="flex flex-col gap-0.5 pb-1">
                          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest leading-none">
                            km this year
                          </span>
                          {ytdCount > 0 && (
                            <span className="text-[10px] text-white/18 tabular-nums">{ytdCount} activities</span>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </motion.section>

            {/* ── Sport breakdown ──────────────────────────────────────────── */}
            <motion.div variants={cardVariant} className="surface-card p-6">
              <div className="flex items-center justify-between mb-6">
                <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">By sport</span>
                <div className="flex items-center border-b border-[var(--color-border)]">
                  {STATS_PERIODS.map(p => (
                    <button
                      key={p.key}
                      onClick={() => setStatsPeriod(p.key)}
                      className={`cursor-pointer px-3 pb-2 text-[11px] font-medium transition-colors border-b-2 -mb-px ${
                        statsPeriod === p.key
                          ? 'text-white border-[var(--color-accent)]'
                          : 'text-white/30 hover:text-white/55 border-transparent'
                      }`}
                    >
                      {p.short}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-[var(--color-border)]">
                {([
                  {label: 'Run',  color: COLORS.green,  sport: 'run'  as const},
                  {label: 'Ride', color: COLORS.blue,   sport: 'ride' as const},
                  {label: 'Swim', color: COLORS.purple, sport: 'swim' as const},
                ] as const).map(({label, color, sport}, idx) => (
                  <div key={sport} className={idx === 0 ? 'pr-6' : idx === 2 ? 'pl-6' : 'px-6'}>
                    <SportStats
                      label={label}
                      color={color}
                      totals={stats?.[PERIOD_KEYS[statsPeriod][sport]]}
                      isLoading={statsLoading}
                    />
                  </div>
                ))}
              </div>
            </motion.div>

            {/* ── Gear ─────────────────────────────────────────────────────── */}
            <motion.div variants={cardVariant} className="surface-card p-4">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-1 px-1">Gear</p>
              {gearLoading ? (
                <div className="space-y-1 mt-2">
                  {Array.from({length: 3}).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 py-2.5 px-3">
                      <Skeleton className="w-9 h-9 rounded-xl" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-2/3" />
                        <Skeleton className="h-2.5 w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : !gear || (gear.bikes.length === 0 && gear.shoes.length === 0) ? (
                <p className="text-sm text-white/20 py-3 px-3">No gear linked</p>
              ) : (
                <div className="mt-1">
                  {gear.bikes.length > 0 && (
                    <div className={gear.shoes.length > 0 ? 'mb-2 pb-2 border-b border-[var(--color-border)]' : ''}>
                      <p className="text-[9px] font-semibold text-white/18 uppercase tracking-wider mb-1 px-3">Bikes</p>
                      {[...gear.bikes].sort((a, b) => b.distance - a.distance).map(bike => (
                        <GearItem
                          key={bike.id}
                          name={bike.name}
                          distanceM={bike.distance}
                          isPrimary={bike.primary}
                          isRetired={retiredIds.has(bike.id)}
                          icon={<BikeIcon />}
                        />
                      ))}
                    </div>
                  )}
                  {gear.shoes.length > 0 && (
                    <div>
                      <p className="text-[9px] font-semibold text-white/18 uppercase tracking-wider mb-1 px-3">Shoes</p>
                      {[...gear.shoes].sort((a, b) => b.distance - a.distance).map(shoe => (
                        <GearItem
                          key={shoe.id}
                          name={shoe.name}
                          distanceM={shoe.distance}
                          isPrimary={shoe.primary}
                          isRetired={retiredIds.has(shoe.id)}
                          icon={<ShoeIcon />}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>

            {/* ── Athlete notes ─────────────────────────────────────────── */}
            <motion.div variants={cardVariant}>
              <AthleteNotesCard />
            </motion.div>

          </motion.div>
        </div>
      </main>
    </>
  );
}
