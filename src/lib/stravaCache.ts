// Two-tier cache: Supabase (persistent) → Strava API (source of truth)
// React Query provides the in-memory session layer on top.

import {
  fetchActivitiesSinceEpoch,
  fetchAllActivities,
  fetchActivityDetail,
  fetchActivityStreams,
  fetchAthleteStats,
  fetchAthleteZones,
  fetchAthleteWithGear,
  fetchSegmentDetail,
  isStravaAuthError,
  RateLimitError,
  transformActivity,
  transformStreams,
} from './strava';
import type {StravaDetailedActivity, StravaAthleteStats, StravaAthleteZones, StravaSummaryGear, StravaSegmentDetail} from './strava';
import type {ActivitySummary, StreamPoint, UserSettings} from './activityModel';
import {computeZoneBreakdown, hashZoneSettings} from './zoneCompute';
import type {ZoneBreakdown} from './zoneCompute';
import {computeDecoupling} from './aerobicDecoupling';
import {calcFitnessData, appendFitnessData, hashTrainingSettings, toLocalDateStr} from '@/utils/trainingLoad';
import type {FitnessDataPoint, ZoneTotalsByActivity} from '@/utils/trainingLoad';
import {
  dbGetActivities,
  dbGetRecentActivities,
  dbGetActivitiesPaginated,
  dbSyncActivities,
  dbGetActivityDetail,
  dbSyncActivityDetail,
  dbGetActivityDetailsBulk,
  dbGetActivityStreams,
  dbSyncActivityStreams,
  dbGetAthleteStats,
  dbSyncAthleteStats,
  dbGetAthleteZones,
  dbSyncAthleteZones,
  dbGetAthleteGear,
  dbSyncAthleteGear,
  dbGetZoneBreakdown,
  dbSyncZoneBreakdown,
  dbGetZoneBreakdownsBulk,
  dbGetActivityStreamsBulk,
  dbGetDashboardCache,
  dbSyncDashboardCache,
  dbSyncAthleteProfile,
  dbGetActivityWeather,
  dbSyncActivityWeather,
  dbSyncSegmentEfforts,
  dbGetSegmentEffortsByAthlete,
} from './dbSync';
import type {CachedActivity} from './cacheTypes';
import type {ActivityWeatherData} from './weather';

const STALE = {
  activities: 60 * 60 * 1000,
  activityDetail: Infinity,
  activityStreams: Infinity,
  athleteStats: 60 * 60 * 1000,
  athleteZones: 24 * 60 * 60 * 1000,
  athleteGear: 60 * 60 * 1000,
} as const;

const isFresh = (fetchedAt: number, maxAge: number): boolean => {
  if (maxAge === Infinity) return true;
  return Date.now() - fetchedAt < maxAge;
};

const sortToSummaries = (rows: CachedActivity[]): ActivitySummary[] =>
  [...rows]
    .sort((a, b) => (b.date > a.date ? 1 : a.date > b.date ? -1 : 0))
    .map((r) => transformActivity(r.data));

// ---- Background sync dedup ----

const syncInFlight = new Set<number>();
const syncCallbacks = new Map<number, Set<() => void>>();

export type CachedActivitiesOptions = {
  staleWhileRevalidate?: boolean;
  onBackgroundSyncComplete?: () => void;
};

export const scheduleBackgroundActivitiesSync = (
  athleteId: number,
  onComplete?: () => void,
): void => {
  if (onComplete) {
    let set = syncCallbacks.get(athleteId);
    if (!set) { set = new Set(); syncCallbacks.set(athleteId, set); }
    set.add(onComplete);
  }
  if (syncInFlight.has(athleteId)) return;
  syncInFlight.add(athleteId);
  void (async () => {
    try {
      await syncActivitiesForAthlete(athleteId, 'incremental');
      const cbs = syncCallbacks.get(athleteId);
      syncCallbacks.delete(athleteId);
      cbs?.forEach((cb) => { try { cb(); } catch { /* noop */ } });
    } catch (error) {
      if (!isStravaAuthError(error)) console.error('Background Strava sync failed', error);
    } finally {
      syncInFlight.delete(athleteId);
    }
  })();
};

async function touchLatestFetchedAt(athleteId: number): Promise<void> {
  const latest = await dbGetActivitiesPaginated(athleteId, 1, 0);
  if (!latest?.[0]) return;
  await dbSyncActivities([{...latest[0], fetchedAt: Date.now()}]);
}

