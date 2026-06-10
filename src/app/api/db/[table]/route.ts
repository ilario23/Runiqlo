import {NextRequest, NextResponse} from 'next/server';
import {and, eq, inArray, gte, desc} from 'drizzle-orm';
import {sql} from 'drizzle-orm';
import {getDb} from '@/db';
import type {PostgresJsDatabase} from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import {requireAthlete} from '@/lib/apiAuth';

// Auth enforced by default; set DB_ROUTE_ENFORCE_AUTH=false to opt out.
const DB_ROUTE_ENFORCE_AUTH = process.env.DB_ROUTE_ENFORCE_AUTH !== 'false';

type Db = PostgresJsDatabase<typeof schema>;

// RLS context: tables have row-level security keyed on
// current_setting('app.current_athlete_id'). Run all queries inside a
// transaction that sets it (txn-local, so it resets on commit/rollback and is
// safe with transaction-pooled connections). Without this, every policy check
// fails and queries 500.
const withRls = async <T>(
  athleteId: number | null,
  fn: (db: Db) => Promise<T>,
): Promise<T> => {
  const db = getDb();
  return db.transaction(async (tx) => {
    if (athleteId != null) {
      await tx.execute(
        sql`select set_config('app.current_athlete_id', ${String(athleteId)}, true)`,
      );
    }
    return fn(tx as unknown as Db);
  });
};

// ---- Auth helpers ----

const hasValidApiKey = (req: NextRequest): boolean => {
  const key = req.headers.get('x-db-api-key');
  const envKey = process.env.DB_ROUTE_API_KEY;
  return Boolean(key && envKey && key === envKey);
};

// Identity verified via Strava token (session cookie or bearer header) —
// the x-athlete-id header is client-supplied and never trusted. The API key
// bypass is for server-to-server calls only.
const enforceAuth = async (
  req: NextRequest,
  requestedAthleteId: number | null,
): Promise<{response: NextResponse | null; athleteId: number | null}> => {
  if (!DB_ROUTE_ENFORCE_AUTH || hasValidApiKey(req)) {
    return {response: null, athleteId: requestedAthleteId};
  }
  const auth = await requireAthlete(req, requestedAthleteId);
  if (!auth.ok) return {response: auth.response, athleteId: null};
  return {response: null, athleteId: auth.athleteId};
};

// ---- Table routing ----

type TableName =
  | 'activities'
  | 'activity-details'
  | 'activity-streams'
  | 'athlete-stats'
  | 'athlete-zones'
  | 'athlete-gear'
  | 'zone-breakdowns'
  | 'dashboard-cache'
  | 'best-efforts-cache'
  | 'user-settings'
  | 'activity-weather'
  | 'gear-thresholds'
  | 'segment-efforts';

const VALID_TABLES = new Set<TableName>([
  'activities',
  'activity-details',
  'activity-streams',
  'athlete-stats',
  'athlete-zones',
  'athlete-gear',
  'zone-breakdowns',
  'dashboard-cache',
  'best-efforts-cache',
  'user-settings',
  'activity-weather',
  'gear-thresholds',
  'segment-efforts',
]);

// ---- GET ----

