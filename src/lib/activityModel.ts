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
  lat?: number;
  lng?: number;
}

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

export const COLORS = {
  brand: '#fc4c02',
  blue: '#0a84ff',
  green: '#30d158',
  yellow: '#ffd60a',
  orange: '#ff9f0a',
  red: '#ff453a',
  purple: '#bf5af2',
  gold: '#f59e0b',
} as const;

export const SPORT_COLORS: Record<string, string> = {
  Run: COLORS.green,
  Ride: COLORS.blue,
  Hike: COLORS.orange,
  Swim: COLORS.purple,
  Walk: COLORS.yellow,
};

export const ZONE_COLORS: Record<number, string> = {
  1: COLORS.green,
  2: COLORS.blue,
  3: COLORS.yellow,
  4: COLORS.orange,
  5: COLORS.red,
  6: COLORS.purple,
};

export const ZONE_NAMES: Record<number, string> = {
  1: 'Recovery',
  2: 'Aerobic',
  3: 'Tempo',
  4: 'Threshold',
  5: 'VO2max',
  6: 'Anaerobic',
};
