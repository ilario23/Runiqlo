'use client';

import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useMemo, useState} from 'react';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useSettings} from '@/contexts/SettingsContext';
import {
  cachedGetAllActivities,
  cachedGetActivitiesPage,
  cachedGetActivityDetail,
  cachedGetActivityStreams,
  cachedGetAthleteStats,
  cachedGetAthleteZones,
  cachedGetAthleteGear,
  cachedCalcFitnessData,
  cachedGetAllSegments,
  forceRefreshActivities,
  batchGetZoneBreakdowns,
} from '@/lib/stravaCache';
import type {AggregatedSegment} from '@/lib/stravaCache';
import type {ActivitySummary, StreamPoint} from '@/lib/activityModel';
import type {FitnessDataPoint, AdvancedMetricsDataPoint} from '@/utils/trainingLoad';
import {calcAdvancedMetricsData} from '@/utils/trainingLoad';
import {aggregateZoneBreakdowns, hashZoneSettings} from '@/lib/zoneCompute';
import type {AggregatedZoneTotals, ZoneBreakdown} from '@/lib/zoneCompute';
import type {
  StravaDetailedActivity,
  StravaAthleteStats,
  StravaAthleteZones,
  StravaSummaryGear,
  StravaStarredSegment,
} from '@/lib/strava';
import {fetchStarredSegments} from '@/lib/strava';
import {computeZoneBreakdown} from '@/lib/zoneCompute';

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

const getDashboardAfterDate = (): string => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 400);
  return cutoff.toISOString().slice(0, 10);
};

export const useActivities = () => {
  const {isAuthenticated, athlete} = useStravaAuth();
  return useQuery<ActivitySummary[]>({
    queryKey: ['strava', 'activities', athlete?.id],
    queryFn: () => cachedGetAllActivities(athlete!.id),
    enabled: isAuthenticated && !!athlete?.id,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });
};

export const useDashboardActivities = () => {
  const {isAuthenticated, athlete} = useStravaAuth();
  const queryClient = useQueryClient();
  const afterDate = getDashboardAfterDate();

  return useQuery<ActivitySummary[]>({
    queryKey: ['strava', 'activities', 'dashboard', athlete?.id, afterDate],
    queryFn: () =>
      cachedGetAllActivities(athlete!.id, afterDate, {
        staleWhileRevalidate: true,
        onBackgroundSyncComplete: () => {
          queryClient.invalidateQueries({queryKey: ['strava', 'activities']});
        },
      }),
    enabled: isAuthenticated && !!athlete?.id,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });
};

export const useActivitiesPaginated = (pageSize = 20) => {
  const {isAuthenticated, athlete} = useStravaAuth();
  const allActivities = useActivities();

  const firstPage = useQuery<ActivitySummary[]>({
    queryKey: ['strava', 'activities-page', athlete?.id, pageSize],
    queryFn: () => cachedGetActivitiesPage(athlete!.id, pageSize),
    enabled: isAuthenticated && !!athlete?.id && !allActivities.data,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });

  return {
    data: allActivities.data ?? firstPage.data,
    isLoading: firstPage.isLoading && allActivities.isLoading,
    isFullyLoaded: !!allActivities.data,
  };
};

export const useActivityDetail = (activityId: string | undefined) => {
  const {isAuthenticated, athlete} = useStravaAuth();
  return useQuery<StravaDetailedActivity>({
    queryKey: ['strava', 'activity', athlete?.id, activityId],
    queryFn: () => cachedGetActivityDetail(athlete!.id, Number(activityId)),
    enabled: isAuthenticated && !!athlete?.id && !!activityId,
    staleTime: Infinity,
    gcTime: ONE_DAY,
  });
};

export const useActivityStreams = (activityId: string | undefined) => {
  const {isAuthenticated, athlete} = useStravaAuth();
  return useQuery<StreamPoint[]>({
    queryKey: ['strava', 'streams', athlete?.id, activityId],
    queryFn: () => cachedGetActivityStreams(athlete!.id, Number(activityId)),
    enabled: isAuthenticated && !!athlete?.id && !!activityId,
    staleTime: Infinity,
    gcTime: ONE_DAY,
  });
};

export const useAthleteStats = () => {
  const {isAuthenticated, athlete} = useStravaAuth();
  return useQuery<StravaAthleteStats>({
    queryKey: ['strava', 'stats', athlete?.id],
    queryFn: () => cachedGetAthleteStats(athlete!.id),
    enabled: isAuthenticated && !!athlete?.id,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
  });
};

export const useAthleteZones = () => {
  const {isAuthenticated, athlete} = useStravaAuth();
  return useQuery<StravaAthleteZones>({
    queryKey: ['strava', 'zones', athlete?.id],
    queryFn: () => cachedGetAthleteZones(athlete!.id),
    enabled: isAuthenticated && !!athlete?.id,
    staleTime: ONE_DAY,
    gcTime: ONE_DAY,
  });
};

export const useAthleteGear = () => {
  const {isAuthenticated, athlete} = useStravaAuth();
  return useQuery<{bikes: StravaSummaryGear[]; shoes: StravaSummaryGear[]; retiredGearIds: string[]}>({
    queryKey: ['strava', 'gear', athlete?.id],
    queryFn: () => cachedGetAthleteGear(athlete!.id),
    enabled: isAuthenticated && !!athlete?.id,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });
};

