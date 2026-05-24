import {NextRequest, NextResponse} from 'next/server';
import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq} from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const athleteId = Number(req.nextUrl.searchParams.get('athleteId'));
  if (!athleteId) return NextResponse.json({error: 'athleteId required'}, {status: 400});

  const db = getDb();
  const rows = await db.select().from(schema.dashboardCache).where(eq(schema.dashboardCache.athleteId, athleteId)).limit(1);
  const cached = rows[0];
  if (!cached) return NextResponse.json(null);

  const data = cached.data as Array<{date: string; bf: number; li: number; tl: number}>;
  if (!data.length) return NextResponse.json(null);

  const latest = data[data.length - 1];
  const tsb = Number((latest.bf - latest.li).toFixed(1));
  const acwr = latest.bf > 0 ? Number((latest.li / latest.bf).toFixed(2)) : 0;
  const tls = data.slice(-35).map(d => d.tl);
  const lastWeekTl = tls.slice(-7).reduce((s, v) => s + v, 0);
  const prior4Avg = tls.slice(-35, -7).reduce((s, v) => s + v, 0) / 4;
  const rampRate = prior4Avg > 0 ? Number((((lastWeekTl - prior4Avg) / prior4Avg) * 100).toFixed(1)) : 0;
  const riskLevel = acwr > 1.5 || rampRate > 15 ? 'HIGH' : acwr > 1.3 || rampRate > 10 || tsb < -20 ? 'MODERATE' : 'LOW';

  return NextResponse.json({ctl: latest.bf, atl: latest.li, tsb, acwr, rampRate, riskLevel});
}