async function syncActivitiesForAthlete(
  athleteId: number,
  mode: 'incremental' | 'full',
): Promise<void> {
  const now = Date.now();
  if (mode === 'full') {
    const raw = await fetchAllActivities();
    await dbSyncActivities(raw.map((a) => ({
      id: a.id,
      athleteId,
      data: a,
      date: a.start_date_local.split('T')[0],
      fetchedAt: now,
    })));
    return;
  }
  const latest = await dbGetActivitiesPaginated(athleteId, 1, 0);
  if (!latest || latest.length === 0) {
    return syncActivitiesForAthlete(athleteId, 'full');
  }
  const afterEpoch = Math.max(
    0,
    Math.floor(new Date(latest[0].data.start_date as string).getTime() / 1000) - 1,
  );
  const raw = await fetchActivitiesSinceEpoch(afterEpoch);
  if (raw.length === 0) { await touchLatestFetchedAt(athleteId); return; }
  await dbSyncActivities(raw.map((a) => ({
    id: a.id, athleteId, data: a, date: a.start_date_local.split('T')[0], fetchedAt: now,
  })));
}

// ---- Activities ----

export const cachedGetAllActivities = async (
  athleteId: number,
  afterDate?: string,
  options?: CachedActivitiesOptions,
): Promise<ActivitySummary[]> => {
  const rows = afterDate
    ? await dbGetRecentActivities(athleteId, afterDate)
    : await dbGetActivities(athleteId);

  if (rows && rows.length > 0) {
    const newest = rows.reduce((a, b) => (a.fetchedAt > b.fetchedAt ? a : b));
    if (isFresh(newest.fetchedAt, STALE.activities)) return sortToSummaries(rows);

    if (options?.staleWhileRevalidate && afterDate) {
      scheduleBackgroundActivitiesSync(athleteId, options.onBackgroundSyncComplete);
      return sortToSummaries(rows);
    }
  }

  const mode: 'incremental' | 'full' = rows && rows.length > 0 ? 'incremental' : 'full';
  await syncActivitiesForAthlete(athleteId, mode);

  const fresh = afterDate
    ? await dbGetRecentActivities(athleteId, afterDate)
    : await dbGetActivities(athleteId);
  return fresh && fresh.length > 0 ? sortToSummaries(fresh) : [];
};

export const cachedGetActivitiesPage = async (
  athleteId: number,
  limit: number,
  offset = 0,
): Promise<ActivitySummary[]> => {
  const rows = await dbGetActivitiesPaginated(athleteId, limit, offset);
  if (!rows || rows.length === 0) return [];
  return rows.map((r) => transformActivity(r.data));
};

// ---- Activity Detail ----

export const cachedGetActivityDetail = async (
  athleteId: number,
  activityId: number,
): Promise<StravaDetailedActivity> => {
  const cached = await dbGetActivityDetail(athleteId, activityId);
  if (cached && isFresh(cached.fetchedAt, STALE.activityDetail)) return cached.data;

  const detail = await fetchActivityDetail(activityId);
  const fetchedAt = Date.now();
  await dbSyncActivityDetail({id: activityId, athleteId, data: detail, fetchedAt});
  if (detail.segment_efforts?.length) {
    void dbSyncSegmentEfforts(
      detail.segment_efforts.map((e) => ({
        id: e.id,
        athleteId,
        activityId,
        segmentId: e.segment.id,
        segmentName: e.segment.name,
        elapsedTime: e.elapsed_time,
        movingTime: e.moving_time,
        startDateLocal: e.start_date_local,
        distance: e.distance,
        averageHeartrate: e.average_heartrate,
        prRank: e.pr_rank,
        segmentDistance: e.segment.distance,
        averageGrade: e.segment.average_grade,
        maximumGrade: e.segment.maximum_grade,
        elevationHigh: e.segment.elevation_high,
        elevationLow: e.segment.elevation_low,
        city: e.segment.city ?? '',
        state: e.segment.state ?? '',
        climbCategory: e.segment.climb_category,
        starred: e.segment.starred,
        syncedAt: fetchedAt,
      })),
    );
  }
  return detail;
};

// ---- Activity Streams ----