export async function GET(
  req: NextRequest,
  {params}: {params: Promise<{table: string}>},
) {
  const {table} = await params;
  if (!VALID_TABLES.has(table as TableName)) {
    return NextResponse.json({error: `Unknown table: ${table}`}, {status: 400});
  }

  const {searchParams} = req.nextUrl;
  const pk = searchParams.get('pk');
  const pks = searchParams.get('pks');
  const athleteIdRaw = searchParams.get('athleteId');
  const athleteId = athleteIdRaw ? Number(athleteIdRaw) : null;

  const {response: authErr, athleteId: verifiedAthleteId} = await enforceAuth(req, athleteId);
  if (authErr) return authErr;

  const rlsAthleteId = verifiedAthleteId ?? athleteId;

  try {
    return await withRls(rlsAthleteId, async (db) => {
    switch (table as TableName) {
      case 'activities': {
        const t = schema.activities;
        if (!athleteId) return NextResponse.json({error: 'athleteId required'}, {status: 400});
        const limitRaw = searchParams.get('limit');
        const offsetRaw = searchParams.get('offset');
        const after = searchParams.get('after');

        if (limitRaw) {
          const limit = Number(limitRaw);
          const offset = Number(offsetRaw ?? '0');
          const rows = await db
            .select()
            .from(t)
            .where(eq(t.athleteId, athleteId))
            .orderBy(desc(t.date))
            .limit(limit)
            .offset(offset);
          return NextResponse.json(rows);
        }
        if (after) {
          const rows = await db
            .select()
            .from(t)
            .where(sql`${t.athleteId} = ${athleteId} AND ${t.date} >= ${after}`)
            .orderBy(desc(t.date));
          return NextResponse.json(rows);
        }
        const rows = await db
          .select()
          .from(t)
          .where(eq(t.athleteId, athleteId))
          .orderBy(desc(t.date));
        return NextResponse.json(rows);
      }

      case 'activity-details': {
        const t = schema.activityDetails;
        if (!athleteId) return NextResponse.json({error: 'athleteId required'}, {status: 400});
        if (pk) {
          const rows = await db.select().from(t).where(
            sql`${t.athleteId} = ${athleteId} AND ${t.id} = ${Number(pk)}`
          );
          return NextResponse.json(rows[0] ?? null);
        }
        if (pks) {
          const ids = pks.split(',').map(s => Number(s)).filter(n => Number.isFinite(n) && n > 0);
          if (ids.length === 0) return NextResponse.json([]);
          const rows = await db.select().from(t).where(
            and(eq(t.athleteId, athleteId), inArray(t.id, ids))
          );
          return NextResponse.json(rows);
        }
        return NextResponse.json({error: 'pk or pks required'}, {status: 400});
      }

      case 'activity-streams': {
        const t = schema.activityStreams;
        if (!athleteId) return NextResponse.json({error: 'athleteId required'}, {status: 400});
        if (pk) {
          const rows = await db.select().from(t).where(
            sql`${t.athleteId} = ${athleteId} AND ${t.activityId} = ${Number(pk)}`
          );
          return NextResponse.json(rows[0] ?? null);
        }
        if (pks) {
          const ids = pks.split(',').map(s => Number(s)).filter(n => Number.isFinite(n) && n > 0);
          if (ids.length === 0) return NextResponse.json([]);
          const rows = await db.select().from(t).where(
            and(eq(t.athleteId, athleteId), inArray(t.activityId, ids))
          );
          return NextResponse.json(rows);
        }
        return NextResponse.json({error: 'pk or pks required'}, {status: 400});
      }

      case 'athlete-stats': {
        const t = schema.athleteStats;
        if (!pk && !athleteId) return NextResponse.json({error: 'pk or athleteId required'}, {status: 400});
        const id = pk ? Number(pk) : athleteId!;
        const rows = await db.select().from(t).where(eq(t.athleteId, id));
        return NextResponse.json(rows[0] ?? null);
      }

      case 'athlete-zones': {
        const t = schema.athleteZones;
        if (pk) {
          const rows = await db.select().from(t).where(eq(t.key, pk));
          return NextResponse.json(rows[0] ?? null);
        }
        if (athleteId) {
          const rows = await db.select().from(t).where(eq(t.athleteId, athleteId));
          return NextResponse.json(rows[0] ?? null);
        }
        return NextResponse.json({error: 'pk or athleteId required'}, {status: 400});
      }

      case 'athlete-gear': {
        const t = schema.athleteGear;
        if (pk) {
          const rows = await db.select().from(t).where(eq(t.key, pk));
          return NextResponse.json(rows[0] ?? null);
        }
        if (athleteId) {
          const rows = await db.select().from(t).where(eq(t.athleteId, athleteId));
          return NextResponse.json(rows[0] ?? null);
        }
        return NextResponse.json({error: 'pk or athleteId required'}, {status: 400});
      }

      case 'zone-breakdowns': {
        const t = schema.zoneBreakdowns;
        if (!athleteId) return NextResponse.json({error: 'athleteId required'}, {status: 400});
        if (pk) {
          const rows = await db.select().from(t).where(
            sql`${t.athleteId} = ${athleteId} AND ${t.activityId} = ${Number(pk)}`
          );
          return NextResponse.json(rows[0] ?? null);
        }
        if (pks) {
          const ids = pks.split(',').map(s => Number(s)).filter(n => Number.isFinite(n) && n > 0);
          if (ids.length === 0) return NextResponse.json([]);
          const rows = await db.select().from(t).where(
            and(eq(t.athleteId, athleteId), inArray(t.activityId, ids))
          );
          return NextResponse.json(rows);
        }
        const rows = await db.select().from(t).where(eq(t.athleteId, athleteId));
        return NextResponse.json(rows);
      }

      case 'gear-thresholds': {
        const t = schema.gearThresholds;
        if (!athleteId) return NextResponse.json({error: 'athleteId required'}, {status: 400});
        const rows = await db.select().from(t).where(eq(t.athleteId, athleteId));
        return NextResponse.json(rows);
      }

      case 'dashboard-cache': {
        const t = schema.dashboardCache;
        if (pk) {
          const rows = await db.select().from(t).where(eq(t.key, pk));
          return NextResponse.json(rows[0] ?? null);
        }
        if (athleteId) {
          const rows = await db.select().from(t).where(eq(t.athleteId, athleteId));
          return NextResponse.json(rows[0] ?? null);
        }
        return NextResponse.json({error: 'pk or athleteId required'}, {status: 400});
      }

      case 'best-efforts-cache': {
        const t = schema.bestEffortsCache;
        if (!athleteId) return NextResponse.json({error: 'athleteId required'}, {status: 400});
        const rows = await db.select().from(t).where(eq(t.athleteId, athleteId));
        return NextResponse.json(rows[0] ?? null);
      }

      case 'user-settings': {
        const t = schema.userSettings;
        if (!athleteId) return NextResponse.json({error: 'athleteId required'}, {status: 400});
        const rows = await db.select().from(t).where(eq(t.athleteId, athleteId));
        return NextResponse.json(rows[0] ?? null);
      }

      case 'activity-weather': {
        const t = schema.activityWeather;
        if (!pk) return NextResponse.json({error: 'pk required'}, {status: 400});
        const rows = await db.select().from(t).where(eq(t.activityId, Number(pk)));
        return NextResponse.json(rows[0] ?? null);
      }

      case 'segment-efforts': {
        const t = schema.segmentEfforts;
        if (!athleteId) return NextResponse.json({error: 'athleteId required'}, {status: 400});
        const rows = await db
          .select()
          .from(t)
          .where(eq(t.athleteId, athleteId))
          .orderBy(desc(t.startDateLocal));
        return NextResponse.json(rows);
      }

      default:
        return NextResponse.json({error: 'Unknown table'}, {status: 400});
    }
    });
  } catch (err) {
    console.error(`[db/${table}] GET error:`, err);
    return NextResponse.json({error: 'Database error'}, {status: 500});
  }
}

