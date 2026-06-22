import {describe, it, expect} from 'vitest';
import {computeKmSplits, downsampleStream} from '../activityDataTiers';
import type {StreamPoint} from '../activityModel';

// Build a deterministic 3.5 km run at a constant 5:00 min/km (3.3333 m/s), one
// point per second. HR steps 140 → 150 → 160 across the first three kilometres;
// a short dropout (hr = 0) in km 1 exercises the HR-exclusion path. Flat course.
function buildStream(): StreamPoint[] {
  const mPerSec = 1000 / 300; // 5:00/km
  const steps = 1050; // 1050 s → exactly 3500 m
  const pts: StreamPoint[] = [];
  for (let k = 0; k <= steps; k++) {
    const dist = k * mPerSec;
    const baseHr = dist < 1000 ? 140 : dist < 2000 ? 150 : 160;
    const hr = k >= 10 && k <= 14 ? 0 : baseHr; // dropout in km 1
    pts.push({time: k, distance: dist, velocity: mPerSec, heartrate: hr, altitude: 0});
  }
  return pts;
}

describe('computeKmSplits', () => {
  const splits = computeKmSplits(buildStream());

  it('produces one bucket per kilometre plus a trailing partial', () => {
    expect(splits.map(s => s.km)).toEqual([1, 2, 3, 4]);
    expect(splits[0].distanceKm).toBeCloseTo(1, 2);
    expect(splits[3].distanceKm).toBeCloseTo(0.5, 2); // final partial km
  });

  it('computes constant pace across splits', () => {
    for (const s of splits) expect(s.paceMinPerKm).toBeCloseTo(5, 2);
  });

  it('averages HR per km, excluding zero readings', () => {
    expect(splits[0].avgHr).toBe(140); // dropout points ignored, not counted as 0
    expect(splits[1].avgHr).toBe(150);
    expect(splits[2].avgHr).toBe(160);
  });

  it('reports zero elevation gain on a flat course', () => {
    for (const s of splits) expect(s.elevGainM).toBe(0);
  });

  it('skips pause gaps longer than 60s', () => {
    const stream: StreamPoint[] = [
      {time: 0, distance: 0, velocity: 3, heartrate: 150, altitude: 0},
      {time: 10, distance: 30, velocity: 3, heartrate: 150, altitude: 0},
      // 5-minute stationary pause — must not inflate duration/distance
      {time: 310, distance: 30, velocity: 0, heartrate: 150, altitude: 0},
      {time: 320, distance: 60, velocity: 3, heartrate: 150, altitude: 0},
    ];
    const [km1] = computeKmSplits(stream);
    expect(km1.durationSec).toBe(20); // two 10s intervals, the 300s gap dropped
  });

  it('sums only positive altitude deltas as elevation gain', () => {
    const stream: StreamPoint[] = [
      {time: 0, distance: 0, velocity: 3, heartrate: 150, altitude: 100},
      {time: 10, distance: 30, velocity: 3, heartrate: 150, altitude: 110}, // +10
      {time: 20, distance: 60, velocity: 3, heartrate: 150, altitude: 105}, // -5 ignored
      {time: 30, distance: 90, velocity: 3, heartrate: 150, altitude: 115}, // +10
    ];
    expect(computeKmSplits(stream)[0].elevGainM).toBe(20);
  });
});

describe('downsampleStream', () => {
  it('caps output at maxPoints and keeps first/last points', () => {
    const stream = buildStream();
    const samples = downsampleStream(stream, 50);
    expect(samples.length).toBeLessThanOrEqual(50);
    expect(samples[0].distanceKm).toBe(0);
    expect(samples[samples.length - 1].distanceKm).toBeCloseTo(3.5, 2);
  });

  it('produces monotonically increasing distance', () => {
    const samples = downsampleStream(buildStream(), 50);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].distanceKm).toBeGreaterThanOrEqual(samples[i - 1].distanceKm);
    }
  });

  it('derives pace from velocity', () => {
    const samples = downsampleStream(buildStream(), 50);
    expect(samples[10].paceMinPerKm).toBeCloseTo(5, 2);
  });

  it('returns every point unchanged when already small enough', () => {
    const stream = buildStream().slice(0, 20);
    expect(downsampleStream(stream, 50)).toHaveLength(20);
  });
});
