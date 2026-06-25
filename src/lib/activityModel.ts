export type ActivityType = 'Run' | 'Ride' | 'Hike' | 'Swim';

export interface ActivitySummary {
  id: string;
  name: string;
  date: string;
  type: ActivityType;
  distance: number; // km
  duration: number; // seconds
  avgPace: number; // min/km (decimal)
  avgHr: number;
  maxHr: number;
  elevationGain: number;
  calories: number;
  hasDetailedData: boolean;
  polyline?: string;
}

export interface StreamPoint {
  time: number;
  distance: number;
  velocity: number;
  heartrate: number;
  altitude: number;
  cadence?: number;
  lat?: number;
  lng?: number;
}

export type ThemeMode = 'dark' | 'light';
export type AccentKey = 'lime' | 'amber' | 'cyan' | 'coral' | 'violet';

export interface UserSettings {
  maxHr: number;
  restingHr: number;
  zones: {
    z1: [number, number];
    z2: [number, number];
    z3: [number, number];
    z4: [number, number];
    z5: [number, number];
    z6: [number, number];
  };
  coachModel?: string | null;
  theme?: ThemeMode;
  accent?: AccentKey;
}

export const defaultSettings: UserSettings = {
  maxHr: 190,
  restingHr: 55,
  zones: {
    z1: [90, 114],
    z2: [115, 133],
    z3: [134, 152],
    z4: [153, 167],
    z5: [168, 181],
    z6: [182, 190],
  },
  theme: 'dark',
  accent: 'lime',
};

// Signal-accent presets — mirror ACCENTS in globals/shell. Applied to CSS vars at runtime.
export const ACCENTS: Record<AccentKey, {accent: string; accent2: string; glow: string; ink: string}> = {
  lime:  {accent: '#c6f833', accent2: '#a6d420', glow: 'rgba(198,248,51,0.20)', ink: '#0a0d11'},
  amber: {accent: '#f2a33c', accent2: '#d9871f', glow: 'rgba(242,163,60,0.20)', ink: '#0a0d11'},
  cyan:  {accent: '#3fd6e0', accent2: '#1fb4be', glow: 'rgba(63,214,224,0.20)', ink: '#06181a'},
  coral: {accent: '#ff6b5a', accent2: '#e64c3b', glow: 'rgba(255,107,90,0.20)', ink: '#1a0a08'},
  violet: {accent: '#d946ef', accent2: '#a21caf', glow: 'rgba(217,70,239,0.20)', ink: '#1a0a1f'},
};

export function formatPace(paceMinPerKm: number): string {
  const mins = Math.floor(paceMinPerKm);
  const secs = Math.round((paceMinPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (hrs > 0)
    return `${hrs}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${mins}:${s.toString().padStart(2, '0')}`;
}

export function getZoneForHr(hr: number, zones: UserSettings['zones']): number {
  if (hr <= zones.z1[1]) return 1;
  if (hr <= zones.z2[1]) return 2;
  if (hr <= zones.z3[1]) return 3;
  if (hr <= zones.z4[1]) return 4;
  if (hr <= zones.z5[1]) return 5;
  return 6;
}

// Carbon-instrument palette (Apple system) — mirrors --z*/--color-* tokens in globals.css.
// Hex (not CSS vars) so values resolve in SVG/recharts attributes too.
export const COLORS = {
  brand: '#c6f833',
  grey: '#8e8e93',
  blue: '#0a84ff',
  green: '#30d158',
  yellow: '#ffd60a',
  orange: '#ff9f0a',
  red: '#ff453a',
  purple: '#bf5af2',
  cyan: '#64d2ff',
  gold: '#ffd60a',
} as const;

export const SPORT_COLORS: Record<string, string> = {
  Run: COLORS.green,
  Ride: COLORS.blue,
  Hike: COLORS.orange,
  Swim: COLORS.cyan,
  Walk: COLORS.yellow,
};

export const ZONE_COLORS: Record<number, string> = {
  1: COLORS.grey,
  2: COLORS.blue,
  3: COLORS.green,
  4: COLORS.yellow,
  5: COLORS.orange,
  6: COLORS.red,
};

export const ZONE_NAMES: Record<number, string> = {
  1: 'Recovery',
  2: 'Aerobic',
  3: 'Tempo',
  4: 'Threshold',
  5: 'VO2max',
  6: 'Anaerobic',
};
