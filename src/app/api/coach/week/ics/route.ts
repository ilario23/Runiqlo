import {NextRequest} from 'next/server';
import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq, and, gte, asc} from 'drizzle-orm';
import {generateIcs} from '@/lib/icsGenerator';
import type {WeeklyPlan} from '@/lib/coachTypes';

function getThisMonday(): string {
  const d = new Date();
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function GET(req: NextRequest) {
  const athleteId = Number(req.nextUrl.searchParams.get('athleteId'));
  const weekStart = req.nextUrl.searchParams.get('weekStart');
  const mode = req.nextUrl.searchParams.get('mode');

  if (!athleteId) {
    return new Response('athleteId required', {status: 400});
  }

  const db = getDb();
  let plans: WeeklyPlan[];
  let isSubscribe = false;

  if (mode === 'subscribe') {
    isSubscribe = true;
    const todayMonday = getThisMonday();
    const rows = await db
      .select()
      .from(schema.weeklyPlan)
      .where(and(eq(schema.weeklyPlan.athleteId, athleteId), gte(schema.weeklyPlan.weekStart, todayMonday)))
      .orderBy(asc(schema.weeklyPlan.weekStart));
    plans = rows as unknown as WeeklyPlan[];
  } else {
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return new Response('weekStart required (YYYY-MM-DD)', {status: 400});
    }
    const rows = await db
      .select()
      .from(schema.weeklyPlan)
      .where(and(eq(schema.weeklyPlan.athleteId, athleteId), eq(schema.weeklyPlan.weekStart, weekStart)))
      .limit(1);
    plans = rows as unknown as WeeklyPlan[];
  }

  const calendarName =
    plans.length === 1
      ? `Week ${plans[0].weekNumber} · ${plans[0].phase} phase`
      : 'Training Plan';

  const icsContent = generateIcs({athleteId, plans, calendarName});
  const filename = isSubscribe ? 'training-plan.ics' : `training-week-${weekStart}.ics`;

  return new Response(icsContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': isSubscribe ? 'inline' : `attachment; filename="${filename}"`,
      'Cache-Control': isSubscribe ? 'max-age=3600' : 'no-store',
    },
  });
}