export const useFitnessData = () => {
  const {isAuthenticated, athlete} = useStravaAuth();
  const {settings} = useSettings();
  const {data: activities} = useDashboardActivities();

  return useQuery<FitnessDataPoint[]>({
    queryKey: ['dashboard', 'fitness', athlete?.id],
    queryFn: () => cachedCalcFitnessData(athlete!.id, activities!, settings),
    enabled: isAuthenticated && !!athlete?.id && !!activities && activities.length > 0,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });
};

export const useAdvancedMetricsData = (): AdvancedMetricsDataPoint[] => {
  const {data: fitnessData} = useFitnessData();
  const {data: activities} = useDashboardActivities();
  return useMemo(() => {
    if (!fitnessData || fitnessData.length === 0 || !activities) return [];
    return calcAdvancedMetricsData(fitnessData, activities);
  }, [fitnessData, activities]);
};

// ---- Zone breakdowns ----

interface ZoneBreakdownProgress {done: number; total: number}

const _zoneProgress = new Map<string, ZoneBreakdownProgress>();
const _zoneListeners = new Set<() => void>();

const setZoneProgress = (key: string, done: number, total: number) => {
  _zoneProgress.set(key, {done, total});
  _zoneListeners.forEach((fn) => fn());
};

const useZoneProgressSubscription = (key: string): ZoneBreakdownProgress => {
  const [progress, setProgress] = useState<ZoneBreakdownProgress>(
    () => _zoneProgress.get(key) ?? {done: 0, total: 0},
  );
  useEffect(() => {
    const handler = () => {
      const current = _zoneProgress.get(key);
      if (current) setProgress((prev) =>
        prev.done === current.done && prev.total === current.total ? prev : {...current}
      );
    };
    _zoneListeners.add(handler);
    handler();
    return () => { _zoneListeners.delete(handler); };
  }, [key]);
  return progress;
};

export const usePerActivityZoneBreakdowns = (weeks: number) => {
  const {isAuthenticated, athlete} = useStravaAuth();
  const {settings} = useSettings();
  const {data: activities, isLoading: activitiesLoading} = useDashboardActivities();
  const zonesHash = useMemo(() => hashZoneSettings(settings.zones), [settings.zones]);
  const progressKey = `${athlete?.id ?? 0}-${weeks}-${zonesHash}`;
  const progress = useZoneProgressSubscription(progressKey);

  const query = useQuery<Map<string, ZoneBreakdown>>({
    queryKey: ['dashboard', 'zone-breakdowns', athlete?.id, weeks, zonesHash, activities?.[0]?.id],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);
      const filtered = activities!.filter((a) => new Date(a.date) >= cutoff && a.avgHr > 0);
      if (filtered.length === 0) return new Map<string, ZoneBreakdown>();
      const activityIds = filtered.map((a) => Number(a.id));
      const breakdownMap = await batchGetZoneBreakdowns(
        athlete!.id, activityIds, settings.zones,
        (done, total) => setZoneProgress(progressKey, done, total),
      );
      const out = new Map<string, ZoneBreakdown>();
      for (const [id, breakdown] of breakdownMap) out.set(String(id), breakdown);
      return out;
    },
    enabled: isAuthenticated && !!athlete?.id && !activitiesLoading && !!activities && activities.length > 0,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
    structuralSharing: false,
  });

  return {data: query.data, isLoading: query.isLoading || activitiesLoading, progress};
};

export const useZoneBreakdowns = (weeks: number): {data: AggregatedZoneTotals | undefined; isLoading: boolean; progress: ZoneBreakdownProgress} => {
  const {data: breakdownMap, isLoading, progress} = usePerActivityZoneBreakdowns(weeks);
  const aggregated = useMemo(() => {
    if (!breakdownMap || breakdownMap.size === 0) return undefined;
    return aggregateZoneBreakdowns(Array.from(breakdownMap.values()));
  }, [breakdownMap]);
  return {data: aggregated, isLoading, progress};
};

export const useStarredSegments = () => {
  const {isAuthenticated, athlete} = useStravaAuth();
  return useQuery<StravaStarredSegment[]>({
    queryKey: ['strava', 'segments', 'starred', athlete?.id],
    queryFn: () => fetchStarredSegments(),
    enabled: isAuthenticated && !!athlete?.id,
    staleTime: ONE_DAY,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });
};

export const useAllSegments = () => {
  const {isAuthenticated, athlete} = useStravaAuth();
  return useQuery<{segments: AggregatedSegment[]; activitiesWithDetails: number; totalActivities: number}>({
    queryKey: ['strava', 'segments', 'all', athlete?.id],
    queryFn: () => cachedGetAllSegments(athlete!.id),
    enabled: isAuthenticated && !!athlete?.id,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });
};

export const useActivityZoneBreakdown = (activityId: string | undefined) => {
  const {settings} = useSettings();
  const {data: streams} = useActivityStreams(activityId);

  return useQuery<ZoneBreakdown | null>({
    queryKey: ['strava', 'zone-breakdown-single', activityId, hashZoneSettings(settings.zones)],
    queryFn: () => {
      if (!streams || streams.length === 0) return null;
      return computeZoneBreakdown(streams, settings.zones);
    },
    enabled: !!activityId && !!streams && streams.length > 0,
    staleTime: Infinity,
    gcTime: ONE_DAY,
  });
};

export const useForceRefreshActivities = () => {
  const queryClient = useQueryClient();
  const {athlete} = useStravaAuth();
  return async () => {
    if (!athlete?.id) return;
    const freshData = await forceRefreshActivities(athlete.id);
    queryClient.setQueryData(['strava', 'activities', athlete.id], freshData);
  };
};
