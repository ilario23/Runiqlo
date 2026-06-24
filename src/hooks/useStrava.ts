'use client';

import {useQuery, useMutation, useQueryClient} from '@tanstack/react-query';
import {useEffect, useMemo, useState} from 'react';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useSettings} from '@/contexts/SettingsContext';
import {
  cachedGetAllActivities,
  cachedGetActivitiesPage,
  cachedGetActivityDetail,
  cachedGetActivityStreams,
  cachedGetActivityWeather,
  cachedGetAthleteStats,
  cachedGetAthleteZones,
  cachedGetAthleteGear,
  cachedCalcFitnessData,
  cachedGetAllSegments,
  cachedGetSegmentEfforts,
  cachedGetSegmentDetail,
  forceRefreshActivities,
  batchGetZoneBreakdowns,
} from '@/lib/stravaCache';
import type {ActivityWeatherData} from '@/lib/weather';
import type {AggregatedSegment, SegmentEffortRecord} from '@/lib/stravaCache';
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
  StravaSegmentDetail,
} from '@/lib/strava';
import {fetchStarredSegments} from '@/lib/strava';
import {computeZoneBreakdown} from '@/lib/zoneCompute';
import {computeDecoupling, type DecouplingResult} from '@/lib/aerobicDecoupling';
import type {WeeklyPlan} from '@/lib/coachTypes';

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

const FITNESS_LS_PREFIX = 'fitness-data-v1';
const readLocalFitness = (athleteId: number): FitnessDataPoint[] | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(`${FITNESS_LS_PREFIX}:${athleteId}`);
    return raw ? (JSON.parse(raw) as FitnessDataPoint[]) : undefined;
  } catch { return undefined; }
};
const writeLocalFitness = (athleteId: number, data: FitnessDataPoint[]) => {
  try { localStorage.setItem(`${FITNESS_LS_PREFIX}:${athleteId}`, JSON.stringify(data)); } catch { /* noop */ }
};

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

export const useActivityWeather = (activityId: string | undefined) => {
  const {isAuthenticated, athlete} = useStravaAuth();
  const {data: detail} = useActivityDetail(activityId);
  return useQuery<ActivityWeatherData | null>({
    queryKey: ['strava', 'weather', activityId],
    queryFn: () => cachedGetActivityWeather(Number(activityId), athlete!.id, detail ?? null),
    enabled: isAuthenticated && !!athlete?.id && !!activityId && detail !== undefined,
    staleTime: Infinity,
    gcTime: ONE_DAY,
  });
};

export const useActivityPlace = (activityId: string | undefined) => {
  const {isAuthenticated} = useStravaAuth();
  const {data: detail} = useActivityDetail(activityId);
  return useQuery<string | null>({
    queryKey: ['strava', 'place', activityId],
    queryFn: async () => {
      // Prefer Strava's own location fields when present.
      const city = detail?.location_city;
      const state = detail?.location_state;
      const parts = [city, state].filter(Boolean) as string[];
      if (parts.length) return parts.join(', ');

      const latlng = detail?.start_latlng;
      if (!latlng || latlng.length < 2) return detail?.location_country ?? null;
      const r = await fetch(`/api/geocode?lat=${latlng[0]}&lng=${latlng[1]}`);
      if (!r.ok) return null;
      const place = (await r.json()) as {label: string} | null;
      return place?.label ?? null;
    },
    enabled: isAuthenticated && !!activityId && detail !== undefined,
    staleTime: Infinity,
    gcTime: ONE_DAY,
  });
};