// ---- POST (upsert) ----

export async function POST(
  req: NextRequest,
  {params}: {params: Promise<{table: string}>},
) {
  const {table} = await params;
  if (!VALID_TABLES.has(table as TableName)) {
    return NextResponse.json({error: `Unknown table: ${table}`}, {status: 400});
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({error: 'Invalid JSON'}, {status: 400});
  }

  const authAthleteId = (() => {
    if (Array.isArray(body)) {
      const first = body[0] as Record<string, unknown> | undefined;
      return first?.athleteId ? Number(first.athleteId) : null;
    }
    return (body as Record<string, unknown>)?.athleteId
      ? Number((body as Record<string, unknown>).athleteId)
      : null;
  })();

  const {response: authErr, athleteId: verifiedAthleteId} = await enforceAuth(req, authAthleteId);
  if (authErr) return authErr;

  const rlsAthleteId = verifiedAthleteId ?? authAthleteId;

  try {
    return await withRls(rlsAthleteId, async (db) => {
    switch (table as TableName) {
      case 'activities': {
        const records = (Array.isArray(body) ? body : [body]) as Array<{
          id: number; athleteId: number; data: unknown; date: string; fetchedAt: number;
        }>;
        if (records.length === 0) return NextResponse.json({ok: true});
        await db
          .insert(schema.activities)
          .values(records.map((r) => ({
            id: r.id,
            athleteId: r.athleteId,
            data: r.data,
            date: r.date,
            fetchedAt: r.fetchedAt,
          })))
          .onConflictDoUpdate({
            target: schema.activities.id,
            set: {
              athleteId: sql`excluded.athlete_id`,
              data: sql`excluded.data`,
              date: sql`excluded.date`,
              fetchedAt: sql`excluded.fetched_at`,
            },
          });
        return NextResponse.json({ok: true, count: records.length});
      }

      case 'activity-details': {
        const records = (Array.isArray(body) ? body : [body]) as Array<{
          id: number; athleteId: number; data: unknown; fetchedAt: number;
        }>;
        if (records.length === 0) return NextResponse.json({ok: true});
        await db
          .insert(schema.activityDetails)
          .values(records.map((r) => ({
            id: r.id, athleteId: r.athleteId, data: r.data, fetchedAt: r.fetchedAt,
          })))
          .onConflictDoUpdate({
            target: schema.activityDetails.id,
            set: {data: sql`excluded.data`, fetchedAt: sql`excluded.fetched_at`},
          });
        return NextResponse.json({ok: true, count: records.length});
      }

      case 'activity-streams': {
        const r = body as {activityId: number; athleteId: number; data: unknown; fetchedAt: number};
        await db
          .insert(schema.activityStreams)
          .values({activityId: r.activityId, athleteId: r.athleteId, data: r.data, fetchedAt: r.fetchedAt})
          .onConflictDoUpdate({
            target: schema.activityStreams.activityId,
            set: {data: sql`excluded.data`, fetchedAt: sql`excluded.fetched_at`},
          });
        return NextResponse.json({ok: true});
      }

      case 'athlete-stats': {
        const r = body as {athleteId: number; data: unknown; fetchedAt: number};
        await db
          .insert(schema.athleteStats)
          .values({athleteId: r.athleteId, data: r.data, fetchedAt: r.fetchedAt})
          .onConflictDoUpdate({
            target: schema.athleteStats.athleteId,
            set: {data: sql`excluded.data`, fetchedAt: sql`excluded.fetched_at`},
          });
        return NextResponse.json({ok: true});
      }

      case 'athlete-zones': {
        const r = body as {key: string; athleteId: number; data: unknown; fetchedAt: number};
        await db
          .insert(schema.athleteZones)
          .values({key: r.key, athleteId: r.athleteId, data: r.data, fetchedAt: r.fetchedAt})
          .onConflictDoUpdate({
            target: schema.athleteZones.key,
            set: {data: sql`excluded.data`, fetchedAt: sql`excluded.fetched_at`},
          });
        return NextResponse.json({ok: true});
      }

      case 'athlete-gear': {
        const r = body as {key: string; athleteId: number; bikes: unknown; shoes: unknown; retiredGearIds: unknown; fetchedAt: number};
        await db
          .insert(schema.athleteGear)
          .values({key: r.key, athleteId: r.athleteId, bikes: r.bikes, shoes: r.shoes, retiredGearIds: r.retiredGearIds ?? [], fetchedAt: r.fetchedAt})
          .onConflictDoUpdate({
            target: schema.athleteGear.key,
            set: {bikes: sql`excluded.bikes`, shoes: sql`excluded.shoes`, fetchedAt: sql`excluded.fetched_at`},
          });
        return NextResponse.json({ok: true});
      }

      case 'zone-breakdowns': {
        const r = body as {activityId: number; athleteId: number; hrHash: string; zones: unknown; decouplingPct?: number | null; computedAt: number};
        await db
          .insert(schema.zoneBreakdowns)
          .values({activityId: r.activityId, athleteId: r.athleteId, hrHash: r.hrHash, zones: r.zones, decouplingPct: r.decouplingPct ?? null, computedAt: r.computedAt})
          .onConflictDoUpdate({
            target: schema.zoneBreakdowns.activityId,
            set: {hrHash: sql`excluded.settings_hash`, zones: sql`excluded.zones`, decouplingPct: sql`excluded.decoupling_pct`, computedAt: sql`excluded.computed_at`},
          });
        return NextResponse.json({ok: true});
      }

      case 'dashboard-cache': {
        const r = body as {key: string; athleteId: number; hrHash: string; lastActivityId: number; lastActivityCount: number; lastDate: string; continuationState: unknown; data: unknown; computedAt: number};
        await db
          .insert(schema.dashboardCache)
          .values({key: r.key, athleteId: r.athleteId, hrHash: r.hrHash, lastActivityId: r.lastActivityId, lastActivityCount: r.lastActivityCount, lastDate: r.lastDate, continuationState: r.continuationState, data: r.data, computedAt: r.computedAt})
          .onConflictDoUpdate({
            target: schema.dashboardCache.key,
            set: {hrHash: sql`excluded.settings_hash`, lastActivityId: sql`excluded.last_activity_id`, lastActivityCount: sql`excluded.last_activity_count`, lastDate: sql`excluded.last_date`, continuationState: sql`excluded.continuation_state`, data: sql`excluded.data`, computedAt: sql`excluded.computed_at`},
          });
        return NextResponse.json({ok: true});
      }

      case 'best-efforts-cache': {
        const r = body as {athleteId: number; bests: unknown; activityCount: number; computedAt: number};
        await db
          .insert(schema.bestEffortsCache)
          .values({athleteId: r.athleteId, bests: r.bests, activityCount: r.activityCount, computedAt: r.computedAt})
          .onConflictDoUpdate({
            target: schema.bestEffortsCache.athleteId,
            set: {bests: sql`excluded.bests`, activityCount: sql`excluded.activity_count`, computedAt: sql`excluded.computed_at`},
          });
        return NextResponse.json({ok: true});
      }

      case 'user-settings': {
        const r = body as {athleteId: number; maxHr: number; restingHr: number; zones: unknown; paceZones?: unknown; weight?: number; city?: string; coachModel?: string | null; updatedAt: number};
        await db
          .insert(schema.userSettings)
          .values({athleteId: r.athleteId, maxHr: r.maxHr, restingHr: r.restingHr, zones: r.zones, paceZones: r.paceZones ?? null, weight: r.weight ?? null, city: r.city ?? null, coachModel: r.coachModel ?? null, updatedAt: r.updatedAt})
          .onConflictDoUpdate({
            target: schema.userSettings.athleteId,
            set: {maxHr: sql`excluded.max_hr`, restingHr: sql`excluded.resting_hr`, zones: sql`excluded.zones`, paceZones: sql`excluded.pace_zones`, weight: sql`excluded.weight`, city: sql`excluded.city`, coachModel: sql`excluded.coach_model`, updatedAt: sql`excluded.updated_at`},
          });
        return NextResponse.json({ok: true});
      }

      case 'activity-weather': {
        const r = body as {activityId: number; athleteId: number; data: unknown; fetchedAt: number};
        await db
          .insert(schema.activityWeather)
          .values({activityId: r.activityId, athleteId: r.athleteId, data: r.data, fetchedAt: r.fetchedAt})
          .onConflictDoUpdate({
            target: schema.activityWeather.activityId,
            set: {data: sql`excluded.data`, fetchedAt: sql`excluded.fetched_at`},
          });
        return NextResponse.json({ok: true});
      }

      case 'segment-efforts': {
        const records = (Array.isArray(body) ? body : [body]) as Array<{
          id: number; athleteId: number; activityId: number; segmentId: number;
          segmentName: string; elapsedTime: number; movingTime: number; startDateLocal: string;
          distance: number; averageHeartrate?: number; prRank: number | null;
          segmentDistance: number; averageGrade: number; maximumGrade: number;
          elevationHigh: number; elevationLow: number; city: string; state: string;
          climbCategory: number; starred: boolean; syncedAt: number;
        }>;
        if (records.length === 0) return NextResponse.json({ok: true});
        await db
          .insert(schema.segmentEfforts)
          .values(records.map((r) => ({
            id: r.id,
            athleteId: r.athleteId,
            activityId: r.activityId,
            segmentId: r.segmentId,
            segmentName: r.segmentName,
            elapsedTime: r.elapsedTime,
            movingTime: r.movingTime,
            startDateLocal: r.startDateLocal,
            distance: r.distance,
            averageHeartrate: r.averageHeartrate ?? null,
            prRank: r.prRank ?? null,
            segmentDistance: r.segmentDistance,
            averageGrade: r.averageGrade,
            maximumGrade: r.maximumGrade,
            elevationHigh: r.elevationHigh,
            elevationLow: r.elevationLow,
            city: r.city ?? '',
            state: r.state ?? '',
            climbCategory: r.climbCategory ?? 0,
            starred: r.starred ?? false,
            syncedAt: r.syncedAt,
          })))
          .onConflictDoUpdate({
            target: schema.segmentEfforts.id,
            set: {
              elapsedTime: sql`excluded.elapsed_time`,
              movingTime: sql`excluded.moving_time`,
              prRank: sql`excluded.pr_rank`,
              starred: sql`excluded.starred`,
              syncedAt: sql`excluded.synced_at`,
            },
          });
        return NextResponse.json({ok: true, count: records.length});
      }

      default:
        return NextResponse.json({error: 'Unknown table'}, {status: 400});
    }
    });
  } catch (err) {
    console.error(`[db/${table}] POST error:`, err);
    return NextResponse.json({error: 'Database error'}, {status: 500});
  }
}

