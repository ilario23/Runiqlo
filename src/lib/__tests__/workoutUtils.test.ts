import {describe, it, expect} from 'vitest';
import {bpmRangeFromIntensity} from '../workoutUtils';
import type {UserSettings} from '../activityModel';

const zones: UserSettings['zones'] = {
  z1: [90, 114],
  z2: [115, 133],
  z3: [134, 152],
  z4: [153, 167],
  z5: [168, 181],
  z6: [182, 190],
};

describe('bpmRangeFromIntensity', () => {
  it('returns null when zones are missing (the old "1–1 bpm" bug)', () => {
    expect(bpmRangeFromIntensity(60, 82, undefined)).toBeNull();
  });

  it('maps a single-zone band to that zone bpm range', () => {
    // 95–105% LTHR = Z4
    expect(bpmRangeFromIntensity(95, 105, zones)).toEqual({bpmMin: 153, bpmMax: 167});
  });

  it('spans zones using min/max bounds', () => {
    // 60% (Z1) → 82% (Z2): low of Z1, high of Z2
    expect(bpmRangeFromIntensity(60, 82, zones)).toEqual({bpmMin: 90, bpmMax: 133});
  });

  it('clamps below-Z1 intensities into Z1', () => {
    expect(bpmRangeFromIntensity(50, 65, zones)).toEqual({bpmMin: 90, bpmMax: 114});
  });

  it('maps above-Z5 intensities into Z6', () => {
    expect(bpmRangeFromIntensity(121, 130, zones)).toEqual({bpmMin: 182, bpmMax: 190});
  });

  it('normalizes reversed min/max', () => {
    expect(bpmRangeFromIntensity(105, 95, zones)).toEqual({bpmMin: 153, bpmMax: 167});
  });

  it('maps each LTHR band boundary to the correct zone', () => {
    expect(bpmRangeFromIntensity(69, 69, zones)).toEqual({bpmMin: 90, bpmMax: 114}); // Z1
    expect(bpmRangeFromIntensity(70, 70, zones)).toEqual({bpmMin: 115, bpmMax: 133}); // Z2
    expect(bpmRangeFromIntensity(94, 94, zones)).toEqual({bpmMin: 134, bpmMax: 152}); // Z3
    expect(bpmRangeFromIntensity(106, 106, zones)).toEqual({bpmMin: 168, bpmMax: 181}); // Z5
  });
});
