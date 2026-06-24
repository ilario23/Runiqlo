'use client';

import {useState, useEffect} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {motion, type Variants} from 'framer-motion';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useAthleteStats, useAthleteGear} from '@/hooks/useStrava';
import {COLORS} from '@/lib/activityModel';
import {Skeleton} from '@/components/ui/skeleton';
import type {StravaActivityTotal, StravaAthleteStats, StravaSummaryGear} from '@/lib/strava';
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
        <span className="text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest">{label}</span>
      </div>
      {isLoading ? (
        <div className="space-y-2.5">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      ) : totals && totals.count > 0 ? (
        <>
          <p className="text-3xl font-mono font-bold tabular-nums tracking-tight text-[var(--text)] leading-none mb-1">
            {fmtKm(totals.distance)}
          </p>
          <p className="text-[10px] text-[var(--faint)] uppercase tracking-wide mb-4">km</p>
          <div className="space-y-1 text-[11px]">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono font-semibold tabular-nums text-[var(--dim)]">{totals.count}</span>
              <span className="text-[var(--faint)]">{activityLabel}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono font-semibold tabular-nums text-[var(--dim)]">{fmtHrs(totals.moving_time)}</span>
              <span className="text-[var(--faint)]">hrs</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono font-semibold tabular-nums text-[var(--dim)]">
                {Math.round(totals.elevation_gain / 1000).toLocaleString()}
              </span>
              <span className="text-[var(--faint)]">km elev</span>
            </div>
          </div>
        </>
      ) : (
        <p className="text-3xl font-mono font-bold text-[var(--faint)] leading-none">—</p>
      )}
    </div>
  );
}

// ─── Gear thresholds hook ─────────────────────────────────────────────────────

