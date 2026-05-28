import {NextRequest, NextResponse} from 'next/server';
import {eq} from 'drizzle-orm';
import {getDb} from '@/db';
import * as schema from '@/db/schema';

export async function PATCH(
  req: NextRequest,
  {params}: {params: Promise<{id: string}>},
) {
  const {id: gearId} = await params;
  const body = await req.json() as {athleteId: number; thresholdKm: number | null};

  if (!body.athleteId || !gearId) {
    return NextResponse.json({error: 'athleteId and gearId required'}, {status: 400});
  }

  const db = getDb();

  if (body.thresholdKm === null) {
    await db.delete(schema.gearThresholds).where(eq(schema.gearThresholds.gearId, gearId));
    return NextResponse.json({ok: true});
  }

  const thresholdMeters = Math.round(body.thresholdKm * 1000);

  await db
    .insert(schema.gearThresholds)
    .values({gearId, athleteId: body.athleteId, thresholdMeters, updatedAt: Date.now()})
    .onConflictDoUpdate({
      target: schema.gearThresholds.gearId,
      set: {thresholdMeters, updatedAt: Date.now()},
    });

  return NextResponse.json({ok: true});
}
