import {NextRequest, NextResponse} from 'next/server';
import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq, and, gte, lte} from 'drizzle-orm';
import {safeTransformActivity, type StravaSummaryActivity} from '@/lib/strava';
import {requireAthlete} from '@/lib/apiAuth';

const RUN_PLAN_TYPES = new Set(['easy_run', 'long_run', 'tempo_run', 'interval_run', 'recovery_run']);

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function extractLocalTime(startDateLocal: string | undefined): string | null {
  if (!startDateLocal) return null;
  const match = startDateLocal.match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = match[2];
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${period}`;
}

function formatPace(paceDecimalMin: number): string {
  if (!paceDecimalMin || paceDecimalMin <= 0) return '';
  const m = Math.floor(paceDecimalMin);
  const s = Math.round((paceDecimalMin - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function typeMatches(plannedType: string, candidateType: string): boolean {
  if (RUN_PLAN_TYPES.has(plannedType) && candidateType === 'Run') return true;
  if (plannedType === 'cycling' && candidateType === 'Ride') return true;
  if (plannedType === 'cross_training' && (candidateType === 'Hike' || candidateType === 'Swim')) return true;
  return false;
}

function scoreCandidate(
  candidate: {distanceKm: number; durationMin: number; type: string; date: string},
  targetDate: string,
  plannedType: string,
  plannedDistance: number | null,
  plannedDuration: number | null,
): number {
  let score = 0;

  // Date proximity
  if (candidate.date === targetDate) score += 10;
  else score += 3;

  // Type match
  if (typeMatches(plannedType, candidate.type)) score += 6;

  // Distance match (only meaningful for distance-based workouts)
  if (plannedDistance && candidate.distanceKm > 0) {
    const ratio = candidate.distanceKm / plannedDistance;
    if (ratio >= 0.9 && ratio <= 1.15) score += 5;
    else if (ratio >= 0.75 && ratio <= 1.3) score += 2;
  }

  // Duration match
  if (plannedDuration && candidate.durationMin > 0) {
    const ratio = candidate.durationMin / plannedDuration;
    if (ratio >= 0.85 && ratio <= 1.2) score += 3;
  }

  return score;
}

export async function GET(req: NextRequest) {
  const athleteId = Number(req.nextUrl.searchParams.get('athleteId'));
  const date = req.nextUrl.searchParams.get('date');
  const plannedType = req.nextUrl.searchParams.get('plannedType') ?? '';
  const plannedDistance = req.nextUrl.searchParams.get('plannedDistance');
  const plannedDuration = req.nextUrl.searchParams.get('plannedDuration');

  if (!athleteId || !date) {
    return NextResponse.json({error: 'athleteId and date required'}, {status: 400});
  }
  const auth = await requireAthlete(req, athleteId);
  if (!auth.ok) return auth.response;

  const startStr = addDays(date, -1);
  const endStr = addDays(date, 1);

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.activities)
    .where(
      and(
        eq(schema.activities.athleteId, athleteId),
        gte(schema.activities.date, startStr),
        lte(schema.activities.date, endStr),
      ),
    );

  // Build set of already-linked activity IDs across all weekly plans
  const planRows = await db
    .select()
    .from(schema.weeklyPlan)
    .where(eq(schema.weeklyPlan.athleteId, athleteId));

  const linkedIds = new Set<number>();
  for (const plan of planRows) {
    const days = plan.days as Array<{workouts: Array<{linkedStravaActivityId: number | null}>}>;
    for (const day of days) {
      for (const w of day.workouts) {
        if (w.linkedStravaActivityId) linkedIds.add(w.linkedStravaActivityId);
      }
    }
  }

  const plannedDistanceNum = plannedDistance ? Number(plannedDistance) : null;
  const plannedDurationNum = plannedDuration ? Number(plannedDuration) : null;

  type Candidate = {
    id: number;
    name: string;
    type: string;
    date: string;
    distanceKm: number;
    durationMin: number;
    avgPace: string;
    startTime: string | null;
    matchScore: number;
    isBestMatch: boolean;
    alreadyLinked: boolean;
  };

  const candidates: Candidate[] = [];
  for (const r of rows) {
    const a = safeTransformActivity(r.data);
    if (!a) continue;
    const raw = r.data as Partial<StravaSummaryActivity>;
    const distanceKm = Number(a.distance.toFixed(2));
    const durationMin = Math.round(a.duration / 60);
    const score = scoreCandidate(
      {distanceKm, durationMin, type: a.type, date: a.date},
      date,
      plannedType,
      plannedDistanceNum,
      plannedDurationNum,
    );
    candidates.push({
      id: Number(a.id),
      name: a.name,
      type: a.type,
      date: a.date,
      distanceKm,
      durationMin,
      avgPace: formatPace(a.avgPace),
      startTime: extractLocalTime(raw.start_date_local),
      matchScore: score,
      isBestMatch: false,
      alreadyLinked: linkedIds.has(Number(a.id)),
    });
  }

  // Sort by score desc, then by recency (date desc)
  candidates.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return b.date.localeCompare(a.date);
  });

  // Mark best match only if the top candidate scored clearly above a useful threshold
  // and isn't already linked
  const topUnlinked = candidates.find(c => !c.alreadyLinked);
  if (topUnlinked && topUnlinked.matchScore >= 13) {
    topUnlinked.isBestMatch = true;
  }

  return NextResponse.json({candidates, date});
}
