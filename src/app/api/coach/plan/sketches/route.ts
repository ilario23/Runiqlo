import {NextRequest, NextResponse} from 'next/server';
import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq, and, desc} from 'drizzle-orm';
import type {WeekSketch, PlannedWorkout} from '@/lib/coachTypes';

export async function GET(req: NextRequest) {
  const athleteId = Number(req.nextUrl.searchParams.get('athleteId'));
  if (!athleteId) return NextResponse.json({error: 'athleteId required'}, {status: 400});

  const db = getDb();

  const planRows = await db
    .select()
    .from(schema.trainingPlan)
    .where(and(eq(schema.trainingPlan.athleteId, athleteId), eq(schema.trainingPlan.isActive, true)))
    .orderBy(desc(schema.trainingPlan.generatedAt))
    .limit(1);

  if (!planRows[0]) return NextResponse.json({weekSketches: null, actualKmByWeek: {}});

  const plan = planRows[0];
  const weekSketches = (plan.weekSketches ?? null) as WeekSketch[] | null;

  // Fetch all weekly plans for this training plan to compute actual km
  const weekRows = await db
    .select()
    .from(schema.weeklyPlan)
    .where(and(eq(schema.weeklyPlan.athleteId, athleteId), eq(schema.weeklyPlan.trainingPlanId, plan.id)));

  const actualKmByWeek: Record<string, number> = {};
  for (const week of weekRows) {
    const days = week.days as Array<{workouts: PlannedWorkout[]}>;
    const km = days
      .flatMap(d => d.workouts)
      .filter(w => w.completed && w.distanceKm != null)
      .reduce((sum, w) => sum + (w.distanceKm ?? 0), 0);
    if (km > 0) actualKmByWeek[week.weekStart] = Math.round(km * 10) / 10;
  }

  return NextResponse.json({weekSketches, actualKmByWeek});
}

export async function PATCH(req: NextRequest) {
  const athleteId = Number(req.nextUrl.searchParams.get('athleteId'));
  if (!athleteId) return NextResponse.json({error: 'athleteId required'}, {status: 400});

  const {weekStart, targetKm} = await req.json();
  if (!weekStart || targetKm == null) {
    return NextResponse.json({error: 'weekStart and targetKm required'}, {status: 400});
  }

  const db = getDb();

  const planRows = await db
    .select()
    .from(schema.trainingPlan)
    .where(and(eq(schema.trainingPlan.athleteId, athleteId), eq(schema.trainingPlan.isActive, true)))
    .orderBy(desc(schema.trainingPlan.generatedAt))
    .limit(1);

  if (!planRows[0]) return NextResponse.json({error: 'No active plan'}, {status: 404});

  const plan = planRows[0];
  const sketches = ((plan.weekSketches ?? []) as WeekSketch[]).map(s =>
    s.weekStart === weekStart ? {...s, targetKm: Number(targetKm)} : s,
  );

  await db
    .update(schema.trainingPlan)
    .set({weekSketches: sketches, updatedAt: Date.now()})
    .where(eq(schema.trainingPlan.id, plan.id));

  return NextResponse.json({success: true});
}