export const cachedGetActivityStreams = async (
  athleteId: number,
  activityId: number,
): Promise<StreamPoint[]> => {
  const cached = await dbGetActivityStreams(athleteId, activityId);
  if (cached && isFresh(cached.fetchedAt, STALE.activityStreams)) return transformStreams(cached.data);

  const raw = await fetchActivityStreams(activityId);
  await dbSyncActivityStreams({activityId, athleteId, data: raw, fetchedAt: Date.now()});
  return transformStreams(raw);
};

// ---- Activity Weather ----

export const cachedGetActivityWeather = async (
  activityId: number,
  athleteId: number,
  detail: StravaDetailedActivity | null,
): Promise<ActivityWeatherData | null> => {
  const cached = await dbGetActivityWeather(activityId);
  if (cached) return cached.data as ActivityWeatherData;

  if (!detail?.start_latlng?.length || !detail.start_date_local || !detail.start_date) return null;

  // Skip future activities (shouldn't happen but guard anyway)
  const activityDate = detail.start_date_local.slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (activityDate >= tomorrow) return null;

  const [lat, lng] = detail.start_latlng as [number, number];
  const utcHour = new Date(detail.start_date).getUTCHours();

  // Proxy through the Next.js API route (avoids CORS / client-network issues)
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      date: activityDate,
      hour: String(utcHour),
    });
    const res = await fetch(`/api/weather?${params}`);
    if (!res.ok) return null;
    const weather: ActivityWeatherData | null = await res.json();
    if (!weather) return null;

    void dbSyncActivityWeather(activityId, athleteId, weather);
    return weather;
  } catch {
    return null;
  }
};

// ---- Athlete Stats ----

export const cachedGetAthleteStats = async (athleteId: number): Promise<StravaAthleteStats> => {
  const cached = await dbGetAthleteStats(athleteId);
  if (cached && isFresh(cached.fetchedAt, STALE.athleteStats)) return cached.data;

  const stats = await fetchAthleteStats(athleteId);
  await dbSyncAthleteStats({athleteId, data: stats, fetchedAt: Date.now()});
  return stats;
};

// ---- Athlete Zones ----

export const cachedGetAthleteZones = async (athleteId: number): Promise<StravaAthleteZones> => {
  const ZONES_KEY = `athlete-zones:${athleteId}`;
  const cached = await dbGetAthleteZones(athleteId);
  if (cached && isFresh(cached.fetchedAt, STALE.athleteZones)) return cached.data;

  const zones = await fetchAthleteZones();
  await dbSyncAthleteZones({key: ZONES_KEY, athleteId, data: zones, fetchedAt: Date.now()});
  return zones;
};

// ---- Athlete Gear ----

export const cachedGetAthleteGear = async (
  athleteId: number,
): Promise<{bikes: StravaSummaryGear[]; shoes: StravaSummaryGear[]; retiredGearIds: string[]}> => {
  const GEAR_KEY = `athlete-gear:${athleteId}`;
  const cached = await dbGetAthleteGear(athleteId);
  if (cached && isFresh(cached.fetchedAt, STALE.athleteGear)) {
    return {bikes: cached.bikes, shoes: cached.shoes, retiredGearIds: cached.retiredGearIds ?? []};
  }

  const existingRetiredIds = cached?.retiredGearIds ?? [];
  const profile = await fetchAthleteWithGear();
  const bikes = profile.bikes ?? [];
  const shoes = profile.shoes ?? [];
  await dbSyncAthleteGear({key: GEAR_KEY, athleteId, bikes, shoes, retiredGearIds: existingRetiredIds, fetchedAt: Date.now()});
  dbSyncAthleteProfile(profile.id, profile.weight ?? null, profile.city ?? null).catch(() => {});
  return {bikes, shoes, retiredGearIds: existingRetiredIds};
};

// ---- Zone Breakdowns ----

export const cachedGetZoneBreakdown = async (
  athleteId: number,
  activityId: number,
  zones: UserSettings['zones'],
): Promise<ZoneBreakdown> => {
  const currentHash = hashZoneSettings(zones);
  const cached = await dbGetZoneBreakdown(athleteId, activityId);
  if (cached && cached.hrHash === currentHash) {
    return {zones: cached.zones, hrHash: cached.hrHash};
  }

  const stream = await cachedGetActivityStreams(athleteId, activityId);
  const breakdown = computeZoneBreakdown(stream, zones);
  const decouplingPct = computeDecoupling(stream).value;
  await dbSyncZoneBreakdown({activityId, athleteId, hrHash: breakdown.hrHash, zones: breakdown.zones, decouplingPct, computedAt: Date.now()});
  return breakdown;
};

