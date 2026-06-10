import {NextRequest, NextResponse} from 'next/server';
import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq, and, isNotNull, gte, lte, desc} from 'drizzle-orm';
import {sql} from 'drizzle-orm';
import {requireAthlete} from '@/lib/apiAuth';

export type DecouplingPoint = {
  activityId: number;
  date: string;
  name: string;
  durationMins: number;
  decouplingPct: number;
};

export async function GET(req: NextRequest) {
  const {searchParams} = req.nextUrl;
  const athleteId = Number(searchParams.get('athleteId'));
  const from = searchParams.get('from'); // YYYY-MM-DD
  const to = searchParams.get('to');     // YYYY-MM-DD

  if (!athleteId) return NextResponse.json({error: 'athleteId required'}, {status: 400});
  const auth = await requireAthlete(req, athleteId);
  if (!auth.ok) return auth.response;

  const db = getDb();

  const fromDate = from ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 84); // 12 weeks
    return d.toISOString().slice(0, 10);
  })();
  const toDate = to ?? new Date().toISOString().slice(0, 10);

  // Fetch zone_breakdowns with non-null decoupling, joined with activities for date/name
  const zbRows = await db
    .select({
      activityId: schema.zoneBreakdowns.activityId,
      decouplingPct: schema.zoneBreakdowns.decouplingPct,
    })
    .from(schema.zoneBreakdowns)
    .where(
      and(
        eq(schema.zoneBreakdowns.athleteId, athleteId),
        isNotNull(schema.zoneBreakdowns.decouplingPct),
      ),
    );

  if (zbRows.length === 0) return NextResponse.json([]);

  const activityIds = zbRows.map((r) => r.activityId);
  const decoupMap = new Map(zbRows.map((r) => [r.activityId, r.decouplingPct as number]));

  // Fetch matching activities within date range
  const actRows = await db
    .select({
      id: schema.activities.id,
      date: schema.activities.date,
      data: schema.activities.data,
    })
    .from(schema.activities)
    .where(
      and(
        eq(schema.activities.athleteId, athleteId),
        gte(schema.activities.date, fromDate),
        lte(schema.activities.date, toDate),
        sql`${schema.activities.id} = ANY(ARRAY[${sql.raw(activityIds.join(','))}]::bigint[])`,
      ),
    )
    .orderBy(desc(schema.activities.date));

  const MIN_DURATION_SECS = 45 * 60;

  const points: DecouplingPoint[] = actRows
    .filter((r) => {
      const d = r.data as {sport_type?: string; type?: string; moving_time?: number};
      const sport = d.sport_type ?? d.type ?? '';
      const isRun = sport.toLowerCase().includes('run');
      const longEnough = (d.moving_time ?? 0) >= MIN_DURATION_SECS;
      return isRun && longEnough;
    })
    .map((r) => {
      const d = r.data as {name?: string; moving_time?: number};
      return {
        activityId: Number(r.id),
        date: r.date,
        name: d.name ?? 'Run',
        durationMins: Math.round((d.moving_time ?? 0) / 60),
        decouplingPct: decoupMap.get(Number(r.id)) ?? 0,
      };
    });

  return NextResponse.json(points);
}
