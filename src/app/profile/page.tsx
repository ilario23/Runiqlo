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

// ─── constants ────────────────────────────────────────────────────────────────

const cardVariant: Variants = {
  hidden: {opacity: 0, y: 16},
  show: {opacity: 1, y: 0, transition: {duration: 0.3, ease: 'easeOut'}},
};
const containerVariant: Variants = {
  show: {transition: {staggerChildren: 0.07}},
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
  {key: 'alltime', short: 'All Time'},
  {key: 'recent', short: '4 Weeks'},
] as const;

type StatsPeriod = typeof STATS_PERIODS[number]['key'];

const PERIOD_KEYS = {
  ytd:     {run: 'ytd_run_totals',    ride: 'ytd_ride_totals',    swim: 'ytd_swim_totals'},
  alltime: {run: 'all_run_totals',    ride: 'all_ride_totals',    swim: 'all_swim_totals'},
  recent:  {run: 'recent_run_totals', ride: 'recent_ride_totals', swim: 'recent_swim_totals'},
} as const satisfies Record<StatsPeriod, Record<'run'|'ride'|'swim', keyof StravaAthleteStats>>;

// ─── Stat columns ─────────────────────────────────────────────────────────────

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
        <span className="text-[11px] font-medium text-white/45 uppercase tracking-widest">{label}</span>
      </div>
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      ) : totals && totals.count > 0 ? (
        <>
          <div className="mb-3">
            <p className="text-2xl font-mono font-bold tabular-nums tracking-tight text-white leading-none">
              {fmtKm(totals.distance)}
            </p>
            <p className="text-[11px] text-white/35 mt-1.5">km total</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
            <span className="text-white/50">
              <span className="font-mono font-semibold tabular-nums text-white/70">{totals.count}</span>
              {' '}{activityLabel}
            </span>
            <span className="text-white/20">·</span>
            <span className="text-white/50">
              <span className="font-mono font-semibold tabular-nums text-white/70">{fmtHrs(totals.moving_time)}</span>
              {' '}hrs
            </span>
            <span className="text-white/20">·</span>
            <span className="text-white/50">
              <span className="font-mono font-semibold tabular-nums text-white/70">{Math.round(totals.elevation_gain / 1000).toLocaleString()}</span>
              {' '}km ↑
            </span>
          </div>
        </>
      ) : (
        <p className="text-2xl font-mono font-bold text-white/10 leading-none">—</p>
      )}
    </div>
  );
}

// ─── Gear card item ───────────────────────────────────────────────────────────

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
    <div className={`flex items-center gap-3 py-3 px-3 rounded-xl ${isRetired ? 'opacity-40' : 'hover:bg-white/[0.04]'} transition-colors`}>
      <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center flex-shrink-0 text-white/50">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white/80 truncate">{name}</p>
          {isPrimary && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent-blue/20 text-accent-blue font-medium flex-shrink-0">
              Primary
            </span>
          )}
          {isRetired && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.06] text-white/30 flex-shrink-0">
              Retired
            </span>
          )}
        </div>
        <p className="text-[11px] text-white/45 mt-0.5">
          {fmtKm(distanceM)} km
        </p>
      </div>
    </div>
  );
}

const BikeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="6" cy="15" r="4" />
    <circle cx="18" cy="15" r="4" />
    <path d="M6 15l4-8h4l2 4M10 7l4 8M14 7h3l1 4" />
  </svg>
);

const ShoeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 14l4-4 2 2 5-5 4 3v4H3z" />
    <path d="M3 14v3h15v-3" />
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-accent-blue animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !athlete) {
    return (
      <>
        <AppHeader />
        <div className="pt-[72px] flex items-center justify-center min-h-screen">
          <Link href="/settings" className="text-accent-blue text-sm">Connect Strava →</Link>
        </div>
      </>
    );
  }

  const retiredIds = new Set(gear?.retiredGearIds ?? []);

  const ytdKm = !stats ? null : fmtKm(
    (stats.ytd_run_totals?.distance ?? 0) +
    (stats.ytd_ride_totals?.distance ?? 0) +
    (stats.ytd_swim_totals?.distance ?? 0)
  );
  const ytdCount = !stats ? 0 :
    (stats.ytd_run_totals?.count ?? 0) +
    (stats.ytd_ride_totals?.count ?? 0) +
    (stats.ytd_swim_totals?.count ?? 0);

  return (
    <>
      <AppHeader />
      <main className="pt-[72px] pb-8 px-5 min-h-screen">
        <div className="max-w-[1100px] mx-auto space-y-4">

          {/* Page title */}
          <div className="pt-2 pb-1">
            <h1 className="text-xl font-semibold tracking-tight text-white">Profile</h1>
          </div>

          <motion.div variants={containerVariant} initial="hidden" animate="show" className="space-y-4">

            {/* Athlete header */}
            <motion.div variants={cardVariant} className="bento-card p-6">
              <div className="flex items-center gap-5">
                {athlete.profile_medium ? (
                  <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 ring-2 ring-white/[0.08]">
                    <Image
                      src={athlete.profile_medium}
                      alt={`${athlete.firstname} ${athlete.lastname}`}
                      width={64}
                      height={64}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-accent-blue/20 flex items-center justify-center text-accent-blue font-bold text-xl flex-shrink-0">
                    {athlete.firstname[0]}{athlete.lastname[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold tracking-tight text-white">
                    {athlete.firstname} {athlete.lastname}
                  </h2>
                  <p className="text-sm text-white/55 mt-0.5">@{athlete.username}</p>
                  {(athlete.city || athlete.country) && (
                    <p className="text-sm text-white/45 mt-1 flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                      {[athlete.city, athlete.state, athlete.country].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {!statsLoading && ytdCount > 0 && (
                    <p className="text-[11px] text-white/35 mt-2 font-mono tabular-nums">
                      {ytdKm} km · {ytdCount} activities this year
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  <span className="text-xs bg-accent-green/15 text-accent-green px-3 py-1 rounded-full font-medium">
                    Connected
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Unified Stats */}
            <motion.div variants={cardVariant} className="bento-card p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-medium text-white/55 uppercase tracking-wide">Stats</h3>
                <div className="flex items-center bg-white/[0.05] rounded-full p-0.5">
                  {STATS_PERIODS.map(p => (
                    <button
                      key={p.key}
                      onClick={() => setStatsPeriod(p.key)}
                      className={`cursor-pointer px-3.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 ${
                        statsPeriod === p.key
                          ? 'bg-white/[0.15] text-white'
                          : 'text-white/35 hover:text-white/60'
                      }`}
                    >
                      {p.short}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-white/[0.06]">
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

            {/* Gear */}
            <motion.div variants={cardVariant} className="bento-card p-5">
              <h3 className="text-xs font-medium text-white/55 uppercase tracking-wide mb-3">Gear</h3>
              {gearLoading ? (
                <div className="space-y-2">
                  {Array.from({length: 3}).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 py-2">
                      <Skeleton className="w-9 h-9 rounded-xl" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-2/3" />
                        <Skeleton className="h-2.5 w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : !gear || (gear.bikes.length === 0 && gear.shoes.length === 0) ? (
                <p className="text-sm text-white/25 py-4">No gear found</p>
              ) : (
                <div>
                  {gear.bikes.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] font-medium text-white/25 uppercase tracking-wide mb-1 px-1">Bikes</p>
                      {[...gear.bikes]
                        .sort((a, b) => b.distance - a.distance)
                        .map((bike) => (
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
                      <p className="text-[10px] font-medium text-white/25 uppercase tracking-wide mb-1 px-1">Shoes</p>
                      {[...gear.shoes]
                        .sort((a, b) => b.distance - a.distance)
                        .map((shoe) => (
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

            {/* Athlete Notes */}
            <motion.div variants={cardVariant}>
              <AthleteNotesCard />
            </motion.div>

          </motion.div>
        </div>
      </main>
    </>
  );
}