// ---- PATCH (partial update) ----

export async function PATCH(
  req: NextRequest,
  {params}: {params: Promise<{table: string}>},
) {
  const {table} = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({error: 'Invalid JSON'}, {status: 400});
  }

  const athleteId = body.athleteId ? Number(body.athleteId) : null;
  const {response: authErr, athleteId: verifiedAthleteId} = await enforceAuth(req, athleteId);
  if (authErr) return authErr;

  const rlsAthleteId = verifiedAthleteId ?? athleteId;

  try {
    return await withRls(rlsAthleteId, async (db) => {
    if (table === 'user-settings' && athleteId) {
      const patch: Record<string, unknown> = {};
      if ('weight' in body) patch.weight = body.weight;
      if ('city' in body) patch.city = body.city;
      if ('coachModel' in body) patch.coachModel = body.coachModel;
      if (Object.keys(patch).length === 0) return NextResponse.json({ok: true});
      await db
        .update(schema.userSettings)
        .set({...patch, updatedAt: Date.now()})
        .where(eq(schema.userSettings.athleteId, athleteId));
      return NextResponse.json({ok: true});
    }
    return NextResponse.json({error: 'PATCH not supported for this table'}, {status: 400});
    });
  } catch (err) {
    console.error(`[db/${table}] PATCH error:`, err);
    return NextResponse.json({error: 'Database error'}, {status: 500});
  }
}
