import {NextRequest, NextResponse} from 'next/server';
import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq, and, gte} from 'drizzle-orm';
import {requireAthlete} from '@/lib/apiAuth';

export async function GET(req: NextRequest) {
  const athleteId = Number(req.nextUrl.searchParams.get('athleteId'));
  if (!athleteId) return NextResponse.json({error: 'athleteId required'}, {status: 400});
  const auth = await requireAthlete(req, athleteId);
  if (!auth.ok) return auth.response;

  // Look back 90 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const db = getDb();
  const rows = await db
    .select({date: schema.activities.date, data: schema.activities.data})
    .from(schema.activities)
    .where(and(eq(schema.activities.athleteId, athleteId), gte(schema.activities.date, cutoffDate)));

  if (!rows.length) return NextResponse.json({peakWeeklyKm: null});

  // Accumulate km by ISO week (YYYY-Www)
  const weeklyKm: Record<string, number> = {};
  for (const row of rows) {
    const d = row.data as {sport_type?: string; type?: string; distance?: number};
    const sportType = d.sport_type ?? d.type ?? '';
    if (!sportType.toLowerCase().includes('run')) continue;
    const distKm = (d.distance ?? 0) / 1000;
    if (distKm <= 0) continue;

    // Derive Monday-anchored week key from date
    const date = new Date(row.date + 'T12:00:00');
    const day = (date.getDay() + 6) % 7; // 0=Mon
    const monday = new Date(date);
    monday.setDate(date.getDate() - day);
    const weekKey = monday.toISOString().slice(0, 10);

    weeklyKm[weekKey] = (weeklyKm[weekKey] ?? 0) + distKm;
  }

  const values = Object.values(weeklyKm);
  if (!values.length) return NextResponse.json({peakWeeklyKm: null});

  const peak = Math.round(Math.max(...values));
  return NextResponse.json({peakWeeklyKm: peak});
}
