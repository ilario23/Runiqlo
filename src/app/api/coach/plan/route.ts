import {NextRequest, NextResponse} from 'next/server';
import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq, and, desc} from 'drizzle-orm';
import {requireAthlete} from '@/lib/apiAuth';


export async function GET(req: NextRequest) {
  const athleteId = Number(req.nextUrl.searchParams.get('athleteId'));
  if (!athleteId) return NextResponse.json({error: 'athleteId required'}, {status: 400});
  const auth = await requireAthlete(req, athleteId);
  if (!auth.ok) return auth.response;

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.trainingPlan)
    .where(and(eq(schema.trainingPlan.athleteId, athleteId), eq(schema.trainingPlan.isActive, true)))
    .orderBy(desc(schema.trainingPlan.generatedAt))
    .limit(1);

  return NextResponse.json(rows[0] ?? null);
}

export async function PUT(req: NextRequest) {
  const {athleteId, restorePlanId} = await req.json() as {athleteId: number; restorePlanId: number};
  if (!athleteId || !restorePlanId) {
    return NextResponse.json({error: 'athleteId and restorePlanId required'}, {status: 400});
  }
  const auth = await requireAthlete(req, athleteId);
  if (!auth.ok) return auth.response;

  const db = getDb();
  await db
    .update(schema.trainingPlan)
    .set({isActive: false})
    .where(eq(schema.trainingPlan.athleteId, athleteId));

  await db
    .update(schema.trainingPlan)
    .set({isActive: true})
    .where(and(eq(schema.trainingPlan.athleteId, athleteId), eq(schema.trainingPlan.id, restorePlanId)));

  return NextResponse.json({ok: true});
}

export async function DELETE(req: NextRequest) {
  const athleteId = Number(req.nextUrl.searchParams.get('athleteId'));
  const planId = Number(req.nextUrl.searchParams.get('planId'));
  if (!athleteId || !planId) {
    return NextResponse.json({error: 'athleteId and planId required'}, {status: 400});
  }
  const auth = await requireAthlete(req, athleteId);
  if (!auth.ok) return auth.response;
  const db = getDb();
  await db
    .delete(schema.weeklyPlan)
    .where(eq(schema.weeklyPlan.trainingPlanId, planId));
  await db
    .delete(schema.trainingPlan)
    .where(and(eq(schema.trainingPlan.athleteId, athleteId), eq(schema.trainingPlan.id, planId)));
  return NextResponse.json({ok: true});
}
