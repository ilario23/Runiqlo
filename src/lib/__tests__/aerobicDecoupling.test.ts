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
  it('returns too_short for streams shorter than 45 min', () => {
    const short = makeStream([
      {time: 0,    velocity: 3, heartrate: 140},
      {time: 2640, velocity: 3, heartrate: 140}, // 44 min
    ]);
    const r = computeDecoupling(short);
    expect(r.value).toBeNull();
    expect(r.reason).toBe('too_short');
  });

  it('returns no_hr for an empty stream', () => {
    const r = computeDecoupling([]);
    expect(r.value).toBeNull();
    expect(r.reason).toBe('no_hr');
  });

  it('returns ~0% for a perfectly steady flat run (no drift)', () => {
    // Constant HR, velocity, flat — both halves identical
    const pts = Array.from({length: 100}, (_, i) => ({
      time: i * 36,
      velocity: 3.5,
      heartrate: 150,
    }));
    const r = computeDecoupling(makeStream(pts));
    expect(r.value).not.toBeNull();
    expect(r.reason).toBe('ok');
    expect(Math.abs(r.value!)).toBeLessThan(0.5);
  });

  it('returns positive % when HR rises in second half (decoupled)', () => {
    // 1st half: HR=140, vel=3.5  →  ratio = 3.5/140 = 0.025
    // 2nd half: HR=160, vel=3.5  →  ratio = 3.5/160 = 0.021875
    // decoupling ≈ (0.025 − 0.021875) / 0.025 × 100 = 12.5%
    const first  = Array.from({length: 50}, (_, i) => ({time: i * 36,        velocity: 3.5, heartrate: 140}));
    const second = Array.from({length: 50}, (_, i) => ({time: (50 + i) * 36, velocity: 3.5, heartrate: 160}));
    const r = computeDecoupling(makeStream([...first, ...second]));
    expect(r.value).not.toBeNull();
    expect(r.reason).toBe('ok');
    expect(r.value!).toBeGreaterThan(0);
    expect(r.value!).toBeCloseTo(12.5, 0);
  });

  it('returns negative % when HR drops in second half (improving efficiency)', () => {
    const first  = Array.from({length: 50}, (_, i) => ({time: i * 36,        velocity: 3.5, heartrate: 160}));
    const second = Array.from({length: 50}, (_, i) => ({time: (50 + i) * 36, velocity: 3.5, heartrate: 140}));
    const r = computeDecoupling(makeStream([...first, ...second]));
    expect(r.value).not.toBeNull();
    expect(r.value!).toBeLessThan(0);
  });

  it('returns no_hr when there is no HR data', () => {
    const pts = Array.from({length: 100}, (_, i) => ({
      time: i * 36,
      velocity: 3.5,
      heartrate: 0,
    }));
    const r = computeDecoupling(makeStream(pts));
    expect(r.value).toBeNull();
    expect(r.reason).toBe('no_hr');
  });

  // ── Grade-Adjusted Pace (GAP) & terrain asymmetry ───────────────────────────

  it('returns asymmetric for strongly asymmetric terrain (uphill first, descent second)', () => {
    // Classic problem case: long climb out, fast descent back.
    // avgGrade(first half) >> 0 and avgGrade(second half) << 0 → asymmetry detected.
    const STEP   = 36;
    const GRADE  = 0.10;
    const VEL    = 3.5;
    const ALT_UP = VEL * STEP * GRADE;

    const peakAlt = (50 - 1) * ALT_UP;
    const first  = Array.from({length: 50}, (_, i) => ({
      time: i * STEP, velocity: VEL, heartrate: 140, altitude: i * ALT_UP,
    }));
    const second = Array.from({length: 50}, (_, i) => ({
      time: (50 + i) * STEP, velocity: VEL * 1.2, heartrate: 140,
      altitude: peakAlt - i * ALT_UP,
    }));

    const r = computeDecoupling(makeStream([...first, ...second]));
    expect(r.value).toBeNull();
    expect(r.reason).toBe('asymmetric');
  });

  it('returns ~0% for symmetric rolling terrain at constant effort', () => {
    // Both halves have the same proportion of uphills and downhills.
    // Constant velocity and HR → no cardiac drift → decoupling ≈ 0%.
    //
    // Altitude follows a sine wave with period 20 points so each 50-point
    // half contains 2.5 identical cycles → avgGrade ≈ 0 in both halves.
    const AMP    = 15;
    const PERIOD = 20;
    const STEP   = 36;

    const pts = Array.from({length: 100}, (_, i) => ({
      time:      i * STEP,
      velocity:  3.5,
      heartrate: 150,
      altitude:  AMP * Math.sin((2 * Math.PI * i) / PERIOD),
    }));

    const r = computeDecoupling(makeStream(pts));
    expect(r.value).not.toBeNull();
    expect(r.reason).toBe('ok');
    expect(Math.abs(r.value!)).toBeLessThan(3);
  });

  it('detects genuine cardiac drift on symmetric rolling terrain', () => {
    // Same rolling terrain in both halves, but HR rises in the second half.
    // The terrain symmetry check passes; the HR difference is real.
    const AMP    = 15;
    const PERIOD = 20;
    const STEP   = 36;

    const first  = Array.from({length: 50}, (_, i) => ({
      time: i * STEP, velocity: 3.5, heartrate: 140,
      altitude: AMP * Math.sin((2 * Math.PI * i) / PERIOD),
    }));
    const second = Array.from({length: 50}, (_, i) => ({
      time: (50 + i) * STEP, velocity: 3.5, heartrate: 160,
      altitude: AMP * Math.sin((2 * Math.PI * i) / PERIOD),
    }));

    const r = computeDecoupling(makeStream([...first, ...second]));
    expect(r.value).not.toBeNull();
    expect(r.reason).toBe('ok');
    expect(r.value!).toBeGreaterThan(5);
  });
});
