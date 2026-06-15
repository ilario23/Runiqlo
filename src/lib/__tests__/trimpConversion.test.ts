import {describe, it, expect} from 'vitest';
import {convertSession, CONVERTIBLE_RUN_TYPES} from '../trimpConversion';

const MAX_HR = 190;
const REST_HR = 50;

describe('CONVERTIBLE_RUN_TYPES', () => {
  it('includes only aerobic base run types', () => {
    expect([...CONVERTIBLE_RUN_TYPES].sort()).toEqual([
      'easy_run',
      'long_run',
      'recovery_run',
    ]);
  });

  it('excludes quality work', () => {
    expect(CONVERTIBLE_RUN_TYPES.has('tempo_run')).toBe(false);
    expect(CONVERTIBLE_RUN_TYPES.has('interval_run')).toBe(false);
  });
});

describe('convertSession', () => {
  it('returns null for quality sessions on every sport', () => {
    for (const sport of ['cycling', 'swim', 'walk', 'hike'] as const) {
      expect(convertSession('tempo_run', 60, MAX_HR, REST_HR, sport)).toBeNull();
      expect(convertSession('interval_run', 60, MAX_HR, REST_HR, sport)).toBeNull();
    }
  });

  it('converts aerobic runs to bike/swim', () => {
    for (const type of ['recovery_run', 'easy_run', 'long_run'] as const) {
      expect(convertSession(type, 60, MAX_HR, REST_HR, 'cycling')).toBeGreaterThan(0);
      expect(convertSession(type, 60, MAX_HR, REST_HR, 'swim')).toBeGreaterThan(0);
    }
  });

  it('restricts walk/hike to the lowest-intensity sessions', () => {
    // allowed
    expect(convertSession('recovery_run', 60, MAX_HR, REST_HR, 'walk')).toBeGreaterThan(0);
    expect(convertSession('easy_run', 60, MAX_HR, REST_HR, 'hike')).toBeGreaterThan(0);
    // long run cannot be carried by walking/hiking
    expect(convertSession('long_run', 90, MAX_HR, REST_HR, 'walk')).toBeNull();
    expect(convertSession('long_run', 90, MAX_HR, REST_HR, 'hike')).toBeNull();
  });

  it('returns null for non-positive duration', () => {
    expect(convertSession('easy_run', 0, MAX_HR, REST_HR, 'cycling')).toBeNull();
    expect(convertSession('easy_run', -5, MAX_HR, REST_HR, 'cycling')).toBeNull();
  });
});