function useGearThresholds(athleteId: number | undefined) {
  const [thresholds, setThresholds] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!athleteId) return;
    fetch(`/api/db/gear-thresholds?athleteId=${athleteId}`)
      .then((r) => r.ok ? r.json() : [])
      .then((rows: Array<{gearId: string; thresholdMeters: number}>) => {
        const map: Record<string, number> = {};
        for (const row of rows) map[row.gearId] = row.thresholdMeters;
        setThresholds(map);
      })
      .catch(() => {});
  }, [athleteId]);

  const saveThreshold = async (gearId: string, thresholdKm: number | null) => {
    if (!athleteId) return;
    const res = await fetch(`/api/gear/${gearId}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({athleteId, thresholdKm}),
    });
    if (res.ok) {
      setThresholds((prev) => {
        if (thresholdKm === null) {
          const next = {...prev};
          delete next[gearId];
          return next;
        }
        return {...prev, [gearId]: Math.round(thresholdKm * 1000)};
      });
    }
  };

  return {thresholds, saveThreshold};
}

// ─── Gear item ────────────────────────────────────────────────────────────────

function GearItem({
  gear,
  isPrimary,
  isRetired,
  icon,
  thresholdMeters,
  onSaveThreshold,
  avgWeeklyMeters,
}: {
  gear: StravaSummaryGear;
  isPrimary: boolean;
  isRetired: boolean;
  icon: React.ReactNode;
  thresholdMeters: number | undefined;
  onSaveThreshold: (thresholdKm: number | null) => void;
  avgWeeklyMeters: number;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');

  const pct = thresholdMeters && thresholdMeters > 0
    ? Math.round((gear.distance / thresholdMeters) * 100)
    : null;

  const barColor = pct == null
    ? 'var(--color-accent)'
    : pct >= 100 ? 'var(--color-accent-red)'
    : pct >= 80 ? 'var(--color-accent-yellow)'
    : 'var(--color-accent-green)';

  const estimatedRetirement = (() => {
    if (!thresholdMeters || avgWeeklyMeters <= 0) return null;
    const remaining = thresholdMeters - gear.distance;
    if (remaining <= 0) return 'Overdue';
    const weeksLeft = remaining / avgWeeklyMeters;
    const d = new Date();
    d.setDate(d.getDate() + Math.round(weeksLeft * 7));
    return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
  })();

  const handleSave = () => {
    const km = parseFloat(inputVal);
    if (!isNaN(km) && km > 0) {
      onSaveThreshold(km);
    }
    setEditing(false);
  };

  return (
    <div className={`py-3 px-3 rounded-xl transition-colors ${isRetired ? 'opacity-35' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[var(--color-surface-1)] flex items-center justify-center flex-shrink-0 text-[var(--faint)]">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-[var(--text)] truncate">{gear.name}</p>
            {isPrimary && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--color-accent-dim)] text-[var(--color-accent)] font-medium flex-shrink-0">
                Primary
              </span>
            )}
            {isRetired && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--color-surface-1)] text-[var(--faint)] flex-shrink-0">
                Retired
              </span>
            )}
            {pct !== null && pct >= 80 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-md font-medium flex-shrink-0"
                style={{background: `${barColor}20`, color: barColor}}
              >
                {pct >= 100 ? 'Replace' : 'Nearing limit'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--faint)] mt-0.5 font-mono tabular-nums">
            {fmtKm(gear.distance)} km
            {thresholdMeters ? ` / ${fmtKm(thresholdMeters)} km limit` : ''}
          </p>
        </div>
        {/* Threshold edit button */}
        {!isRetired && (
          <button
            onClick={() => { setEditing(true); setInputVal(thresholdMeters ? String(Math.round(thresholdMeters / 1000)) : ''); }}
            className="text-[10px] text-[var(--faint)] hover:text-[var(--dim)] transition-colors flex-shrink-0 cursor-pointer"
          >
            {thresholdMeters ? 'Edit limit' : 'Set limit'}
          </button>
        )}
      </div>

      {/* Inline threshold editor */}
      {editing && (
        <div className="flex items-center gap-2 mt-2 ml-12">
          <input
            type="number"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
            placeholder="km limit (e.g. 800)"
            autoFocus
            className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-mono"
            style={{
              background: 'var(--color-surface-1)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-1)',
            }}
          />
          <button onClick={handleSave} className="text-xs px-2.5 py-1.5 rounded-lg font-medium cursor-pointer" style={{background: 'var(--color-accent)', color: 'var(--color-on-accent)'}}>
            Save
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-[var(--faint)] hover:text-[var(--dim)] cursor-pointer transition-colors">
            Cancel
          </button>
        </div>
      )}

      {/* Progress bar */}
      {pct !== null && !isRetired && (
        <div className="mt-2 ml-12">
          <div className="h-1.5 rounded-full bg-[var(--panel)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{width: `${Math.min(pct, 100)}%`, background: barColor}}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] font-mono tabular-nums" style={{color: barColor}}>{pct}% used</span>
            {estimatedRetirement && (
              <span className="text-[10px] text-[var(--faint)]">Est. retire {estimatedRetirement}</span>
            )}
          </div>
        </div>
      )}
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
  const {thresholds, saveThreshold} = useGearThresholds(athlete?.id);
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('ytd');

  const avgWeeklyMeters = (stats?.recent_run_totals?.distance ?? 0) / 4;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{background: 'var(--color-base)'}}>
        <div className="w-5 h-5 rounded-full border-2 border-[var(--line)] border-t-white/60 animate-spin" />
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
      <main className="pt-14 pb-24 md:pb-12 min-h-screen" style={{background: 'var(--color-base)'}}>
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
                  <div className="w-20 h-20 md:w-[88px] md:h-[88px] rounded-2xl bg-[var(--color-surface-1)] flex items-center justify-center text-[var(--dim)] font-bold text-2xl flex-shrink-0 ring-1 ring-white/[0.08]">
                    {athlete.firstname[0]}{athlete.lastname[0]}
                  </div>
                )}

                {/* Identity + hero stat */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h1 className="text-[26px] md:text-[32px] font-bold tracking-tight leading-none">
                        <span className="text-[var(--text)]">{athlete.firstname} </span>
                        <span style={{color: 'rgba(26,24,20,0.4)'}} className="font-medium">{athlete.lastname}</span>
                      </h1>
                      <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                        {athlete.username && (
                          <span className="text-[11px] text-[var(--faint)]">@{athlete.username}</span>
                        )}
                        {location && (
                          <>
                            <span className="text-[var(--faint)] text-xs select-none">·</span>
                            <span className="text-[11px] text-[var(--faint)]">{location}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Connected indicator */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 mt-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent-green" />
                      <span className="text-[10px] font-medium text-[var(--faint)] uppercase tracking-wide hidden sm:block">Connected</span>
                    </div>
                  </div>

                  {/* YTD hero number */}
                  <div className="mt-6">
                    {statsLoading ? (
                      <Skeleton className="h-11 w-32" />
                    ) : ytdKm ? (
                      <div className="flex items-baseline gap-3">
                        <span
                          className="font-mono font-bold tabular-nums tracking-tight text-[var(--text)] leading-none"
                          style={{fontSize: 'clamp(2.4rem, 5vw, 3.2rem)'}}
                        >
                          {ytdKm}
                        </span>
                        <div className="flex flex-col gap-0.5 pb-1">
                          <span className="text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest leading-none">
                            km this year
                          </span>
                          {ytdCount > 0 && (
                            <span className="text-[10px] text-[var(--faint)] tabular-nums">{ytdCount} activities</span>
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
                <span className="text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest">By sport</span>
                <div className="flex items-center border-b border-[var(--color-border)]">
                  {STATS_PERIODS.map(p => (
                    <button
                      key={p.key}
                      onClick={() => setStatsPeriod(p.key)}
                      className={`cursor-pointer px-3 pb-2 text-[11px] font-medium transition-colors border-b-2 -mb-px ${
                        statsPeriod === p.key
                          ? 'text-[var(--text)] border-[var(--color-accent)]'
                          : 'text-[var(--faint)] hover:text-[var(--dim)] border-transparent'
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
              <p className="text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest mb-1 px-1">Gear</p>
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
                <p className="text-sm text-[var(--faint)] py-3 px-3">No gear linked</p>
              ) : (
                <div className="mt-1">
                  {gear.bikes.length > 0 && (
                    <div className={gear.shoes.length > 0 ? 'mb-2 pb-2 border-b border-[var(--color-border)]' : ''}>
                      <p className="text-[9px] font-semibold text-[var(--faint)] uppercase tracking-wider mb-1 px-3">Bikes</p>
                      {[...gear.bikes].sort((a, b) => b.distance - a.distance).map(bike => (
                        <GearItem
                          key={bike.id}
                          gear={bike}
                          isPrimary={bike.primary}
                          isRetired={retiredIds.has(bike.id)}
                          icon={<BikeIcon />}
                          thresholdMeters={thresholds[bike.id]}
                          onSaveThreshold={(km) => saveThreshold(bike.id, km)}
                          avgWeeklyMeters={avgWeeklyMeters}
                        />
                      ))}
                    </div>
                  )}
                  {gear.shoes.length > 0 && (
                    <div>
                      <p className="text-[9px] font-semibold text-[var(--faint)] uppercase tracking-wider mb-1 px-3">Shoes</p>
                      {[...gear.shoes].sort((a, b) => b.distance - a.distance).map(shoe => (
                        <GearItem
                          key={shoe.id}
                          gear={shoe}
                          isPrimary={shoe.primary}
                          isRetired={retiredIds.has(shoe.id)}
                          icon={<ShoeIcon />}
                          thresholdMeters={thresholds[shoe.id]}
                          onSaveThreshold={(km) => saveThreshold(shoe.id, km)}
                          avgWeeklyMeters={avgWeeklyMeters}
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
