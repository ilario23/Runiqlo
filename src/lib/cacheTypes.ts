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
  settingsHash: string;
  zones: Record<number, {time: number; distance: number}>;
  computedAt: number;
}

export interface CachedDashboardContinuationState {
  bf: number;
  li: number;
}

export interface CachedActivityWeather {
  activityId: number;
  athleteId: number;
  data: ActivityWeatherData;
  fetchedAt: number;
}

export interface CachedDashboardCache {
  key: string;
  athleteId: number;
  settingsHash: string;
  lastActivityId: number;
  lastActivityCount: number;
  lastDate: string;
  continuationState: CachedDashboardContinuationState;
  data: import('@/utils/trainingLoad').FitnessDataPoint[];
  computedAt: number;
}
