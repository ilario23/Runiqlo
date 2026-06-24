// Grade Adjusted Pace (GAP) — Strava exposes GAP in its UI but not via the API,
// so we compute it ourselves from the energy cost of running on a grade.
//
// Cost-of-running model: Minetti et al. (2002) polynomial for metabolic cost
// Cr(i) [J/kg/m] as a function of gradient i (rise/run, decimal). Flat (i=0)
// costs 3.6 J/kg/m. The GAP factor is Cr(i)/Cr(0): >1 uphill (harder than flat),
// <1 downhill (easier). Flat-equivalent speed = actual_speed × factor, so the
// grade-adjusted pace is the actual pace divided by that factor.

const CR_FLAT = 3.6; // Cr(0), J/kg/m

/** Metabolic cost of running at gradient i (decimal rise/run), J/kg/m. */
function costOfRunning(i: number): number {
  // Clamp to the range the polynomial was fitted over (±45%) to avoid blow-up.
  const g = Math.max(-0.45, Math.min(0.45, i));
  return (
    155.4 * g ** 5 -
    30.4 * g ** 4 -
    43.3 * g ** 3 +
    46.3 * g ** 2 +
    19.5 * g +
    CR_FLAT
  );
}

/** GAP multiplier for a gradient: flat-equivalent speed = actual × factor. */
export function gapFactor(gradeDecimal: number): number {
  return costOfRunning(gradeDecimal) / CR_FLAT;
}

/**
 * Grade-adjusted pace for a single segment.
 * @param avgSpeed  average speed over the segment, m/s
 * @param distance  segment distance, m
 * @param elevDiff  net elevation change over the segment, m
 * @returns flat-equivalent pace in min/km, or null if not computable
 */
export function gapForSegment(
  avgSpeed: number,
  distance: number,
  elevDiff: number,
): number | null {
  if (avgSpeed <= 0 || distance <= 0) return null;
  const grade = elevDiff / distance;
  const flatEquivSpeed = avgSpeed * gapFactor(grade); // m/s
  if (flatEquivSpeed <= 0) return null;
  return 1 / (flatEquivSpeed * 60 / 1000); // min/km
}

/**
 * Overall grade-adjusted pace from raw streams. Accumulates flat-equivalent
 * distance point-to-point (using altitude/distance deltas for grade) and
 * divides by total moving time. More accurate than a per-split estimate because
 * it captures within-split terrain.
 * @returns flat-equivalent pace in min/km, or null if insufficient data
 */
export function gapFromStreams(
  streams: {distance: number; altitude: number; velocity: number}[],
): number | null {
  if (!streams || streams.length < 2) return null;

  let flatEquivMeters = 0;
  let movingSecondsApprox = 0;
  let prev = streams[0];

  for (let i = 1; i < streams.length; i++) {
    const cur = streams[i];
    const dDist = cur.distance - prev.distance; // m
    if (dDist > 0) {
      const dElev = (cur.altitude || 0) - (prev.altitude || 0);
      const grade = dElev / dDist;
      flatEquivMeters += dDist * gapFactor(grade);
      // Time for this delta inferred from speed (streams are ~1 Hz but be safe).
      const speed = cur.velocity > 0 ? cur.velocity : prev.velocity;
      if (speed > 0.5) movingSecondsApprox += dDist / speed;
    }
    prev = cur;
  }

  if (flatEquivMeters <= 0 || movingSecondsApprox <= 0) return null;
  const flatEquivSpeed = flatEquivMeters / movingSecondsApprox; // m/s
  return 1 / (flatEquivSpeed * 60 / 1000); // min/km
}
