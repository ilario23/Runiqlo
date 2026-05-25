import {NextRequest, NextResponse} from 'next/server';
import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq, and} from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const athleteId = Number(req.nextUrl.searchParams.get('athleteId'));
  const weekStart = req.nextUrl.searchParams.get('weekStart');
  if (!athleteId || !weekStart) {
    return NextResponse.json({error: 'athleteId and weekStart required'}, {status: 400});
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.weeklyPlan)
    .where(and(eq(schema.weeklyPlan.athleteId, athleteId), eq(schema.weeklyPlan.weekStart, weekStart)))
    .limit(1);

  return NextResponse.json(rows[0] ?? null);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const {athleteId, weekStart, date, workoutIndex, stravaActivityId} = body;

  if (!athleteId || !weekStart || !date || workoutIndex == null || !stravaActivityId) {
    return NextResponse.json({error: 'Missing required fields'}, {status: 400});
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.weeklyPlan)
    .where(and(eq(schema.weeklyPlan.athleteId, athleteId), eq(schema.weeklyPlan.weekStart, weekStart)))
    .limit(1);

  if (!rows[0]) return NextResponse.json({error: 'Weekly plan not found'}, {status: 404});

  const days = rows[0].days as Array<{date: string; workouts: Array<{completed: boolean; linkedStravaActivityId: number | null}>}>;
  const dayIdx = days.findIndex(d => d.date === date);
  if (dayIdx === -1) return NextResponse.json({error: `Day ${date} not found`}, {status: 404});

  const workouts = days[dayIdx].workouts;
  if (workoutIndex >= workouts.length) return NextResponse.json({error: 'Workout index out of range'}, {status: 400});

  workouts[workoutIndex].completed = true;
  workouts[workoutIndex].linkedStravaActivityId = stravaActivityId;

  await db.update(schema.weeklyPlan).set({days}).where(eq(schema.weeklyPlan.id, rows[0].id));
  return NextResponse.json({success: true});
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const {athleteId, weekStart, date, workoutIndex, type, durationMinutes} = body;

  if (!athleteId || !weekStart || !date || workoutIndex == null || !type || durationMinutes == null) {
    return NextResponse.json({error: 'Missing required fields'}, {status: 400});
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.weeklyPlan)
    .where(and(eq(schema.weeklyPlan.athleteId, athleteId), eq(schema.weeklyPlan.weekStart, weekStart)))
    .limit(1);

  if (!rows[0]) return NextResponse.json({error: 'Weekly plan not found'}, {status: 404});

  const days = rows[0].days as Array<{date: string; workouts: Array<{type: string; durationMinutes: number | null}>}>;
  const dayIdx = days.findIndex(d => d.date === date);
  if (dayIdx === -1) return NextResponse.json({error: `Day ${date} not found`}, {status: 404});

  const workouts = days[dayIdx].workouts;
  if (workoutIndex >= workouts.length) return NextResponse.json({error: 'Workout index out of range'}, {status: 400});

  workouts[workoutIndex].type = type;
  workouts[workoutIndex].durationMinutes = durationMinutes;

  await db.update(schema.weeklyPlan).set({days}).where(eq(schema.weeklyPlan.id, rows[0].id));
  return NextResponse.json({success: true});
}
