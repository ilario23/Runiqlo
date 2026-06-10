import {NextRequest, NextResponse} from 'next/server';
import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq} from 'drizzle-orm';
import {requireAthlete} from '@/lib/apiAuth';

export async function GET(req: NextRequest) {
  const athleteId = Number(req.nextUrl.searchParams.get('athleteId'));
  if (!athleteId) return NextResponse.json({error: 'athleteId required'}, {status: 400});
  const auth = await requireAthlete(req, athleteId);
  if (!auth.ok) return auth.response;

  const db = getDb();
  const rows = await db.select().from(schema.coachGoal).where(eq(schema.coachGoal.athleteId, athleteId)).limit(1);
  return NextResponse.json(rows[0] ?? null);
}
