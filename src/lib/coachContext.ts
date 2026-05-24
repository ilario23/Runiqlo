import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq, and, desc} from 'drizzle-orm';
import type {TrainingPhase} from './coachTypes';

const promptCache = new Map<number, {prompt: string; expiresAt: number}>();
const CACHE_TTL_MS = 60_000;

export function invalidateCoachPromptCache(athleteId: number): void {
  promptCache.delete(athleteId);
}

function getMonday(date: Date = new Date()): string {
  const d = new Date(date);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function weeksUntil(targetDate: string): number {
  const diff = new Date(targetDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24 * 7));
}

export async function buildCoachSystemPrompt(athleteId: number): Promise<string> {
  const cached = promptCache.get(athleteId);
  if (cached && cached.expiresAt > Date.now()) return cached.prompt;

  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const weekday = new Date().toLocaleDateString('en-US', {weekday: 'long'});
  const currentMonday = getMonday();

  const [goalRows, planRows, weekRows, notesRows, cacheRows, statsRows] = await Promise.all([
    db.select().from(schema.coachGoal).where(eq(schema.coachGoal.athleteId, athleteId)).limit(1),
    db
      .select()
      .from(schema.trainingPlan)
      .where(and(eq(schema.trainingPlan.athleteId, athleteId), eq(schema.trainingPlan.isActive, true)))
      .orderBy(desc(schema.trainingPlan.generatedAt))
      .limit(1),
    db
      .select()
      .from(schema.weeklyPlan)
      .where(and(eq(schema.weeklyPlan.athleteId, athleteId), eq(schema.weeklyPlan.weekStart, currentMonday)))
      .limit(1),
    db.select().from(schema.athleteNotes).where(eq(schema.athleteNotes.athleteId, athleteId)).limit(1),
    db.select().from(schema.dashboardCache).where(eq(schema.dashboardCache.athleteId, athleteId)).limit(1),
    db.select().from(schema.athleteStats).where(eq(schema.athleteStats.athleteId, athleteId)).limit(1),
  ]);

  // Athlete name
  let athleteName = 'Athlete';
  if (statsRows[0]) {
    const d = statsRows[0].data as Record<string, unknown>;
    if (typeof d.firstname === 'string') athleteName = d.firstname;
  }

  // ── Fitness snapshot ────────────────────────────────────────────────────────
  let fitnessSection = 'No fitness data available (athlete needs to sync activities).';
  const cache = cacheRows[0];
  if (cache) {
    const data = cache.data as Array<{date: string; bf: number; li: number; tl: number}>;
    if (data.length > 0) {
      const latest = data[data.length - 1];
      const tsb = Number((latest.bf - latest.li).toFixed(1));
      const acwr = latest.bf > 0 ? Number((latest.li / latest.bf).toFixed(2)) : 0;
      const tls = data.slice(-35).map(d => d.tl);
      const lastWeek = tls.slice(-7).reduce((s, v) => s + v, 0);
      const prior4 = tls.slice(-35, -7).reduce((s, v) => s + v, 0) / 4;
      const rampRate = prior4 > 0 ? Number((((lastWeek - prior4) / prior4) * 100).toFixed(1)) : 0;
      const risk = acwr > 1.5 || rampRate > 15 ? 'HIGH' : acwr > 1.3 || rampRate > 10 || tsb < -20 ? 'MODERATE' : 'LOW';
      fitnessSection = `CTL: ${latest.bf} | ATL: ${latest.li} | TSB: ${tsb} | ACWR: ${acwr} | Ramp: ${rampRate}% | Risk: ${risk}
Form: ${tsb > 5 ? 'Fresh' : tsb > -10 ? 'Neutral' : tsb > -20 ? 'Fatigued' : 'Very fatigued — recovery priority'}`;
    }
  }

  // ── Goal ────────────────────────────────────────────────────────────────────
  let goalSection = 'No goal set yet — prompt the athlete to define one.';
  const goal = goalRows[0];
  if (goal) {
    const labels: Record<string, string> = {
      marathon: 'Marathon', half_marathon: 'Half Marathon',
      '10k': '10K', '5k': '5K', general_fitness: 'General Fitness',
    };
    goalSection = `Goal: ${labels[goal.goalType] ?? goal.goalType}`;
    if (goal.targetEventName) goalSection += ` — ${goal.targetEventName}`;
    if (goal.targetDate) {
      const wks = weeksUntil(goal.targetDate);
      goalSection += `\nDate: ${goal.targetDate} (${wks > 0 ? wks + ' weeks away' : 'PAST'})`;
    }
    if ((goal as any).targetTimeMinutes) {
      const ttm = (goal as any).targetTimeMinutes as number;
      const h = Math.floor(ttm / 60);
      const m = ttm % 60;
      goalSection += `\nTarget time: ${h}:${String(m).padStart(2, '0')} (${ttm} min)`;
    } else {
      goalSection += `\nTarget time: not set — estimate from best efforts or ask the athlete`;
    }
    if ((goal as any).recentPeakWeeklyKm) {
      goalSection += `\nRecent peak weekly km: ${(goal as any).recentPeakWeeklyKm} km`;
    }
    goalSection += `\nLevel: ${goal.experienceLevel}`;
    if (goal.injuryHistory) goalSection += `\nInjury history: ${goal.injuryHistory}`;
    if (goal.additionalNotes) goalSection += `\nNotes: ${goal.additionalNotes}`;
  }

  // ── Training plan ────────────────────────────────────────────────────────────
  let planSection = 'No training plan — create one with saveTrainingPlan.';
  const plan = planRows[0];
  if (plan) {
    const phases = plan.phases as TrainingPhase[];
    // Derive current phase from today's date — stored index can be stale
    const actualPhaseIndex = phases.findIndex(p => today >= p.startDate && today <= p.endDate);
    const currentPhaseIndex = actualPhaseIndex !== -1 ? actualPhaseIndex : plan.currentPhaseIndex;
    const cur = phases[currentPhaseIndex];
    const totalWeeks = phases.reduce((s, p) => s + p.weekCount, 0);
    planSection = `Phase: ${cur?.phase ?? '?'} (${currentPhaseIndex + 1}/${phases.length} phases, ${totalWeeks} total weeks) — "${cur?.focusDescription ?? ''}"
Volume target: ${cur?.targetWeeklyKmRange?.[0]}–${cur?.targetWeeklyKmRange?.[1]} km/wk
Key workouts: ${cur?.keyWorkouts?.join(', ') ?? 'none'}
Full plan: ${phases.map(p => `${p.phase}(${p.weekCount}wk)`).join(' → ')}`;
  }

  // ── This week ────────────────────────────────────────────────────────────────
  let weekSection = 'No plan for this week — generate one with saveWeeklyPlan.';
  const week = weekRows[0];
  if (week) {
    const days = week.days as Array<{date: string; dayOfWeek: number; workouts: Array<{type: string; distanceKm?: number; durationMinutes?: number; completed?: boolean}>}>;
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const lines = days.map(d => {
      const isPast = d.date < today;
      const isToday = d.date === today;
      const prefix = isPast ? '[done] ' : isToday ? '[TODAY] ' : '';
      if (!d.workouts.length) return `${prefix}${dayNames[d.dayOfWeek]}: Rest`;
      const ws = d.workouts.map(w => {
        let s = w.type.replace(/_/g, ' ');
        if (w.distanceKm) s += ` ${w.distanceKm}km`;
        else if (w.durationMinutes) s += ` ${w.durationMinutes}min`;
        if (w.completed) s += ' ✓';
        return s;
      });
      return `${prefix}${dayNames[d.dayOfWeek]}: ${ws.join(' + ')}`;
    });
    weekSection = `Week ${week.weekNumber} (${week.phase}):\n${lines.join('\n')}`;
    if (week.coachNotes) weekSection += `\nCoach note: ${week.coachNotes}`;
    weekSection += `\nIMPORTANT: When modifying this week, treat [done] days as fixed — do not change them.`;
  }

  // ── Athlete notes ─────────────────────────────────────────────────────────
  let notesSection = 'No accumulated knowledge yet.';
  const notes = notesRows[0];
  if (notes) {
    const parts: string[] = [];
    const injuries = notes.injuryHistory as Array<{bodyPart: string; severity: string; resolved: boolean}>;
    if (injuries.length > 0) {
      parts.push('Injuries: ' + injuries.slice(-3).map(i => `${i.bodyPart} (${i.severity}, ${i.resolved ? 'resolved' : 'active'})`).join(', '));
    }
    const prefs = notes.preferences as Record<string, string>;
    if (Object.keys(prefs).length) parts.push('Preferences: ' + Object.entries(prefs).map(([k, v]) => `${k}=${v}`).join(', '));
    const patterns = notes.responsePatterns as Record<string, string>;
    if (Object.keys(patterns).length) parts.push('Responses: ' + Object.entries(patterns).map(([k, v]) => `${k}=${v}`).join(', '));
    if (notes.freeformNotes) parts.push(notes.freeformNotes);
    if (parts.length) notesSection = parts.join('\n');
  }

  const prompt = `You are an expert running coach and personal trainer for ${athleteName}. You combine exercise physiology, periodization science, and athlete psychology to deliver personalised, evidence-based coaching.

## Coaching Philosophy
- Periodization: Base → Build → Peak → Taper
- Mixed modality: running + gym strength + cycling (low-impact aerobic) + yoga/mobility + rest
- Injury prevention first: always check TSB and ACWR before prescribing hard sessions
- Explain your reasoning so the athlete learns and stays motivated
- Be honest about risk; don't just tell the athlete what they want to hear

## Current Fitness (${today})
${fitnessSection}

## Goal
${goalSection}

## Training Plan
${planSection}

## This Week (${currentMonday})
${weekSection}

## Athlete Knowledge
${notesSection}

## Tool Usage Rules
- Call getFitnessSummary before making any load/intensity decisions
- Call getRecentActivities before generating any weekly plan
- ALWAYS call saveWeeklyPlan after generating a weekly schedule — never just describe it in text
- ALWAYS call saveTrainingPlan after generating a macro plan
- Call updateAthleteNotes when you learn anything new about the athlete
- Call linkCompletedActivity when the athlete mentions completing a workout with a Strava ID
- Call askQuestion when you need the athlete to choose between 2–4 discrete options before you can proceed (e.g. goal distance, preferred long-run day, subjective fatigue level). Do not repeat the question in free text after calling this tool — just wait for the reply.
- Before generating a weekly plan, ask how many days are available that specific week — availability varies. Use askQuestion with options like "3 days", "4 days", "5 days", "6 days".
- When modifying a week mid-week: check the [done] days in the week section above — those are already completed and MUST NOT be changed. Only propose changes to remaining days.
- Format workouts precisely: type + distance or duration + target zone + specific instructions

## Preference Collection (REQUIRED before creating any training plan)
Before calling saveTrainingPlan, check the Athlete Knowledge section above for these preferences. For each one that is MISSING:
1. preferred_long_run_day — call askQuestion: "Which day works best for your weekly long run?" with options [Saturday, Sunday, Weekday/Flexible]. Then call updateAthleteNotes with {"preferences": {"preferred_long_run_day": "<answer>"}} BEFORE proceeding.
2. gym_access — call askQuestion: "Do you have regular gym access for strength training?" with options [Yes, No]. Then call updateAthleteNotes with {"preferences": {"gym_access": "<yes/no>"}} BEFORE proceeding.
Do NOT skip these steps even if the athlete has explicitly asked you to start building the plan. Gather both preferences first, then proceed.

## Long Run & Gym Scheduling Rule
When generating any weekly plan (saveWeeklyPlan):
- Always schedule the long_run workout on the athlete's preferred_long_run_day (Saturday = dayOfWeek 5, Sunday = dayOfWeek 6, Weekday = coach's choice Mon–Fri).
- If gym_access is "no" or "false", replace all gym workouts with cross_training or rest — never prescribe gym sessions.
- If preferred_long_run_day is not yet set, default to Saturday and note it in coachNotes.
${goal ? '' : `
## ONBOARDING MODE (no goal saved yet — start here)
This athlete has no goal yet. Run them through onboarding now via chat. One question per turn — never bundle multiple questions in one message. Use askQuestion (multi-choice, max 4 options) for structured choices; plain chat for dates, times and free text.

Sequence:
1. Greet warmly in one short sentence ("Welcome — let's set up your training together.") — then immediately ask the first question.
2. askQuestion: "What's your training focus?" → ["Race goal", "General fitness"]
3. If "Race goal": askQuestion "Which distance?" → ["Marathon", "Half Marathon", "10K", "5K"]
4. askQuestion: "Your experience level?" → ["Beginner", "Intermediate", "Advanced"]
5. askQuestion: "Preferred long run day?" → ["Saturday", "Sunday", "Weekday / Flexible"]
6. askQuestion: "Gym access for strength?" → ["Yes", "No"]
7. If race goal: in plain chat, ask for the target race date (accept any natural format and convert to YYYY-MM-DD).
8. If race goal: in plain chat, ask for the target finish time (accept "3:45", "sub 4h", etc — convert to minutes).
9. In plain chat, briefly ask about injury history (one line, optional — accept "none").
10. Call getPeakWeeklyKm to compute their recent peak weekly volume from Strava.
11. Call setGoal with all structured fields gathered.
12. Call updateAthleteNotes with {"preferences": {"preferred_long_run_day": "...", "gym_access": "true|false"}} and any injury entries.
13. Briefly confirm what you've saved in 2–3 lines, then ask if they're ready for you to generate the periodized training plan now.

Do NOT call saveTrainingPlan during onboarding — wait for explicit confirmation in step 13.
`}

Today: ${today} (${weekday}) | Week start: ${currentMonday}`;

  promptCache.set(athleteId, {prompt, expiresAt: Date.now() + CACHE_TTL_MS});
  return prompt;
}
