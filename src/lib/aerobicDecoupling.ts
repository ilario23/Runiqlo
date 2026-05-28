import type {StreamPoint} from './activityModel';

const MIN_DURATION_SECS = 45 * 60;
const MIN_VELOCITY = 0.5; // m/s — filter out stopped/paused points

/**
 * Computes aerobic decoupling (Pa:Hr coupling) for a run.
 *
 * Splits the activity in half by valid-point count, computes the
 * pace-to-HR efficiency ratio (velocity / HR) in each half, then returns:
 *   decoupling % = (ratio_1st - ratio_2nd) / ratio_1st × 100
 *
 * Positive → HR drifted up relative to pace (aerobically decoupled).
 * < 5% → strong aerobic base; 5–8% → acceptable; > 8% → decoupled.
 *
 * Returns null when the activity is too short or lacks HR/velocity data.
 */
export function computeDecoupling(stream: StreamPoint[]): number | null {
  if (stream.length === 0) return null;

  const elapsedSecs = stream[stream.length - 1].time - stream[0].time;
  if (elapsedSecs < MIN_DURATION_SECS) return null;

  const valid = stream.filter((p) => p.heartrate > 0 && p.velocity >= MIN_VELOCITY);
  if (valid.length < 20) return null;

  const mid = Math.floor(valid.length / 2);
  const first = valid.slice(0, mid);
  const second = valid.slice(mid);

  const avgRatio = (pts: StreamPoint[]) => {
    const sumVel = pts.reduce((s, p) => s + p.velocity, 0);
    const sumHr = pts.reduce((s, p) => s + p.heartrate, 0);
    const n = pts.length;
    const avgVel = sumVel / n;
    const avgHr = sumHr / n;
    return avgHr > 0 ? avgVel / avgHr : 0;
  };

  const ratio1 = avgRatio(first);
  const ratio2 = avgRatio(second);

  if (ratio1 <= 0) return null;

  return Number((((ratio1 - ratio2) / ratio1) * 100).toFixed(1));
}