const inflight = new Map<string, Promise<Map<number, ZoneBreakdown>>>();

export const batchGetZoneBreakdowns = async (
  athleteId: number,
  activityIds: number[],
  zones: UserSettings['zones'],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<number, ZoneBreakdown>> => {
  const currentHash = hashZoneSettings(zones);
  const dedupeKey = `${currentHash}:${[...activityIds].sort().join(',')}`;
  const existing = inflight.get(dedupeKey);
  if (existing) {
    const result = await existing;
    onProgress?.(result.size, activityIds.length);
    return result;
  }

  const promise = batchGetZoneBreakdownsInternal(athleteId, activityIds, zones, onProgress);
  inflight.set(dedupeKey, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(dedupeKey);
  }
};

const batchGetZoneBreakdownsInternal = async (
  athleteId: number,
  activityIds: number[],
  zones: UserSettings['zones'],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<number, ZoneBreakdown>> => {
  const results = new Map<number, ZoneBreakdown>();
  const total = activityIds.length;
  const currentHash = hashZoneSettings(zones);

  const cachedBreakdowns = await dbGetZoneBreakdownsBulk(athleteId, activityIds);
  const cachedMap = new Map(cachedBreakdowns.map((b) => [b.activityId, b]));
  const missingIds: number[] = [];

  for (const id of activityIds) {
    const cached = cachedMap.get(id);
    // Treat null decouplingPct as a miss: rows computed before the decoupling feature
    // need one recompute so the value gets stored. Stream is loaded from DB cache so this
    // is CPU-only — no Strava API calls.
    if (cached && cached.hrHash === currentHash && cached.decouplingPct !== null) {
      results.set(id, {zones: cached.zones, hrHash: cached.hrHash});
    } else {
      missingIds.push(id);
    }
  }

  let done = results.size;
  onProgress?.(done, total);
  if (missingIds.length === 0) return results;

  const cachedStreams = await dbGetActivityStreamsBulk(athleteId, missingIds);
  const streamMap = new Map(cachedStreams.map((s) => [s.activityId, s]));

  const MAX_CONCURRENCY = 5;
  for (let i = 0; i < missingIds.length; i += MAX_CONCURRENCY) {
    const batch = missingIds.slice(i, i + MAX_CONCURRENCY);
    let batchHitApi = false;
    const batchResults = await Promise.allSettled(
      batch.map(async (id) => {
        const cachedStream = streamMap.get(id);
        let stream: StreamPoint[];
        if (cachedStream) {
          stream = transformStreams(cachedStream.data);
        } else {
          batchHitApi = true;
          stream = await cachedGetActivityStreams(athleteId, id);
        }
        const breakdown = computeZoneBreakdown(stream, zones);
        const decouplingPct = computeDecoupling(stream).value;
        dbSyncZoneBreakdown({activityId: id, athleteId, hrHash: breakdown.hrHash, zones: breakdown.zones, decouplingPct, computedAt: Date.now()});
        return {id, breakdown};
      }),
    );
    let rateLimited = false;
    for (const result of batchResults) {
      done++;
      if (result.status === 'fulfilled') {
        results.set(result.value.id, result.value.breakdown);
      } else if (result.reason instanceof RateLimitError) {
        rateLimited = true;
      }
    }
    onProgress?.(done, total);
    if (rateLimited) {
      console.warn('[zoneBreakdowns] Strava rate limited — stopping backfill');
      break;
    }
    if (batchHitApi && i + MAX_CONCURRENCY < missingIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
};

// ---- Dashboard Fitness Cache ----

const FITNESS_DAYS_BACK = 365;

export const cachedCalcFitnessData = async (
  athleteId: number,
  activities: ActivitySummary[],
  settings: UserSettings,
  opts?: {force?: boolean},
): Promise<FitnessDataPoint[]> => {
  const currentHash = hashTrainingSettings(settings.zones, settings.maxHr, settings.restingHr);
  const latestId = activities[0]?.id ? Number(activities[0].id) : 0;
  const actCount = activities.length;
  // v4: TL now computed from true HR-stream time-in-zone (zone_breakdowns) instead
  // of the avg-HR single-zone approximation. v3 fixed local/UTC date drift.
  const cacheKey = `fitness:v4:${athleteId}`;

  // Load cached per-activity zone breakdowns and build an id → per-zone-time map.
  // Only breakdowns matching the current zone boundaries are used; activities
  // without a (fresh) breakdown fall back to the avg-HR approximation inside
  // buildDailyLoads. No streams are fetched here — read-only from cache.
  const zoneHash = hashZoneSettings(settings.zones);
  const buildZoneMap = async (acts: ActivitySummary[]): Promise<ZoneTotalsByActivity> => {
    const map: ZoneTotalsByActivity = new Map();
    if (acts.length === 0) return map;
    const ids = acts.map((a) => Number(a.id)).filter((id) => id > 0);
    const rows = await dbGetZoneBreakdownsBulk(athleteId, ids);
    for (const row of rows) {
      if (row.hrHash !== zoneHash) continue; // stale boundaries — let it fall back
      map.set(Number(row.activityId), row.zones);
    }
    return map;
  };

  // force=true skips all incremental fast paths and fully recomputes. Used after a
  // zone-breakdown backfill, where activity count/hash/date are unchanged but the
  // underlying per-zone TL inputs have changed.
  const cached = opts?.force ? null : await dbGetDashboardCache(cacheKey);

  if (cached) {
    if (cached.hrHash === currentHash && cached.lastActivityId === latestId && cached.lastActivityCount === actCount) {
      const todayStr = toLocalDateStr(new Date());
      if (cached.lastDate === todayStr) return cached.data;

      // Only rest-day extension here (no new activities) — no zone map needed.
      const result = appendFitnessData([], {...cached.continuationState, lastDate: cached.lastDate}, cached.data, settings.restingHr, settings.maxHr, FITNESS_DAYS_BACK, settings.zones);
      const {ctl, atl} = result.continuation;
      await dbSyncDashboardCache({key: cacheKey, athleteId, hrHash: currentHash, lastActivityId: latestId, lastActivityCount: actCount, lastDate: result.continuation.lastDate, continuationState: {ctl, atl}, data: result.data, computedAt: Date.now()});
      return result.data;
    }

    if (cached.hrHash === currentHash) {
      const newActivities = activities.filter((a) => a.date > cached.lastDate);
      const newActivityDelta = actCount - cached.lastActivityCount;
      // If delta doesn't match strictly-after-lastDate count, some activities landed on/before
      // the cached date (e.g. today's run when lastDate=today). appendFitnessData can't go back,
      // so fall through to full recompute.
      if (newActivityDelta === newActivities.length) {
        const zoneMap = await buildZoneMap(newActivities);
        const result = appendFitnessData(newActivities, {...cached.continuationState, lastDate: cached.lastDate}, cached.data, settings.restingHr, settings.maxHr, FITNESS_DAYS_BACK, settings.zones, zoneMap);
        const {ctl, atl} = result.continuation;
        await dbSyncDashboardCache({key: cacheKey, athleteId, hrHash: currentHash, lastActivityId: latestId, lastActivityCount: actCount, lastDate: result.continuation.lastDate, continuationState: {ctl, atl}, data: result.data, computedAt: Date.now()});
        return result.data;
      }
    }
  }

  const zoneMap = await buildZoneMap(activities);
  const result = calcFitnessData(activities, settings.restingHr, settings.maxHr, FITNESS_DAYS_BACK, settings.zones, zoneMap);
  const {ctl, atl} = result.continuation;
  await dbSyncDashboardCache({key: cacheKey, athleteId, hrHash: currentHash, lastActivityId: latestId, lastActivityCount: actCount, lastDate: result.continuation.lastDate, continuationState: {ctl, atl}, data: result.data, computedAt: Date.now()});
  return result.data;
};

// ---- Background activity-detail fetch (for segment scanning) ----

const segmentDetailSyncInFlight = new Set<number>();

const fetchMissingActivityDetails = (athleteId: number, uncachedIds: number[]): void => {
  if (uncachedIds.length === 0 || segmentDetailSyncInFlight.has(athleteId)) return;
  segmentDetailSyncInFlight.add(athleteId);
  void (async () => {
    try {
      const CONCURRENCY = 3;
      for (let i = 0; i < uncachedIds.length; i += CONCURRENCY) {
        const batch = uncachedIds.slice(i, i + CONCURRENCY);
        await Promise.allSettled(batch.map((id) => cachedGetActivityDetail(athleteId, id)));
      }
    } finally {
      segmentDetailSyncInFlight.delete(athleteId);
    }
  })();
};

// ---- All Segments ----

export interface AggregatedSegment {
  id: number;
  name: string;
  distance: number;
  average_grade: number;
  maximum_grade: number;
  elevation_high: number;
  elevation_low: number;
  city: string;
  state: string;
  climb_category: number;
  starred: boolean;
  effortCount: number;
  prTime: number;
  lastRunDate: string;
}

export const cachedGetAllSegments = async (athleteId: number): Promise<AggregatedSegment[]> => {
  const efforts = await dbGetSegmentEffortsByAthlete(athleteId);
  if (!efforts || efforts.length === 0) return [];

  const map = new Map<number, AggregatedSegment>();
  for (const e of efforts) {
    const existing = map.get(e.segmentId);
    if (!existing) {
      map.set(e.segmentId, {
        id: e.segmentId,
        name: e.segmentName,
        distance: e.segmentDistance,
        average_grade: e.averageGrade,
        maximum_grade: e.maximumGrade,
        elevation_high: e.elevationHigh,
        elevation_low: e.elevationLow,
        city: e.city,
        state: e.state,
        climb_category: e.climbCategory,
        starred: e.starred,
        effortCount: 1,
        prTime: e.elapsedTime,
        lastRunDate: e.startDateLocal.slice(0, 10),
      });
    } else {
      existing.effortCount += 1;
      if (e.elapsedTime < existing.prTime) existing.prTime = e.elapsedTime;
      const d = e.startDateLocal.slice(0, 10);
      if (d > existing.lastRunDate) existing.lastRunDate = d;
    }
  }

  return Array.from(map.values());
};

// ---- Segment detail (from Strava API) ----

export const cachedGetSegmentDetail = (segmentId: number): Promise<StravaSegmentDetail> =>
  fetchSegmentDetail(segmentId);

// ---- Segment efforts (derived from cached activity details) ----

export interface SegmentEffortRecord {
  activityId: number;
  effortId: number;
  activityDate: string;
  start_date_local: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  pr_rank: number | null;
}

export const cachedGetSegmentEfforts = async (
  athleteId: number,
  segmentId: number,
): Promise<SegmentEffortRecord[]> => {
  const allEfforts = await dbGetSegmentEffortsByAthlete(athleteId);
  const efforts = (allEfforts ?? []).filter((e) => e.segmentId === segmentId);
  if (efforts.length === 0) return [];

  // segment_efforts rows lack max_heartrate/average_cadence and activity date;
  // fetch details only for activities containing matching efforts.
  const activityIds = Array.from(new Set(efforts.map((e) => e.activityId)));
  const details = await dbGetActivityDetailsBulk(athleteId, activityIds);
  const actDateById = new Map<number, string>();
  const detailEffortById = new Map<number, {max_heartrate?: number; average_cadence?: number}>();
  for (const detail of details) {
    actDateById.set(detail.id, detail.data.start_date_local?.slice(0, 10) ?? '');
    for (const effort of detail.data.segment_efforts ?? []) {
      if (effort.segment.id !== segmentId) continue;
      detailEffortById.set(effort.id, {
        max_heartrate: effort.max_heartrate,
        average_cadence: effort.average_cadence,
      });
    }
  }

  const records: SegmentEffortRecord[] = efforts.map((e) => {
    const extra = detailEffortById.get(e.id);
    return {
      activityId: e.activityId,
      effortId: e.id,
      activityDate: actDateById.get(e.activityId) ?? e.startDateLocal.slice(0, 10),
      start_date_local: e.startDateLocal,
      elapsed_time: e.elapsedTime,
      moving_time: e.movingTime,
      distance: e.distance,
      average_heartrate: e.averageHeartrate,
      max_heartrate: extra?.max_heartrate,
      average_cadence: extra?.average_cadence,
      pr_rank: e.prRank,
    };
  });
  return records.sort((a, b) => a.activityDate.localeCompare(b.activityDate));
};

// ---- Force refresh ----

export const forceRefreshActivities = async (athleteId: number): Promise<ActivitySummary[]> => {
  const raw = await fetchAllActivities();
  const now = Date.now();
  const records = raw.map((a) => ({id: a.id, athleteId, data: a, date: a.start_date_local.split('T')[0], fetchedAt: now}));
  await dbSyncActivities(records);
  return [...records]
    .sort((a, b) => (b.date > a.date ? 1 : a.date > b.date ? -1 : 0))
    .map((r) => transformActivity(r.data));
};