export const useBestEffortsData = () => {
  const {isAuthenticated, athlete} = useStravaAuth();
  return useQuery<{bests: Record<string, {timeSeconds: number; date: string; activityId: number}>} | null>({
    queryKey: ['best-efforts', athlete?.id],
    queryFn: async () => {
      if (!athlete?.id) return null;
      const r = await fetch(`/api/db/best-efforts-cache?athleteId=${athlete.id}`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: isAuthenticated && !!athlete?.id,
    staleTime: ONE_HOUR,
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
    queryFn: async () => {
      const result = await cachedCalcFitnessData(athlete!.id, activities!, settings);
      writeLocalFitness(athlete!.id, result);
      return result;
    },
    enabled: isAuthenticated && !!athlete?.id && !!activities && activities.length > 0,
    placeholderData: athlete?.id ? readLocalFitness(athlete.id) : undefined,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });
};

/**
 * One-shot backfill: compute & cache HR-stream zone breakdowns for every loaded
 * activity that has HR, then force a full fitness recompute so all Training Load
 * values use true time-in-zone instead of the avg-HR fallback.
 *
 * Reuses batchGetZoneBreakdowns (cached-stream reuse, concurrency, in-flight dedup).
 * Activities whose HR stream isn't cached are fetched from Strava — this can be
 * many requests, so it runs in the browser session and reports progress.
 */
export const useBackfillZoneData = () => {
  const {athlete} = useStravaAuth();
  const {settings} = useSettings();
  const {data: activities} = useDashboardActivities();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState<ZoneBreakdownProgress>({done: 0, total: 0});

  const hrActivityCount = useMemo(
    () => (activities ?? []).filter((a) => a.avgHr > 0).length,
    [activities],
  );

  const run = async () => {
    if (!athlete?.id || !activities || status === 'running') return;
    const ids = activities.filter((a) => a.avgHr > 0).map((a) => Number(a.id));
    if (ids.length === 0) { setStatus('done'); return; }
    setStatus('running');
    setProgress({done: 0, total: ids.length});
    try {
      await batchGetZoneBreakdowns(athlete.id, ids, settings.zones, (done, total) =>
        setProgress({done, total}),
      );
      // Breakdowns now cached — force a full recompute so TL picks them up,
      // then refresh every fitness-derived query.
      await cachedCalcFitnessData(athlete.id, activities, settings, {force: true});
      await queryClient.invalidateQueries({queryKey: ['dashboard', 'fitness']});
      await queryClient.invalidateQueries({queryKey: ['dashboard', 'zone-breakdowns']});
      setStatus('done');
    } catch {
      setStatus('error');
    }
  };

  return {run, status, progress, hrActivityCount};
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
    // Defensive: a corrupted (e.g. previously-persisted) Map deserializes to a
    // plain object without `.values`. Treat anything that isn't a real Map as empty.
    if (!breakdownMap || typeof breakdownMap.values !== 'function' || breakdownMap.size === 0) return undefined;
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
  return useQuery<AggregatedSegment[]>({
    queryKey: ['strava', 'segments', 'all', athlete?.id],
    queryFn: () => cachedGetAllSegments(athlete!.id),
    enabled: isAuthenticated && !!athlete?.id,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });
};

export const useSegmentEfforts = (segmentId: number | undefined) => {
  const {isAuthenticated, athlete} = useStravaAuth();
  return useQuery<SegmentEffortRecord[]>({
    queryKey: ['strava', 'segment-efforts', athlete?.id, segmentId],
    queryFn: () => cachedGetSegmentEfforts(athlete!.id, segmentId!),
    enabled: isAuthenticated && !!athlete?.id && segmentId != null && !isNaN(segmentId),
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });
};

export const useSegmentDetail = (segmentId: number | undefined) => {
  const {isAuthenticated} = useStravaAuth();
  return useQuery<StravaSegmentDetail>({
    queryKey: ['strava', 'segment-detail', segmentId],
    queryFn: () => cachedGetSegmentDetail(segmentId!),
    enabled: isAuthenticated && segmentId != null && !isNaN(segmentId),
    staleTime: Infinity,
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

export const useActivityDecoupling = (activityId: string | undefined) => {
  const {data: streams} = useActivityStreams(activityId);

  return useQuery<DecouplingResult>({
    queryKey: ['strava', 'decoupling', activityId],
    queryFn: () => {
      if (!streams || streams.length === 0) return {value: null, reason: 'no_hr' as const};
      return computeDecoupling(streams);
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

import type {AdherenceData} from '@/app/api/coach/adherence/route';

export const useAdherence = (activityId: string | undefined) => {
  const {isAuthenticated, athlete} = useStravaAuth();
  return useQuery<AdherenceData | null>({
    queryKey: ['coach', 'adherence', athlete?.id, activityId],
    queryFn: async () => {
      const res = await fetch(`/api/coach/adherence?activityId=${activityId}&athleteId=${athlete!.id}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated && !!athlete?.id && !!activityId,
    staleTime: Infinity,
    gcTime: ONE_DAY,
  });
};

export type InjuryEntry = {bodyPart: string; severity: 'mild' | 'moderate' | 'severe'; resolved: boolean};

export type AthleteNotesData = {
  athleteId: number;
  injuryHistory: InjuryEntry[];
  preferences: Record<string, string>;
  responsePatterns: Record<string, string>;
  freeformNotes: string | null;
  lastUpdatedAt: number;
};

export const useAthleteNotes = () => {
  const {isAuthenticated, athlete} = useStravaAuth();
  const queryClient = useQueryClient();

  const query = useQuery<AthleteNotesData | null>({
    queryKey: ['coach', 'notes', athlete?.id],
    queryFn: async () => {
      const res = await fetch(`/api/coach/notes?athleteId=${athlete!.id}`);
      if (!res.ok) throw new Error('Failed to fetch notes');
      return res.json();
    },
    enabled: isAuthenticated && !!athlete?.id,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });

  const mutation = useMutation({
    mutationFn: async (patch: Partial<Omit<AthleteNotesData, 'athleteId' | 'lastUpdatedAt'>>) => {
      const res = await fetch('/api/coach/notes', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({athleteId: athlete!.id, ...patch}),
      });
      if (!res.ok) throw new Error('Failed to save notes');
      return res.json() as Promise<AthleteNotesData>;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['coach', 'notes', athlete?.id], updated);
    },
  });

  return {
    notes: query.data,
    isLoading: query.isLoading,
    saveNotes: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
};

// ── Weekly plan (dashboard + plan page) ─────────────────────────────────────
// React Query so the plan stays cached across navigation and refetches itself
// on mount/reconnect — fixes the "blank until you switch pages" race where the
// first fetch fired before the auth cookie was ready and never retried.

const ONE_MIN = 60 * 1000;

export const useWeekPlan = (weekStart: string) => {
  const {isAuthenticated, athlete} = useStravaAuth();
  const queryClient = useQueryClient();

  const query = useQuery<WeeklyPlan | null>({
    queryKey: ['coach', 'week', athlete?.id, weekStart],
    queryFn: async () => {
      const res = await fetch(`/api/coach/week?athleteId=${athlete!.id}&weekStart=${weekStart}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) ?? null;
    },
    enabled: isAuthenticated && !!athlete?.id && !!weekStart,
    staleTime: ONE_MIN,
    gcTime: ONE_DAY,
    retry: 2,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({queryKey: ['coach', 'week', athlete?.id, weekStart]});

  return {plan: query.data, query, invalidate};
};
