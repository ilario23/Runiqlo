import {NextRequest, NextResponse} from 'next/server';
import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq} from 'drizzle-orm';
import type {PlannedDay, PlannedWorkout} from '@/lib/coachTypes';
import {requireAthlete} from '@/lib/apiAuth';

export type AdherenceData = {
  plannedWorkout: PlannedWorkout;
  weekStart: string;
  plannedDate: string;
  zoneBreakdown: Record<string, {time: number; distance: number}> | null;
};

export async function GET(req: NextRequest) {
  const activityId = Number(req.nextUrl.searchParams.get('activityId'));
  const athleteId = Number(req.nextUrl.searchParams.get('athleteId'));

  if (!activityId || !athleteId) {
    return NextResponse.json({error: 'activityId and athleteId required'}, {status: 400});
  }
  const auth = await requireAthlete(req, athleteId);
  if (!auth.ok) return auth.response;

  const db = getDb();
  const planRows = await db
    .select()
    .from(schema.weeklyPlan)
    .where(eq(schema.weeklyPlan.athleteId, athleteId));

  let found: {plannedWorkout: PlannedWorkout; weekStart: string; plannedDate: string} | null = null;

  outer: for (const row of planRows) {
    const days = row.days as PlannedDay[];
    for (const day of days) {
      for (const workout of day.workouts) {
        if (workout.linkedStravaActivityId === activityId) {
          found = {plannedWorkout: workout, weekStart: row.weekStart, plannedDate: day.date};
          break outer;
        }
      }
    }
  }

  if (!found) return NextResponse.json(null);

  const zoneRows = await db
    .select()
    .from(schema.zoneBreakdowns)
    .where(eq(schema.zoneBreakdowns.activityId, activityId))
    .limit(1);

  const zoneBreakdown = zoneRows[0]
    ? (zoneRows[0].zones as Record<string, {time: number; distance: number}>)
    : null;

  return NextResponse.json({...found, zoneBreakdown} satisfies AdherenceData);
}
