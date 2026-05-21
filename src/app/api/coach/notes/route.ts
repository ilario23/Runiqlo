import {NextRequest, NextResponse} from 'next/server';
import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq} from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const athleteId = Number(req.nextUrl.searchParams.get('athleteId'));
  if (!athleteId) return NextResponse.json({error: 'athleteId required'}, {status: 400});

  const db = getDb();
  const rows = await db.select().from(schema.athleteNotes).where(eq(schema.athleteNotes.athleteId, athleteId)).limit(1);
  return NextResponse.json(rows[0] ?? null);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {athleteId, injuryHistory, preferences, responsePatterns, freeformNotes} = body;

  if (!athleteId) {
    return NextResponse.json({error: 'athleteId required'}, {status: 400});
  }

  const db = getDb();
  const now = Date.now();

  const existing = await db
    .select()
    .from(schema.athleteNotes)
    .where(eq(schema.athleteNotes.athleteId, athleteId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(schema.athleteNotes)
      .set({
        injuryHistory: injuryHistory ?? existing[0].injuryHistory,
        preferences: preferences ?? existing[0].preferences,
        responsePatterns: responsePatterns ?? existing[0].responsePatterns,
        freeformNotes: freeformNotes !== undefined ? freeformNotes : existing[0].freeformNotes,
        lastUpdatedAt: now,
      })
      .where(eq(schema.athleteNotes.athleteId, athleteId));
  } else {
    await db.insert(schema.athleteNotes).values({
      athleteId,
      injuryHistory: injuryHistory ?? [],
      preferences: preferences ?? {},
      responsePatterns: responsePatterns ?? {},
      freeformNotes: freeformNotes ?? null,
      lastUpdatedAt: now,
    });
  }

  const rows = await db.select().from(schema.athleteNotes).where(eq(schema.athleteNotes.athleteId, athleteId)).limit(1);
  return NextResponse.json(rows[0]);
}
