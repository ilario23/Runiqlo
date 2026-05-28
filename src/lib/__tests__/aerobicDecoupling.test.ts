import {describe, it, expect} from 'vitest';
import {computeDecoupling} from '../aerobicDecoupling';
import type {StreamPoint} from '../activityModel';

function makeStream(
  points: Array<{time: number; velocity: number; heartrate: number}>,
): StreamPoint[] {
  return points.map((p) => ({
    ...p,
    distance: p.time * p.velocity,
    altitude: 0,
  }));
}

describe('computeDecoupling', () => {
  it('returns null for streams shorter than 45 min', () => {
    const stream = makeStream([
      {time: 0, velocity: 3, heartrate: 140},
      {time: 2700, velocity: 3, heartrate: 140}, // 45 min exactly — boundary
    ]);
    // elapsed = 2700, which is exactly MIN so it should still compute
    // Let's use 44 min
    const short = makeStream([
      {time: 0, velocity: 3, heartrate: 140},
      {time: 2640, velocity: 3, heartrate: 140}, // 44 min
    ]);
    expect(computeDecoupling(short)).toBeNull();
  });

  it('returns null for empty stream', () => {
    expect(computeDecoupling([])).toBeNull();
  });

  it('returns ~0% for a perfectly steady run (no drift)', () => {
    // Constant HR and velocity throughout — 60 min
    const pts = Array.from({length: 100}, (_, i) => ({
      time: i * 36, // 36s steps → 3600s total
      velocity: 3.5,
      heartrate: 150,
    }));
    const result = computeDecoupling(makeStream(pts));
    expect(result).not.toBeNull();
    expect(Math.abs(result!)).toBeLessThan(0.5);
  });

  it('returns positive % when HR rises in second half (decoupled)', () => {
    // First half: HR=140, velocity=3.5 → ratio = 3.5/140 = 0.025
    // Second half: HR=160, velocity=3.5 → ratio = 3.5/160 = 0.021875
    // decoupling = (0.025 - 0.021875) / 0.025 * 100 = 12.5%
    const first = Array.from({length: 50}, (_, i) => ({
      time: i * 36,
      velocity: 3.5,
      heartrate: 140,
    }));
    const second = Array.from({length: 50}, (_, i) => ({
      time: 1800 + i * 36,
      velocity: 3.5,
      heartrate: 160,
    }));
    const stream = makeStream([...first, ...second]);
    const result = computeDecoupling(stream);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(0);
    expect(result!).toBeCloseTo(12.5, 0);
  });

  it('returns negative % when HR drops in second half (improved efficiency)', () => {
    const first = Array.from({length: 50}, (_, i) => ({
      time: i * 36,
      velocity: 3.5,
      heartrate: 160,
    }));
    const second = Array.from({length: 50}, (_, i) => ({
      time: 1800 + i * 36,
      velocity: 3.5,
      heartrate: 140,
    }));
    const stream = makeStream([...first, ...second]);
    const result = computeDecoupling(stream);
    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(0);
  });

  it('returns null for stream with no valid HR points', () => {
    const pts = Array.from({length: 100}, (_, i) => ({
      time: i * 36,
      velocity: 3.5,
      heartrate: 0, // no HR
    }));
    expect(computeDecoupling(makeStream(pts))).toBeNull();
  });
});
