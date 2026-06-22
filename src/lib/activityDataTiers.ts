// Tiered views over a single activity's HR/pace/elevation stream, used by the
// coach's getActivityData tool for progressive-disclosure analysis:
//   Tier 2 -> computeKmSplits   (per-kilometer pace / HR / elevation)
//   Tier 3 -> downsampleStream  (bounded set of high-resolution samples)
// Both are pure functions over StreamPoint[] so they can be unit-tested in
// isolation. They mirror the consecutive-point iteration in zoneCompute.ts:
// pauses (dt <= 0 or dt > 60s) are skipped, and HR is averaged only over points
// with a positive reading.

import type {StreamPoint} from './activityModel';

export interface KmSplit {
  /** 1-based kilometre index; the final entry may be a partial kilometre. */
  km: number;
  /** Actual distance covered in this bucket (km) — ~1.0 except the last split. */
  distanceKm: number;
  durationSec: number;
  /** Decimal minutes per km. 0 when the bucket covered no distance. */
  paceMinPerKm: number;
  /** Time-weighted average HR, or null when no HR was recorded in the bucket. */
  avgHr: number | null;
  elevGainM: number;
}

export interface StreamSample {
  timeSec: number;
  distanceKm: number;
  /** Decimal minutes per km derived from the smoothed velocity at this point. */
  paceMinPerKm: number;
  hr: number | null;
  altitudeM: number;
}

const round = (n: number, dp = 0): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

interface KmBucket {
  durationSec: number;
  distanceKm: number;
  hrTime: number; // seconds with a valid HR reading
  hrWeighted: number; // sum of hr * dt over those seconds
  elevGainM: number;
}

/**
 * Group a stream into per-kilometre splits. Each consecutive-point interval is
 * attributed to the kilometre bucket of its starting distance, so the trailing
 * partial kilometre lands in its own (shorter) bucket.
 */
export function computeKmSplits(stream: StreamPoint[]): KmSplit[] {
  const buckets = new Map<number, KmBucket>();

  for (let i = 0; i < stream.length - 1; i++) {
    const cur = stream[i];
    const next = stream[i + 1];

    const dt = next.time - cur.time;
    if (dt <= 0 || dt > 60) continue; // skip pauses / gaps

    const dd = Math.max(0, (next.distance - cur.distance) / 1000); // km
    const bucketIdx = Math.floor(cur.distance / 1000);

    let bucket = buckets.get(bucketIdx);
    if (!bucket) {
      bucket = {durationSec: 0, distanceKm: 0, hrTime: 0, hrWeighted: 0, elevGainM: 0};
      buckets.set(bucketIdx, bucket);
    }

    bucket.durationSec += dt;
    bucket.distanceKm += dd;
    if (cur.heartrate > 0) {
      bucket.hrTime += dt;
      bucket.hrWeighted += cur.heartrate * dt;
    }
    const da = next.altitude - cur.altitude;
    if (da > 0) bucket.elevGainM += da;
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, b]) => ({
      km: idx + 1,
      distanceKm: round(b.distanceKm, 2),
      durationSec: round(b.durationSec),
      paceMinPerKm: b.distanceKm > 0 ? round(b.durationSec / 60 / b.distanceKm, 2) : 0,
      avgHr: b.hrTime > 0 ? round(b.hrWeighted / b.hrTime) : null,
      elevGainM: round(b.elevGainM),
    }));
}

/**
 * Evenly sample the stream down to at most `maxPoints` points (always including
 * the first and last), so Tier 3 has a predictable token cost regardless of run
 * length. Returns every point unchanged when the stream is already small enough.
 */
export function downsampleStream(stream: StreamPoint[], maxPoints = 50): StreamSample[] {
  const toSample = (p: StreamPoint): StreamSample => ({
    timeSec: round(p.time),
    distanceKm: round(p.distance / 1000, 2),
    paceMinPerKm: p.velocity > 0 ? round(1000 / p.velocity / 60, 2) : 0,
    hr: p.heartrate > 0 ? round(p.heartrate) : null,
    altitudeM: round(p.altitude),
  });

  if (stream.length <= maxPoints) return stream.map(toSample);

  const step = (stream.length - 1) / (maxPoints - 1);
  const out: StreamSample[] = [];
  let lastIdx = -1;
  for (let k = 0; k < maxPoints; k++) {
    const idx = Math.round(k * step);
    if (idx === lastIdx) continue; // guard against duplicate indices
    lastIdx = idx;
    out.push(toSample(stream[idx]));
  }
  return out;
}
