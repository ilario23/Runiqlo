import type {
  StravaSummaryActivity,
  StravaDetailedActivity,
  StravaStream,
  StravaStreamSet,
  StravaAthleteStats,
  StravaAthleteZones,
  StravaSummaryGear,
} from './strava';
import type {ActivityWeatherData} from './weather';

export interface CachedActivity {
  id: number;
  athleteId: number;
  data: StravaSummaryActivity;
  date: string;
  fetchedAt: number;
}

export interface CachedActivityDetail {
  id: number;
  athleteId: number;
  data: StravaDetailedActivity;
  fetchedAt: number;
}

export interface CachedActivityStreams {
  activityId: number;
  athleteId: number;
  data: StravaStream[] | StravaStreamSet;
  fetchedAt: number;
}

export interface CachedAthleteStats {
  athleteId: number;
  data: StravaAthleteStats;
  fetchedAt: number;
}

export interface CachedAthleteZones {
  key: string;
  athleteId: number;
  data: StravaAthleteZones;
  fetchedAt: number;
}

export interface CachedAthleteGear {
  key: string;
  athleteId: number;
  bikes: StravaSummaryGear[];
  shoes: StravaSummaryGear[];
  retiredGearIds: string[];
  fetchedAt: number;
}

export interface CachedZoneBreakdown {
  activityId: number;
  athleteId: number;
  hrHash: string;
  zones: Record<number, {time: number; distance: number}>;
  decouplingPct: number | null;
  computedAt: number;
}

export interface CachedDashboardContinuationState {
  ctl: number;
  atl: number;
}

export interface CachedActivityWeather {
  activityId: number;
  athleteId: number;
  data: ActivityWeatherData;
  fetchedAt: number;
}

export interface CachedSegmentEffort {
  id: number;
  athleteId: number;
  activityId: number;
  segmentId: number;
  segmentName: string;
  elapsedTime: number;
  movingTime: number;
  startDateLocal: string;
  distance: number;
  averageHeartrate?: number;
  prRank: number | null;
  segmentDistance: number;
  averageGrade: number;
  maximumGrade: number;
  elevationHigh: number;
  elevationLow: number;
  city: string;
  state: string;
  climbCategory: number;
  starred: boolean;
  syncedAt: number;
}

export interface CachedDashboardCache {
  key: string;
  athleteId: number;
  hrHash: string;
  lastActivityId: number;
  lastActivityCount: number;
  lastDate: string;
  continuationState: CachedDashboardContinuationState;
  data: import('@/utils/trainingLoad').FitnessDataPoint[];
  computedAt: number;
}
