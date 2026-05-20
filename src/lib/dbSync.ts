// DB Sync — typed client for /api/db/[table] routes.
// Reads return null on error (graceful degradation).
// Writes throw on error so callers can handle failures.

import type {
  CachedActivity,
  CachedActivityDetail,
  CachedActivityStreams,
  CachedAthleteStats,
  CachedAthleteZones,
  CachedAthleteGear,
  CachedZoneBreakdown,
  CachedDashboardCache,
} from './cacheTypes';
import {dbFetch} from './dbClient';

const API = '/api/db';
const BULK_CHUNK_SIZE = 200;

const postToDb = async (table: string, data: unknown): Promise<void> => {
  try {
    const res = await dbFetch(`${API}/${table}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      console.warn(`[dbSync] POST /${table} failed: ${res.status}`);
    }
  } catch (err) {
    console.warn(`[dbSync] POST /${table} error:`, err);
  }
};

const getFromDb = async <T>(table: string, pk?: string | number): Promise<T | null> => {
  try {
    const url = pk != null ? `${API}/${table}?pk=${pk}` : `${API}/${table}`;
    const res = await dbFetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
};

// ---- Activities ----

export const dbGetActivities = (athleteId: number): Promise<CachedActivity[] | null> =>
  getFromDb<CachedActivity[]>(`activities?athleteId=${athleteId}`);

export const dbGetRecentActivities = async (
  athleteId: number,
  afterDate: string,
): Promise<CachedActivity[] | null> => {
  try {
    const res = await dbFetch(`${API}/activities?athleteId=${athleteId}&after=${afterDate}`, {}, athleteId);
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
};

export const dbGetActivitiesPaginated = async (
  athleteId: number,
  limit: number,
  offset = 0,
): Promise<CachedActivity[] | null> => {
  try {
    const res = await dbFetch(
      `${API}/activities?athleteId=${athleteId}&limit=${limit}&offset=${offset}`,
      {},
      athleteId,
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
};

export const dbSyncActivities = (records: CachedActivity[]): Promise<void> =>
  postToDb('activities', records);

// ---- Activity Details ----

export const dbGetActivityDetail = (athleteId: number, id: number): Promise<CachedActivityDetail | null> =>
  getFromDb<CachedActivityDetail>(`activity-details?athleteId=${athleteId}&pk=${id}`);

export const dbSyncActivityDetail = (record: CachedActivityDetail): Promise<void> =>
  postToDb('activity-details', record);

export const dbGetActivityDetailsBulk = async (
  athleteId: number,
  ids: number[],
): Promise<CachedActivityDetail[]> => {
  if (ids.length === 0) return [];
  const results: CachedActivityDetail[] = [];
  for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
    const pks = ids.slice(i, i + BULK_CHUNK_SIZE).join(',');
    try {
      const res = await dbFetch(`${API}/activity-details?athleteId=${athleteId}&pks=${pks}`, {}, athleteId);
      if (!res.ok) continue;
      const data: CachedActivityDetail[] = await res.json();
      if (Array.isArray(data)) results.push(...data);
    } catch { /* skip */ }
  }
  return results;
};

// ---- Activity Streams ----

export const dbGetActivityStreams = (athleteId: number, activityId: number): Promise<CachedActivityStreams | null> =>
  getFromDb<CachedActivityStreams>(`activity-streams?athleteId=${athleteId}&pk=${activityId}`);

export const dbSyncActivityStreams = (record: CachedActivityStreams): Promise<void> =>
  postToDb('activity-streams', record);

export const dbGetActivityStreamsBulk = async (
  athleteId: number,
  ids: number[],
): Promise<CachedActivityStreams[]> => {
  if (ids.length === 0) return [];
  const results: CachedActivityStreams[] = [];
  for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
    const pks = ids.slice(i, i + BULK_CHUNK_SIZE).join(',');
    try {
      const res = await dbFetch(`${API}/activity-streams?athleteId=${athleteId}&pks=${pks}`, {}, athleteId);
      if (!res.ok) continue;
      const data: CachedActivityStreams[] = await res.json();
      if (Array.isArray(data)) results.push(...data);
    } catch { /* skip */ }
  }
  return results;
};

// ---- Athlete Stats ----

export const dbGetAthleteStats = (athleteId: number): Promise<CachedAthleteStats | null> =>
  getFromDb<CachedAthleteStats>('athlete-stats', athleteId);

export const dbSyncAthleteStats = (record: CachedAthleteStats): Promise<void> =>
  postToDb('athlete-stats', record);

// ---- Athlete Zones ----

export const dbGetAthleteZones = (athleteId: number): Promise<CachedAthleteZones | null> =>
  getFromDb<CachedAthleteZones>(`athlete-zones?athleteId=${athleteId}`);

export const dbSyncAthleteZones = (record: CachedAthleteZones): Promise<void> =>
  postToDb('athlete-zones', record);

// ---- Athlete Gear ----

export const dbGetAthleteGear = (athleteId: number): Promise<CachedAthleteGear | null> =>
  getFromDb<CachedAthleteGear>(`athlete-gear?athleteId=${athleteId}`);

export const dbSyncAthleteGear = (record: CachedAthleteGear): Promise<void> =>
  postToDb('athlete-gear', record);

// ---- Zone Breakdowns ----

export const dbGetZoneBreakdown = (athleteId: number, activityId: number): Promise<CachedZoneBreakdown | null> =>
  getFromDb<CachedZoneBreakdown>(`zone-breakdowns?athleteId=${athleteId}&pk=${activityId}`);

export const dbSyncZoneBreakdown = (record: CachedZoneBreakdown): Promise<void> =>
  postToDb('zone-breakdowns', record);

export const dbGetZoneBreakdownsBulk = async (
  athleteId: number,
  ids: number[],
): Promise<CachedZoneBreakdown[]> => {
  if (ids.length === 0) return [];
  const results: CachedZoneBreakdown[] = [];
  for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
    const pks = ids.slice(i, i + BULK_CHUNK_SIZE).join(',');
    try {
      const res = await dbFetch(`${API}/zone-breakdowns?athleteId=${athleteId}&pks=${pks}`, {}, athleteId);
      if (!res.ok) continue;
      const data: CachedZoneBreakdown[] = await res.json();
      if (Array.isArray(data)) results.push(...data);
    } catch { /* skip */ }
  }
  return results;
};

// ---- Dashboard Cache ----

export const dbGetDashboardCache = (key: string): Promise<CachedDashboardCache | null> =>
  getFromDb<CachedDashboardCache>('dashboard-cache', key);

export const dbSyncDashboardCache = (record: CachedDashboardCache): Promise<void> =>
  postToDb('dashboard-cache', record);

// ---- User Settings — partial update ----

export const dbSyncAthleteProfile = async (
  athleteId: number,
  weight: number | null,
  city: string | null,
): Promise<void> => {
  try {
    const res = await dbFetch(`${API}/user-settings`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({athleteId, weight, city}),
    }, athleteId);
    if (!res.ok) {
      console.warn(`[dbSync] PATCH /user-settings failed: ${res.status}`);
    }
  } catch (err) {
    console.warn('[dbSync] PATCH /user-settings error:', err);
  }
};
