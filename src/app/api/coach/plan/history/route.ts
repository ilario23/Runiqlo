import {NextRequest, NextResponse} from 'next/server';
import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq, desc} from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const athleteId = Number(req.nextUrl.searchParams.get('athleteId'));
  if (!athleteId) return NextResponse.json({error: 'athleteId required'}, {status: 400});

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.trainingPlan)
    .where(eq(schema.trainingPlan.athleteId, athleteId))
    .orderBy(desc(schema.trainingPlan.generatedAt));

  return NextResponse.json(rows);
}
