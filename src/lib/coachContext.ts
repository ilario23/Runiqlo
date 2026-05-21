import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq, and, desc} from 'drizzle-orm';
import type {TrainingPhase} from './coachTypes';

const promptCache = new Map<number, {prompt: string; expiresAt: number}>();
const CACHE_TTL_MS = 60_000;

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
    goalSection += `\nAvailable: ${goal.weeklyHoursAvailable}h/week | Level: ${goal.experienceLevel}`;
    if (goal.injuryHistory) goalSection += `\nInjury history: ${goal.injuryHistory}`;
    if (goal.additionalNotes) goalSection += `\nNotes: ${goal.additionalNotes}`;
  }

  // ── Training plan ────────────────────────────────────────────────────────────
  let planSection = 'No training plan — create one with saveTrainingPlan.';
  const plan = planRows[0];
  if (plan) {
    const phases = plan.phases as TrainingPhase[];
    const cur = phases[plan.currentPhaseIndex];
    const totalWeeks = phases.reduce((s, p) => s + p.weekCount, 0);
    planSection = `Phase: ${cur?.phase ?? '?'} (week ${plan.currentPhaseIndex + 1}/${totalWeeks}) — "${cur?.focusDescription ?? ''}"
Volume target: ${cur?.targetWeeklyKmRange?.[0]}–${cur?.targetWeeklyKmRange?.[1]} km/wk
Key workouts: ${cur?.keyWorkouts?.join(', ') ?? 'none'}
Full plan: ${phases.map(p => `${p.phase}(${p.weekCount}wk)`).join(' → ')}`;
  }

  // ── This week ────────────────────────────────────────────────────────────────
  let weekSection = 'No plan for this week — generate one with saveWeeklyPlan.';
  const week = weekRows[0];
  if (week) {
    const days = week.days as Array<{dayOfWeek: number; workouts: Array<{type: string; distanceKm?: number; durationMinutes?: number; completed?: boolean}>}>;
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const lines = days.map(d => {
      if (!d.workouts.length) return `${dayNames[d.dayOfWeek]}: Rest`;
      const ws = d.workouts.map(w => {
        let s = w.type.replace(/_/g, ' ');
        if (w.distanceKm) s += ` ${w.distanceKm}km`;
        else if (w.durationMinutes) s += ` ${w.durationMinutes}min`;
        if (w.completed) s += ' ✓';
        return s;
      });
      return `${dayNames[d.dayOfWeek]}: ${ws.join(' + ')}`;
    });
    weekSection = `Week ${week.weekNumber} (${week.phase}):\n${lines.join('\n')}`;
    if (week.coachNotes) weekSection += `\nCoach note: ${week.coachNotes}`;
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
- Format workouts precisely: type + distance or duration + target zone + specific instructions

Today: ${today} (${weekday}) | Week start: ${currentMonday}`;

  promptCache.set(athleteId, {prompt, expiresAt: Date.now() + CACHE_TTL_MS});
  return prompt;
}
