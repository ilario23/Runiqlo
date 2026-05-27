import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq, and, desc, gte, lt} from 'drizzle-orm';
import type {TrainingPhase, WeekSketch, PlannedWorkout} from './coachTypes';

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

  const threeWeeksAgo = (() => {
    const d = new Date(currentMonday + 'T00:00:00');
    d.setDate(d.getDate() - 21);
    return d.toISOString().slice(0, 10);
  })();

  const [goalRows, planRows, weekRows, notesRows, cacheRows, statsRows, recentWeekRows] = await Promise.all([
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
    db
      .select()
      .from(schema.weeklyPlan)
      .where(
        and(
          eq(schema.weeklyPlan.athleteId, athleteId),
          gte(schema.weeklyPlan.weekStart, threeWeeksAgo),
          lt(schema.weeklyPlan.weekStart, currentMonday),
        ),
      )
      .orderBy(desc(schema.weeklyPlan.weekStart))
      .limit(3),
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
    const data = cache.data as Array<{date: string; ctl: number; atl: number; tl: number}>;
    if (data.length > 0) {
      const latest = data[data.length - 1];
      const tsb = Number((latest.ctl - latest.atl).toFixed(1));
      const acwr = latest.ctl > 0 ? Number((latest.atl / latest.ctl).toFixed(2)) : 0;
      const tls = data.slice(-35).map(d => d.tl);
      const lastWeek = tls.slice(-7).reduce((s, v) => s + v, 0);
      const prior4 = tls.slice(-35, -7).reduce((s, v) => s + v, 0) / 4;
      const rampRate = prior4 > 0 ? Number((((lastWeek - prior4) / prior4) * 100).toFixed(1)) : 0;
      const risk = acwr > 1.5 || rampRate > 15 ? 'HIGH' : acwr > 1.3 || rampRate > 10 || tsb < -20 ? 'MODERATE' : 'LOW';
      fitnessSection = `CTL: ${latest.ctl} | ATL: ${latest.atl} | TSB: ${tsb} | ACWR: ${acwr} | Ramp: ${rampRate}% | Risk: ${risk}
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
  let blockTimelineSection = '';
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

    const sketches = (plan.weekSketches ?? []) as WeekSketch[];
    if (sketches.length > 0) {
      const actualKmByWeek: Record<string, number> = {};
      for (const wr of recentWeekRows) {
        const days = wr.days as Array<{workouts: PlannedWorkout[]}>;
        const km = days.flatMap(d => d.workouts).filter(w => w.completed && w.distanceKm != null).reduce((s, w) => s + (w.distanceKm ?? 0), 0);
        actualKmByWeek[wr.weekStart] = Math.round(km * 10) / 10;
      }
      const curWeek = weekRows[0];
      if (curWeek) {
        const days = curWeek.days as Array<{workouts: PlannedWorkout[]}>;
        const km = days.flatMap(d => d.workouts).filter(w => w.completed && w.distanceKm != null).reduce((s, w) => s + (w.distanceKm ?? 0), 0);
        if (km > 0) actualKmByWeek[currentMonday] = Math.round(km * 10) / 10;
      }
      const curIdx = sketches.findIndex(s => s.weekStart === currentMonday);
      const from = Math.max(0, curIdx - 3);
      const to = Math.min(sketches.length - 1, curIdx + 3);
      const lines = sketches.slice(from, to + 1).map(s => {
        const isCurrent = s.weekStart === currentMonday;
        const isPast = s.weekStart < currentMonday;
        const actual = actualKmByWeek[s.weekStart];
        if (isPast) {
          return `  Wk${s.weekNumber} (${s.weekStart}, ${s.phase}): planned ${s.targetKm}km / actual ${actual != null ? actual + 'km' : '?'}`;
        }
        return `  Wk${s.weekNumber}${isCurrent ? ' →TODAY' : ''} (${s.weekStart}, ${s.phase}): target ${s.targetKm}km  [${s.keyWorkoutTypes.join(', ')}]${s.progressionNote ? '  — ' + s.progressionNote : ''}`;
      });
      blockTimelineSection = `\n\n## Block Timeline (last 3 → next 3 weeks)\n${lines.join('\n')}`;
    }
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
- When the athlete has active injury history or mentions joint/impact concerns, proactively replace 1–2 running sessions per week with cycling, swim, or cross_training in the generated plan
- Injury prevention first: always check TSB and ACWR before prescribing hard sessions
- Explain your reasoning so the athlete learns and stays motivated
- Be honest about risk; don't just tell the athlete what they want to hear

## Response Style
Voice: Direct, warm, science-backed, and accessible. Never generic wellness platitudes.
Length: 1–3 short paragraphs for conversational replies; structured sections only for plan creation. Never open with a data dump — lead with what the athlete asked, then add context.
Never say "Great job!" or hollow affirmations — be specific about what was good.
Does NOT sound like: a generic AI health assistant, an academic exercise science paper, or a corporate wellness app.
Success = athlete knows exactly what to do next and understands why. They feel understood, not lectured.

<example>
Athlete: "How did yesterday's tempo run feel?"
Coach: "Solid session — you hit 4:52/km average with TSB at -8 (slightly fatigued), so the perceived effort was probably higher than the splits suggest. That's a good adaptation signal, not a warning sign. Keep Thursday easy as planned; Saturday's long run is the key session this week."
</example>

## Current Fitness (${today})
${fitnessSection}

## Goal
${goalSection}

## Training Plan
${planSection}${blockTimelineSection}

## This Week (${currentMonday})
${weekSection}

## Athlete Knowledge
${notesSection}

## Tool Usage Rules
Always call getFitnessSummary before making any load/intensity decisions.
Always call getAdherenceSummary before generating any weekly plan — use it to understand how the athlete has been executing past plans and surface patterns worth noting.
Always call getRecentActivities before generating any weekly plan.
Always call saveWeeklyPlan after generating a weekly schedule — never describe a weekly plan in text only.
Always call updateAthleteNotes when you learn anything new about the athlete. When getAdherenceSummary reveals a consistent pattern across ≥3 data points (e.g. "easy runs consistently 15% longer than planned", "tempo sessions at lower HR than target"), write a concise note to responsePatterns so future plans can account for it.
Always call linkCompletedActivity when the athlete mentions completing a workout with a Strava ID.
Always call askQuestion when you need the athlete to choose between 2–4 discrete options — do not repeat the question in free text after calling it, just wait for the reply.
Always ask how many days are available before generating a weekly plan — use askQuestion with options "3 days", "4 days", "5 days", "6 days".
Never call saveTrainingPlan without explicit athlete confirmation ("looks good", "save it", "yes") — present the plan overview first and wait.
Always include weekSketches when calling saveTrainingPlan — one entry per week for the full block. Use progressive overload: no >10% volume increase week-over-week; recovery week every 3–4 weeks at ~85% of the prior week; taper at ~60–70% of peak volume. The block timeline above is the ground truth for load progression — use it to ensure each new weekly plan fits the shape of the block.
Never modify [done] days — they are completed workouts; only propose changes to remaining days.
Always format workouts precisely: type + distance or duration + target HR zone + specific instructions. This athlete uses a 6-zone HR model: Z1 recovery, Z2 easy aerobic, Z3 aerobic/tempo, Z4 threshold, Z5 VO2max, Z6 neuromuscular/max sprint. Every phase of every workout must have an explicit zone number. Easy runs = Zone 2 (Zone 1 if TSB very negative). Long runs = Zone 2 throughout. Tempo = Zone 3–4. Threshold intervals = Zone 4. VO2max intervals = Zone 5. Strides/sprints = Zone 6. Recovery jogs = Zone 1. Never write "easy" or "hard" without the corresponding zone number.

## Structured Workout Steps (interval_run and tempo_run only)
When saving an interval_run or tempo_run with saveWeeklyPlan, ALWAYS populate structuredSteps in addition to specificInstructions. Use this format:
- A warmup WorkoutStep (stepType: "warmup")
- A RepeatBlock for the main set when doing multiple intervals (repeatCount = number of reps, steps = [training step, rest step])
- OR one or more training WorkoutSteps for continuous efforts (e.g. tempo blocks)
- A cooldown WorkoutStep (stepType: "cooldown")
Zone % LTHR reference: Z1 = 60–69%, Z2 = 70–82%, Z3 = 83–94%, Z4 = 95–105%, Z5 = 106–120%, Z6 = >120%
zoneName values to use: "Recovery", "Aerobic Base", "Aerobic Tempo", "Threshold", "VO2max", "Neuromuscular"
intensityMin/Max are percentages of LTHR. If you have the athlete's zone BPM ranges from settings or fitness data, compute bpmMin = round(intensityMin/100 * lthr) and bpmMax = round(intensityMax/100 * lthr) and include them.
For easy_run, long_run, recovery_run, gym, rest, and cross_training — omit structuredSteps entirely.
If you are uncertain about the exact structure, omit structuredSteps rather than guessing.

After saving a weekly plan that contains a structured workout, you MAY show the interval session inline in your reply by emitting a structured-workout code fence with the same JSON array as structuredSteps. Example:
\`\`\`structured-workout
[
  {"stepType":"warmup","durationSeconds":600,"zoneName":"Recovery","intensityMin":60,"intensityMax":69,"zoneNumber":1},
  {"repeatCount":4,"steps":[
    {"stepType":"training","durationSeconds":300,"zoneName":"VO2max","intensityMin":106,"intensityMax":120,"zoneNumber":5},
    {"stepType":"rest","durationSeconds":90,"zoneName":"Recovery","intensityMin":60,"intensityMax":69,"zoneNumber":1}
  ]},
  {"stepType":"cooldown","durationSeconds":300,"zoneName":"Recovery","intensityMin":60,"intensityMax":69,"zoneNumber":1}
]
\`\`\`
Only emit this fence when presenting a specific structured workout session. Do not emit it for easy runs, rest days, or general questions. The fence must contain only the JSON array — no other text inside.

## Preference Collection (REQUIRED before creating any training plan)
Before calling saveTrainingPlan, check the Athlete Knowledge section above for these preferences. Collect each one that is MISSING, one question per turn:
1. preferred_long_run_day — call askQuestion: "Which day works best for your weekly long run?" → [Saturday, Sunday, Weekday/Flexible]. Then call updateAthleteNotes with {"preferences": {"preferred_long_run_day": "<answer>"}}.
2. gym_access — call askQuestion: "Do you have regular gym access for strength training?" → [Yes, No]. Then call updateAthleteNotes with {"preferences": {"gym_access": "<yes/no>"}}.
3. weekly_training_days — call askQuestion: "How many days per week can you dedicate to training?" → [3 days, 4 days, 5 days, 6 days]. Then call updateAthleteNotes with {"preferences": {"weekly_training_days": "<answer>"}}.
4. training_approach — call askQuestion: "How would you like to approach the buildup?" → [Conservative (safety first), Balanced (steady progression), Ambitious (push the limits)]. Then call updateAthleteNotes with {"preferences": {"training_approach": "<answer>"}}.
Do NOT skip these steps even if the athlete has explicitly asked you to start building the plan. Gather all four preferences first, then proceed.

## Plan Draft & Confirmation Flow (REQUIRED when creating a new macro plan)
After gathering all preferences above, present the plan as a natural-language overview BEFORE saving it. Structure the overview as:
- Goal & timeline: race, date, weeks remaining
- Phase structure: list each phase (name, duration, focus, weekly km range)
- Long run progression: rough peak long run distance and taper strategy
- Key workout types per phase
- Any constraints or tradeoffs you've baked in (e.g. conservative ramp due to injury history)

End with: "Does this look good, or would you like to adjust anything before I save it?" Then WAIT for the athlete's reply. Only call saveTrainingPlan after explicit confirmation ("looks good", "save it", "yes", etc.) or after incorporating requested changes.

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
7. askQuestion: "How many days per week can you train?" → ["3 days", "4 days", "5 days", "6 days"]
8. askQuestion: "How would you like to approach the buildup?" → ["Conservative (safety first)", "Balanced (steady progression)", "Ambitious (push the limits)"]
9. If race goal: in plain chat, ask for the target race date (accept any natural format and convert to YYYY-MM-DD).
10. If race goal: in plain chat, ask for the target finish time (accept "3:45", "sub 4h", etc — convert to minutes).
11. In plain chat, briefly ask about injury history (one line, optional — accept "none").
12. Call getPeakWeeklyKm to compute their recent peak weekly volume from Strava.
13. Call setGoal with all structured fields gathered.
14. Call updateAthleteNotes with {"preferences": {"preferred_long_run_day": "...", "gym_access": "true|false", "weekly_training_days": "...", "training_approach": "..."}} and any injury entries.
15. Briefly confirm what you've saved in 2–3 lines, then ask if they're ready for you to draft the periodized training plan.

Do NOT call saveTrainingPlan during onboarding — wait for explicit confirmation after presenting the plan draft (see Plan Draft & Confirmation Flow above).
`}

Today: ${today} (${weekday}) | Week start: ${currentMonday}`;

  promptCache.set(athleteId, {prompt, expiresAt: Date.now() + CACHE_TTL_MS});
  return prompt;
}
