import type {StreamPoint} from './activityModel';

const MIN_DURATION_SECS = 45 * 60;
const MIN_VELOCITY = 0.5; // m/s — filter stopped/paused points

// Grade-Adjusted Pace (GAP) — Strava-style linear model.
// Coefficient applied to grade expressed as percentage: 1% grade ≈ 3.3% extra effort.
const GAP_COEFF = 0.033;

// GAP factor is floored at 1.0: we only adjust uphill segments.
//
// Why no downhill adjustment: on descents gravity gives free speed that does not
// reflect aerobic effort. Dividing velocity by gapFactor < 1 amplifies it —
// a 10% descent gives gapFactor ≈ 0.67, making adjVelocity ≈ 1.49× raw.
// On a run with a big climb in the first half and fast descent in the second,
// this produces readings like -111%, meaningless for aerobic assessment.
const MIN_GAP_FACTOR = 1.0; // uphill-only adjustment; descents use raw velocity
const MAX_GAP_FACTOR = 2.5;

// Clamp grade to ±40% to absorb GPS altitude spikes.
const MAX_GRADE_FRACTION = 0.40;

// Altitude smoothing radius (points). GPS altitude has ±3–5 m noise;
// a 5-point moving average (radius 2) removes most spurious grade spikes.
const ALT_SMOOTH_RADIUS = 2;

// If the mean grade of the two halves differs by more than this threshold
// (as a fraction, e.g. 0.04 = 4%), the route is terrain-asymmetric and a
// first-half vs second-half comparison is structurally unreliable.
// Typical case: uphill out-leg, downhill return leg.
const ASYMMETRY_THRESHOLD = 0.04;

// ── Result type ───────────────────────────────────────────────────────────────

export type DecouplingReason =
  | 'ok'
  | 'too_short'   // run < 45 min elapsed time
  | 'no_hr'       // missing or insufficient HR / velocity data
  | 'asymmetric'; // terrain structure between halves is too different

export type DecouplingResult =
  | {value: number; reason: 'ok'}
  | {value: null; reason: Exclude<DecouplingReason, 'ok'>};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Computes aerobic decoupling (Pa:Hr coupling) for a run.
 *
 * Algorithm:
 *  1. Smooth GPS altitude to reduce noise.
 *  2. For each valid stream point, compute grade from the smoothed altitude
 *     gradient and convert raw velocity to grade-adjusted (flat-ground
 *     equivalent) velocity for uphill segments:
 *       adj_vel = vel / max(1, 1 + grade_pct × 0.033)
 *     Downhill segments keep raw velocity (no amplification).
 *  3. Check terrain symmetry: if the mean grade of the two halves differs
 *     by > 4%, return {value: null, reason: 'asymmetric'} — the route
 *     structure prevents a fair comparison.
 *  4. Split the valid points in half; compute mean GAP/HR efficiency ratio
 *     for each half.
 *  5. Decoupling % = (ratio_1st − ratio_2nd) / ratio_1st × 100.
 *     Positive → HR drifted up relative to effort (cardiac fatigue / heat).
 *
 * Returns a DecouplingResult with a typed reason for any null outcome so the
 * UI can show a specific explanation.
 */
export function computeDecoupling(stream: StreamPoint[]): DecouplingResult {
  if (stream.length === 0) return {value: null, reason: 'no_hr'};

  const elapsedSecs = stream[stream.length - 1].time - stream[0].time;
  if (elapsedSecs < MIN_DURATION_SECS) return {value: null, reason: 'too_short'};

  const smoothedAlt = smoothAltitudes(stream);

  const valid: {adjVelocity: number; heartrate: number; grade: number}[] = [];

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

    valid.push({adjVelocity: p.velocity / gapFactor, heartrate: p.heartrate, grade});
  }

  if (valid.length < 20) return {value: null, reason: 'no_hr'};

  const mid = Math.floor(valid.length / 2);
  const first = valid.slice(0, mid);
  const second = valid.slice(mid);

  // Terrain asymmetry check.
  // If one half is predominantly uphill and the other downhill, any Pa:Hr
  // comparison is dominated by terrain, not aerobic state.
  const avgGrade1 = first.reduce((s, p) => s + p.grade, 0) / first.length;
  const avgGrade2 = second.reduce((s, p) => s + p.grade, 0) / second.length;
  if (Math.abs(avgGrade1 - avgGrade2) > ASYMMETRY_THRESHOLD) {
    return {value: null, reason: 'asymmetric'};
  }

  const avgRatio = (pts: typeof valid) => {
    const n = pts.length;
    const sumAdj = pts.reduce((s, p) => s + p.adjVelocity, 0);
    const sumHr = pts.reduce((s, p) => s + p.heartrate, 0);
    const avgHr = sumHr / n;
    return avgHr > 0 ? (sumAdj / n) / avgHr : 0;
  };

  const ratio1 = avgRatio(first);
  const ratio2 = avgRatio(second);

  if (ratio1 <= 0) return {value: null, reason: 'no_hr'};

  return {
    value: Number((((ratio1 - ratio2) / ratio1) * 100).toFixed(1)),
    reason: 'ok',
  };
}
