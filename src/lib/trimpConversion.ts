export type ConvertibleSport = 'cycling' | 'swim' | 'walk' | 'hike';

const CORRECTION: Record<ConvertibleSport, number> = {
  cycling: 0.92,
  swim: 0.88,
  walk: 0.95,
  hike: 0.94,
};

const IMPACT: Record<ConvertibleSport, number> = {
  cycling: 0.90,
  swim: 0.80,
  walk: 0.95,
  hike: 0.90,
};

// Fraction of HR reserve for each convertible run type.
// Quality work (tempo_run, interval_run) is intentionally excluded: cross-sport
// swaps match total load (TRIMP), not the specific stress (lactate clearance,
// running economy), which can't be reproduced by walking/cycling longer.
const ZONE_FRACTION: Record<string, number | null> = {
  recovery_run: 0.60,
  easy_run: 0.68,
  long_run: 0.70,
};

// Run types eligible for cross-sport conversion at all — aerobic base only.
export const CONVERTIBLE_RUN_TYPES: ReadonlySet<string> = new Set(
  Object.keys(ZONE_FRACTION),
);

// Per-sport eligibility. Walk/hike can't carry a long-run aerobic load without
// inflating to an absurd duration (e.g. 90-min long run → 2h+ walk), so they're
// restricted to the lowest-intensity sessions. Bike/swim cover all aerobic types.
const SPORT_ELIGIBLE_RUN_TYPES: Record<ConvertibleSport, ReadonlySet<string>> = {
  cycling: new Set(['recovery_run', 'easy_run', 'long_run']),
  swim: new Set(['recovery_run', 'easy_run', 'long_run']),
  walk: new Set(['recovery_run', 'easy_run']),
  hike: new Set(['recovery_run', 'easy_run']),
};

const K = 1.92;

export function convertSession(
  workoutType: string,
  durationMin: number,
  maxHr: number,
  restHr: number,
  targetSport: ConvertibleSport,
): number | null {
  const fraction = ZONE_FRACTION[workoutType];
  if (fraction == null || durationMin <= 0) return null;
  if (!SPORT_ELIGIBLE_RUN_TYPES[targetSport].has(workoutType)) return null;

  const deltaHR = fraction;
  const trimpRun = durationMin * deltaHR * Math.exp(K * deltaHR);
  const deltaHRTarget = deltaHR * CORRECTION[targetSport];
  const adjustedTRIMP = trimpRun / IMPACT[targetSport];
  const durationTarget = adjustedTRIMP / (deltaHRTarget * Math.exp(K * deltaHRTarget));

  return Math.round(durationTarget);
}
