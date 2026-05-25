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

// Fraction of HR reserve for each convertible run type
const ZONE_FRACTION: Record<string, number | null> = {
  recovery_run: 0.60,
  easy_run: 0.68,
  long_run: 0.70,
  tempo_run: 0.82,
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

  const deltaHR = fraction;
  const trimpRun = durationMin * deltaHR * Math.exp(K * deltaHR);
  const deltaHRTarget = deltaHR * CORRECTION[targetSport];
  const adjustedTRIMP = trimpRun / IMPACT[targetSport];
  const durationTarget = adjustedTRIMP / (deltaHRTarget * Math.exp(K * deltaHRTarget));

  return Math.round(durationTarget);
}
