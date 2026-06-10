export const DISTANCE_METERS_MAP: Record<string, number> = {
  '400m': 400, '1k': 1000, '1 mile': 1609, '2 mile': 3219,
  '5k': 5000, '10k': 10000, '15k': 15000, '10 mile': 16093,
  '20k': 20000, 'half-marathon': 21097, 'marathon': 42195,
};

/** Daniels VDOT from race distance + time. Returns null for distances <1500m. */
export function calcVdot(distanceM: number, timeSec: number): number | null {
  if (distanceM < 1500 || timeSec <= 0) return null;
  const v = (distanceM / timeSec) * 60; // m/min
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const t = timeSec / 60; // minutes
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  return Math.round((vo2 / pct) * 10) / 10;
}

export type VdotConfidence = 'fresh' | 'stale' | 'very_stale';

export interface VdotEstimate {
  vdot: number;
  distance: string;
  date: string;
  effortAgeDays: number;
  confidence: VdotConfidence;
}

const VDOT_PRIORITY = ['marathon', 'half-marathon', '10k', '5k', '10 mile', '15k', '20k'];

export function calcPrimaryVdot(
  bests: Record<string, {timeSeconds: number; date: string; activityId: number}>
): VdotEstimate | null {
  const today = new Date().toISOString().slice(0, 10);
  let best: VdotEstimate | null = null;

  for (const d of VDOT_PRIORITY) {
    const b = bests[d];
    if (!b) continue;
    const distanceM = DISTANCE_METERS_MAP[d.toLowerCase()];
    if (!distanceM) continue;
    const vdot = calcVdot(distanceM, b.timeSeconds);
    if (vdot == null) continue;
    const effortAgeDays = Math.round((Date.parse(today) - Date.parse(b.date)) / 86400000);
    const confidence: VdotConfidence = effortAgeDays < 60 ? 'fresh' : effortAgeDays < 180 ? 'stale' : 'very_stale';
    if (!best || confidence === 'fresh') {
      best = {vdot, distance: d, date: b.date, effortAgeDays, confidence};
    }
    if (confidence === 'fresh') break;
  }

  return best;
}
