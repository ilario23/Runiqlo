import type {StreamPoint} from './activityModel';

const MIN_DURATION_SECS = 45 * 60;
const MIN_VELOCITY = 0.5; // m/s — filter stopped/paused points

// Grade-Adjusted Pace (GAP) — Strava-style linear model.
// Coefficient is per percent grade: 1% grade ≈ 3.3% extra effort.
const GAP_COEFF = 0.033; // applied to grade expressed as percentage (grade_fraction × 100)

// Clamp grade to ±40% and gapFactor to [0.5, 2.5] to absorb GPS altitude noise
// and handle extreme terrain without producing wild adjustments.
const MAX_GRADE_FRACTION = 0.40;
const MIN_GAP_FACTOR = 0.5;
const MAX_GAP_FACTOR = 2.5;

// Altitude smoothing radius (points). GPS altitude has ±3–5 m noise;
// a 5-point moving average (radius 2) removes most spurious grade spikes.
const ALT_SMOOTH_RADIUS = 2;

/**
 * Returns a smoothed altitude array using a symmetric moving average.
 * Reduces GPS altitude noise before grade is derived.
 */
function smoothAltitudes(stream: StreamPoint[]): number[] {
  return stream.map((_, i) => {
    const lo = Math.max(0, i - ALT_SMOOTH_RADIUS);
    const hi = Math.min(stream.length - 1, i + ALT_SMOOTH_RADIUS);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += stream[j].altitude;
    return sum / (hi - lo + 1);
  });
}

/**
 * Computes aerobic decoupling (Pa:Hr coupling) for a run,
 * adjusted for grade via Grade-Adjusted Pace (GAP).
 *
 * Algorithm:
 *  1. Smooth GPS altitude to reduce noise.
 *  2. For each valid stream point, compute grade from the smoothed altitude
 *     gradient and convert raw velocity to grade-adjusted (flat-ground
 *     equivalent) velocity: adj_vel = vel / (1 + grade_pct × 0.033).
 *  3. Split the valid points in half and compute the mean GAP/HR efficiency
 *     ratio for each half.
 *  4. Decoupling % = (ratio_1st − ratio_2nd) / ratio_1st × 100.
 *     Positive → HR drifted up relative to effort across the run.
 *
 * Grade adjustment means hilly routes are treated fairly: an out-and-back
 * with a climb in the first half and descent in the second will no longer
 * produce misleading decoupling readings.
 *
 * Thresholds: < 5% well-coupled; 5–8% mild; > 8% high decoupling.
 *
 * Returns null for runs < 45 min or lacking HR/velocity data.
 */
export function computeDecoupling(stream: StreamPoint[]): number | null {
  if (stream.length === 0) return null;

  const elapsedSecs = stream[stream.length - 1].time - stream[0].time;
  if (elapsedSecs < MIN_DURATION_SECS) return null;

  const smoothedAlt = smoothAltitudes(stream);

  const valid: {adjVelocity: number; heartrate: number}[] = [];

  for (let i = 0; i < stream.length - 1; i++) {
    const p = stream[i];
    if (p.heartrate <= 0 || p.velocity < MIN_VELOCITY) continue;

    const dDist = stream[i + 1].distance - p.distance;
    const dAlt = smoothedAlt[i + 1] - smoothedAlt[i];

    // Require at least 0.5 m between points to compute a meaningful grade
    const grade =
      dDist > 0.5
        ? Math.max(-MAX_GRADE_FRACTION, Math.min(MAX_GRADE_FRACTION, dAlt / dDist))
        : 0;

    const grade_pct = grade * 100;
    const gapFactor = Math.max(
      MIN_GAP_FACTOR,
      Math.min(MAX_GAP_FACTOR, 1 + grade_pct * GAP_COEFF),
    );

    valid.push({adjVelocity: p.velocity / gapFactor, heartrate: p.heartrate});
  }

  if (valid.length < 20) return null;

  const mid = Math.floor(valid.length / 2);
  const first = valid.slice(0, mid);
  const second = valid.slice(mid);

  const avgRatio = (pts: typeof valid) => {
    const n = pts.length;
    const sumAdj = pts.reduce((s, p) => s + p.adjVelocity, 0);
    const sumHr = pts.reduce((s, p) => s + p.heartrate, 0);
    const avgHr = sumHr / n;
    return avgHr > 0 ? (sumAdj / n) / avgHr : 0;
  };

  const ratio1 = avgRatio(first);
  const ratio2 = avgRatio(second);

  if (ratio1 <= 0) return null;

  return Number((((ratio1 - ratio2) / ratio1) * 100).toFixed(1));
}
