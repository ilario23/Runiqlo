import {NextRequest, NextResponse} from 'next/server';
import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq, and} from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const athleteId = Number(req.nextUrl.searchParams.get('athleteId'));
  if (!athleteId) return NextResponse.json({error: 'athleteId required'}, {status: 400});

  const db = getDb();
  const rows = await db.select().from(schema.coachGoal).where(eq(schema.coachGoal.athleteId, athleteId)).limit(1);
  return NextResponse.json(rows[0] ?? null);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {athleteId, goalType, targetDate, targetEventName, targetTimeMinutes, recentPeakWeeklyKm, experienceLevel, injuryHistory, additionalNotes} = body;

  if (!athleteId || !goalType) {
    return NextResponse.json({error: 'athleteId and goalType required'}, {status: 400});
  }

  const db = getDb();
  const now = Date.now();

  // Deactivate old plan when goal changes
  await db
    .update(schema.trainingPlan)
    .set({isActive: false, updatedAt: now})
    .where(and(eq(schema.trainingPlan.athleteId, athleteId), eq(schema.trainingPlan.isActive, true)));

  const existing = await db
    .select()
    .from(schema.coachGoal)
    .where(eq(schema.coachGoal.athleteId, athleteId))
    .limit(1);

  const fields = {
    goalType,
    targetDate: targetDate ?? null,
    targetEventName: targetEventName ?? null,
    targetTimeMinutes: targetTimeMinutes ?? null,
    recentPeakWeeklyKm: recentPeakWeeklyKm ?? null,
    experienceLevel: experienceLevel ?? 'intermediate',
    injuryHistory: injuryHistory ?? null,
    additionalNotes: additionalNotes ?? null,
  };

  if (existing[0]) {
    await db
      .update(schema.coachGoal)
      .set({...fields, updatedAt: now})
      .where(eq(schema.coachGoal.athleteId, athleteId));
  } else {
    await db.insert(schema.coachGoal).values({
      athleteId,
      ...fields,
      createdAt: now,
      updatedAt: now,
    });
  }

  const goal = await db.select().from(schema.coachGoal).where(eq(schema.coachGoal.athleteId, athleteId)).limit(1);
  return NextResponse.json(goal[0]);
}
