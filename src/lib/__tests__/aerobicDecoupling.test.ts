import {describe, it, expect} from 'vitest';
import {computeDecoupling} from '../aerobicDecoupling';
import type {StreamPoint} from '../activityModel';

/**
 * Build a StreamPoint array from simple descriptors.
 * Distance is computed cumulatively so varying velocities produce
 * physically consistent distance/grade values.
 */
function makeStream(
  points: Array<{time: number; velocity: number; heartrate: number; altitude?: number}>,
): StreamPoint[] {
  let cumDist = 0;
  return points.map((p, i) => {
    const pt: StreamPoint = {
      time: p.time,
      velocity: p.velocity,
      heartrate: p.heartrate,
      altitude: p.altitude ?? 0,
      distance: cumDist,
    };
    if (i < points.length - 1) {
      const dt = points[i + 1].time - p.time;
      cumDist += p.velocity * Math.max(0, dt);
    }
    return pt;
  });
}

describe('computeDecoupling', () => {
  it('returns null for streams shorter than 45 min', () => {
    const short = makeStream([
      {time: 0,    velocity: 3, heartrate: 140},
      {time: 2640, velocity: 3, heartrate: 140}, // 44 min
    ]);
    expect(computeDecoupling(short)).toBeNull();
  });

  it('returns null for an empty stream', () => {
    expect(computeDecoupling([])).toBeNull();
  });

  it('returns ~0% for a perfectly steady flat run (no drift)', () => {
    // Constant HR, velocity, flat — both halves identical
    const pts = Array.from({length: 100}, (_, i) => ({
      time: i * 36,
      velocity: 3.5,
      heartrate: 150,
    }));
    const result = computeDecoupling(makeStream(pts));
    expect(result).not.toBeNull();
    expect(Math.abs(result!)).toBeLessThan(0.5);
  });

  it('returns positive % when HR rises in second half (decoupled)', () => {
    // 1st half: HR=140, vel=3.5  →  ratio = 3.5/140 = 0.025
    // 2nd half: HR=160, vel=3.5  →  ratio = 3.5/160 = 0.021875
    // decoupling ≈ (0.025 − 0.021875) / 0.025 × 100 = 12.5%
    const first  = Array.from({length: 50}, (_, i) => ({time: i * 36,        velocity: 3.5, heartrate: 140}));
    const second = Array.from({length: 50}, (_, i) => ({time: (50 + i) * 36, velocity: 3.5, heartrate: 160}));
    const result = computeDecoupling(makeStream([...first, ...second]));
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(0);
    expect(result!).toBeCloseTo(12.5, 0);
  });

  it('returns negative % when HR drops in second half (improving efficiency)', () => {
    const first  = Array.from({length: 50}, (_, i) => ({time: i * 36,        velocity: 3.5, heartrate: 160}));
    const second = Array.from({length: 50}, (_, i) => ({time: (50 + i) * 36, velocity: 3.5, heartrate: 140}));
    const result = computeDecoupling(makeStream([...first, ...second]));
    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(0);
  });

  it('returns null when there is no HR data', () => {
    const pts = Array.from({length: 100}, (_, i) => ({
      time: i * 36,
      velocity: 3.5,
      heartrate: 0,
    }));
    expect(computeDecoupling(makeStream(pts))).toBeNull();
  });

  // ── Grade-Adjusted Pace (GAP) ────────────────────────────────────────────────

  it('normalises terrain: uphill first half then flat second half at equal effort → ~0% decoupling', () => {
    // An athlete runs at constant perceived effort throughout:
    //   - First half : 10% grade, velocity = 3.5 m/s  (high actual speed)
    //   - Second half: flat,      velocity = 3.5 / 1.33 ≈ 2.632 m/s (same GAP effort)
    // HR stays constant at 140 bpm in both halves.
    //
    // Without GAP the raw Pa:Hr ratios would differ (3.5/140 ≠ 2.632/140).
    // With GAP both halves have the same adjusted velocity → decoupling ≈ 0%.

    const STEP  = 36;               // seconds per point
    const GRADE = 0.10;             // 10%
    const VEL   = 3.5;              // m/s, uphill
    const GAP_F = 1 + GRADE * 100 * 0.033; // ≈ 1.33
    const VEL_FLAT = VEL / GAP_F;   // ≈ 2.632 — same GAP on flat
    const ALT_STEP = VEL * STEP * GRADE; // metres gained per uphill point

    const first  = Array.from({length: 50}, (_, i) => ({
      time:      i * STEP,
      velocity:  VEL,
      heartrate: 140,
      altitude:  i * ALT_STEP,
    }));
    const peakAlt = (50 - 1) * ALT_STEP;
    const second = Array.from({length: 50}, (_, i) => ({
      time:      (50 + i) * STEP,
      velocity:  VEL_FLAT,
      heartrate: 140,
      altitude:  peakAlt, // flat
    }));

    const result = computeDecoupling(makeStream([...first, ...second]));
    expect(result).not.toBeNull();
    // Grade-adjusted both halves produce the same efficiency ratio → near zero
    expect(Math.abs(result!)).toBeLessThan(3);
  });

  it('still detects true cardiac drift on a hilly route', () => {
    // Same uphill/flat split, but HR rises in the second (flat) half — genuine drift.
    const STEP  = 36;
    const GRADE = 0.10;
    const VEL   = 3.5;
    const GAP_F = 1 + GRADE * 100 * 0.033;
    const VEL_FLAT = VEL / GAP_F;
    const ALT_STEP = VEL * STEP * GRADE;

    const first  = Array.from({length: 50}, (_, i) => ({
      time: i * STEP, velocity: VEL, heartrate: 140, altitude: i * ALT_STEP,
    }));
    const peakAlt = (50 - 1) * ALT_STEP;
    const second = Array.from({length: 50}, (_, i) => ({
      time: (50 + i) * STEP, velocity: VEL_FLAT, heartrate: 160, altitude: peakAlt,
    }));

    const result = computeDecoupling(makeStream([...first, ...second]));
    expect(result).not.toBeNull();
    // HR rose in second half despite same GAP effort → positive decoupling
    expect(result!).toBeGreaterThan(5);
  });
});
