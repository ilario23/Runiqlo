'use client';

import {useState} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {motion, type Variants} from 'framer-motion';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useSettings} from '@/contexts/SettingsContext';
import {useAthleteStats, useAthleteGear} from '@/hooks/useStrava';
import {formatDuration, ZONE_COLORS, ZONE_NAMES} from '@/lib/activityModel';
import type {StravaActivityTotal} from '@/lib/strava';
import type {UserSettings} from '@/lib/activityModel';
import AppHeader from '@/components/AppHeader';

// ─── constants ────────────────────────────────────────────────────────────────

const cardVariant: Variants = {
  hidden: {opacity: 0, y: 16},
  show: {opacity: 1, y: 0, transition: {duration: 0.3, ease: 'easeOut'}},
};
const containerVariant: Variants = {
  show: {transition: {staggerChildren: 0.07}},
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function Skeleton({className = ''}: {className?: string}) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.06] ${className}`} />;
}

function fmtKm(meters: number) {
  return (meters / 1000).toLocaleString('en-US', {maximumFractionDigits: 0});
}

function fmtHrs(seconds: number) {
  return (seconds / 3600).toLocaleString('en-US', {maximumFractionDigits: 0});
}

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
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-3">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background: color}} />
        <span className="text-xs font-medium text-white/60 uppercase tracking-wide">{label}</span>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      ) : totals && totals.count > 0 ? (
        <div className="space-y-2">
          <div>
            <p className="text-xl font-bold tabular-nums tracking-tight text-white">{fmtKm(totals.distance)}</p>
            <p className="text-[11px] text-white/35">km</p>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div>
              <p className="text-sm font-semibold tabular-nums text-white/70">{totals.count}</p>
              <p className="text-[10px] text-white/30">runs</p>
            </div>
            <div>
              <p className="text-sm font-semibold tabular-nums text-white/70">{fmtHrs(totals.moving_time)}</p>
              <p className="text-[10px] text-white/30">hrs</p>
            </div>
            <div>
              <p className="text-sm font-semibold tabular-nums text-white/70">{Math.round(totals.elevation_gain / 1000).toLocaleString()}</p>
              <p className="text-[10px] text-white/30">km ↑</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-white/25">—</p>
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
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#0a84ff]/20 text-[#0a84ff] font-medium flex-shrink-0">
              Primary
            </span>
          )}
          {isRetired && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.06] text-white/30 flex-shrink-0">
              Retired
            </span>
          )}
        </div>
        <p className="text-[11px] text-white/35 mt-0.5">
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
  const {settings, updateSettings} = useSettings();
  const {data: stats, isLoading: statsLoading} = useAthleteStats();
  const {data: gear, isLoading: gearLoading} = useAthleteGear();

  const [editingZones, setEditingZones] = useState(false);
  const [zoneDraft, setZoneDraft] = useState<UserSettings>(settings);

  const startZoneEdit = () => { setZoneDraft(settings); setEditingZones(true); };
  const cancelZoneEdit = () => setEditingZones(false);
  const saveZones = () => { updateSettings(zoneDraft); setEditingZones(false); };

  const setZoneBound = (zKey: keyof UserSettings['zones'], idx: 0 | 1, val: number) => {
    setZoneDraft(d => ({
      ...d,
      zones: {
        ...d.zones,
        [zKey]: idx === 0 ? [val, d.zones[zKey][1]] : [d.zones[zKey][0], val],
      },
    }));
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-[#0a84ff] animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !athlete) {
    return (
      <>
        <AppHeader />
        <div className="pt-[72px] flex items-center justify-center min-h-screen">
          <Link href="/settings" className="text-[#0a84ff] text-sm">Connect Strava →</Link>
        </div>
      </>
    );
  }

  const retiredIds = new Set(gear?.retiredGearIds ?? []);

  return (
    <>
      <AppHeader athleteName={`${athlete.firstname} ${athlete.lastname}`} />
      <main className="pt-[72px] pb-8 px-5 min-h-screen">
        <div className="max-w-[900px] mx-auto space-y-4">

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
                  <div className="w-16 h-16 rounded-2xl bg-[#0a84ff]/20 flex items-center justify-center text-[#0a84ff] font-bold text-xl flex-shrink-0">
                    {athlete.firstname[0]}{athlete.lastname[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold tracking-tight text-white">
                    {athlete.firstname} {athlete.lastname}
                  </h2>
                  <p className="text-sm text-white/40 mt-0.5">@{athlete.username}</p>
                  {(athlete.city || athlete.country) && (
                    <p className="text-sm text-white/35 mt-1 flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                      {[athlete.city, athlete.state, athlete.country].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  <span className="text-xs bg-[#30d158]/15 text-[#30d158] px-3 py-1 rounded-full font-medium">
                    Connected
                  </span>
                </div>
              </div>
            </motion.div>

            {/* YTD Stats */}
            <motion.div variants={cardVariant} className="bento-card p-6">
              <h3 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-5">Year to Date</h3>
              <div className="flex gap-6 divide-x divide-white/[0.06]">
                <SportStats label="Run" color="#30d158" totals={stats?.ytd_run_totals} isLoading={statsLoading} />
                <div className="pl-6">
                  <SportStats label="Ride" color="#0a84ff" totals={stats?.ytd_ride_totals} isLoading={statsLoading} />
                </div>
                <div className="pl-6">
                  <SportStats label="Swim" color="#bf5af2" totals={stats?.ytd_swim_totals} isLoading={statsLoading} />
                </div>
              </div>
            </motion.div>

            {/* All-time Stats */}
            <motion.div variants={cardVariant} className="bento-card p-6">
              <h3 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-5">All Time</h3>
              <div className="flex gap-6 divide-x divide-white/[0.06]">
                <SportStats label="Run" color="#30d158" totals={stats?.all_run_totals} isLoading={statsLoading} />
                <div className="pl-6">
                  <SportStats label="Ride" color="#0a84ff" totals={stats?.all_ride_totals} isLoading={statsLoading} />
                </div>
                <div className="pl-6">
                  <SportStats label="Swim" color="#bf5af2" totals={stats?.all_swim_totals} isLoading={statsLoading} />
                </div>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Gear */}
              <motion.div variants={cardVariant} className="bento-card p-5">
                <h3 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-3">Gear</h3>
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

              {/* Zone Configuration */}
              <motion.div variants={cardVariant} className="bento-card p-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-medium text-white/40 uppercase tracking-wide">Heart Rate Zones</h3>
                  {editingZones ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={cancelZoneEdit}
                        className="text-[11px] text-white/30 hover:text-white/50 transition-colors px-2 py-0.5"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveZones}
                        className="text-[11px] bg-[#0a84ff] text-white font-medium px-2.5 py-0.5 rounded-md hover:bg-[#0a84ff]/85 transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={startZoneEdit}
                      className="text-[10px] text-white/30 hover:text-white/60 transition-colors flex items-center gap-1"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                      Edit
                    </button>
                  )}
                </div>

                {/* Max HR + Resting HR — editable */}
                {editingZones && (
                  <div className="flex gap-3 mb-4 pb-4 border-b border-white/[0.06]">
                    {([
                      {label: 'Max HR', field: 'maxHr' as const, min: 100, max: 220},
                      {label: 'Resting HR', field: 'restingHr' as const, min: 30, max: 100},
                    ] as const).map(({label, field, min, max}) => (
                      <div key={field} className="flex-1 bg-white/[0.04] rounded-xl p-3">
                        <p className="text-[10px] text-white/35 uppercase tracking-wide mb-1.5">{label}</p>
                        <div className="flex items-baseline gap-1">
                          <input
                            type="number"
                            value={zoneDraft[field]}
                            onChange={e => setZoneDraft(d => ({...d, [field]: Number(e.target.value)}))}
                            className="w-14 bg-transparent border-b border-white/20 focus:border-[#0a84ff] text-base font-bold text-white tabular-nums focus:outline-none transition-colors"
                            min={min} max={max}
                          />
                          <span className="text-[11px] text-white/30">bpm</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Zone rows */}
                <div className="space-y-2.5">
                  {([1, 2, 3, 4, 5, 6] as const).map((z) => {
                    const zKey = `z${z}` as keyof UserSettings['zones'];
                    const data = editingZones ? zoneDraft.zones : settings.zones;
                    const [lo, hi] = data[zKey];
                    const color = ZONE_COLORS[z];
                    const maxHr = editingZones ? zoneDraft.maxHr : settings.maxHr;
                    return (
                      <div key={z} className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background: color}} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-white/60 font-medium flex-shrink-0">Z{z} · {ZONE_NAMES[z]}</span>
                            {editingZones ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={lo}
                                  onChange={e => setZoneBound(zKey, 0, Number(e.target.value))}
                                  className="w-12 bg-white/[0.06] border border-white/10 rounded-md px-1.5 py-0.5 text-[11px] text-white tabular-nums text-right focus:outline-none focus:border-[#0a84ff]/50 transition-colors"
                                />
                                <span className="text-[10px] text-white/25">–</span>
                                <input
                                  type="number"
                                  value={hi}
                                  onChange={e => setZoneBound(zKey, 1, Number(e.target.value))}
                                  className="w-12 bg-white/[0.06] border border-white/10 rounded-md px-1.5 py-0.5 text-[11px] text-white tabular-nums text-right focus:outline-none focus:border-[#0a84ff]/50 transition-colors"
                                />
                                <span className="text-[10px] text-white/25 ml-0.5">bpm</span>
                              </div>
                            ) : (
                              <span className="text-[11px] font-semibold tabular-nums" style={{color}}>
                                {lo}–{hi} bpm
                              </span>
                            )}
                          </div>
                          <div className="mt-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                background: color,
                                width: `${Math.min(100, ((hi - 60) / (maxHr - 60)) * 100)}%`,
                                opacity: 0.65,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer: max/resting HR (view mode only) */}
                {!editingZones && (
                  <div className="mt-4 pt-3 border-t border-white/[0.05] flex items-center justify-between text-[11px] text-white/30">
                    <span>Max HR: <span className="text-white/50 font-medium">{settings.maxHr} bpm</span></span>
                    <span>Resting: <span className="text-white/50 font-medium">{settings.restingHr} bpm</span></span>
                  </div>
                )}
              </motion.div>
            </div>

            {/* Recent stats summary */}
            <motion.div variants={cardVariant} className="bento-card p-5">
              <h3 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-4">Recent (4 weeks)</h3>
              <div className="grid grid-cols-3 gap-4">
                {[
                  {label: 'Run', color: '#30d158', totals: stats?.recent_run_totals},
                  {label: 'Ride', color: '#0a84ff', totals: stats?.recent_ride_totals},
                  {label: 'Swim', color: '#bf5af2', totals: stats?.recent_swim_totals},
                ].map(({label, color, totals}) => (
                  <div key={label} className="bento-card px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{background: color}} />
                      <span className="text-[10px] font-medium text-white/40 uppercase tracking-wide">{label}</span>
                    </div>
                    {statsLoading ? (
                      <Skeleton className="h-5 w-16" />
                    ) : totals && totals.count > 0 ? (
                      <>
                        <p className="text-lg font-bold tabular-nums tracking-tight text-white">{fmtKm(totals.distance)}</p>
                        <p className="text-[10px] text-white/30 mt-0.5">{totals.count} activit{totals.count === 1 ? 'y' : 'ies'} · {formatDuration(totals.moving_time)}</p>
                      </>
                    ) : (
                      <p className="text-sm text-white/25">—</p>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>

          </motion.div>
        </div>
      </main>
    </>
  );
}
