import {tool} from 'ai';
import {z} from 'zod';
import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq, and, desc, gte, isNotNull, sql} from 'drizzle-orm';
import {transformActivity, transformStreams} from './strava';
import {formatPace} from './activityModel';
import {computeKmSplits, downsampleStream} from './activityDataTiers';
import {fetchHistoricalWeather, fetchWeatherForecast, windDirectionLabel} from './weather';
import {invalidateCoachPromptCache} from './coachContext';
import {KNOWLEDGE_TOPIC_KEYS, KNOWLEDGE_TOPIC_SUMMARY, getKnowledgeTopic} from './coachKnowledge';
import {calcVdot, DISTANCE_METERS_MAP} from './vdot';
import type {ActivityWeatherData} from './weather';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** Add n days to a YYYY-MM-DD string, returning YYYY-MM-DD (UTC-safe). */
function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Day index 0=Mon … 6=Sun for a YYYY-MM-DD date. */
function mondayIndex(dateStr: string): number {
  const dow = new Date(dateStr + 'T00:00:00Z').getUTCDay(); // 0=Sun … 6=Sat
  return (dow + 6) % 7;
}

const structuredStepSchema = z.union([
  z.object({
    stepType: z.enum(['warmup', 'training', 'rest', 'cooldown']),
    durationSeconds: z.number().int().positive(),
    zoneName: z.string(),
    zoneNumber: z.number().int().min(1).max(6).optional(),
    intensityMin: z.number().min(0).max(200),
    intensityMax: z.number().min(0).max(200),
    bpmMin: z.number().int().positive().optional(),
    bpmMax: z.number().int().positive().optional(),
    notes: z.string().optional(),
  }),
  z.object({
    repeatCount: z.number().int().positive(),
    steps: z.array(
      z.object({
        stepType: z.enum(['warmup', 'training', 'rest', 'cooldown']),
        durationSeconds: z.number().int().positive(),
        zoneName: z.string(),
        zoneNumber: z.number().int().min(1).max(6).optional(),
        intensityMin: z.number().min(0).max(200),
        intensityMax: z.number().min(0).max(200),
        bpmMin: z.number().int().positive().optional(),
        bpmMax: z.number().int().positive().optional(),
        notes: z.string().optional(),
      }),
    ),
  }),
]);

const plannedWorkoutSchema = z.object({
  type: z.string().describe(
    'easy_run|long_run|tempo_run|interval_run|recovery_run|gym|cycling|yoga|cross_training|hike|rest',
  ),
  durationMinutes: z.number().nullable().optional(),
  distanceKm: z.number().nullable().optional(),
  intensityDescription: z.string().describe(
    'One-line effort summary. For RUNNING/CARDIO (runs, cycling, hike) MUST include the target HR zone using the 6-zone model (Zone 1–6), e.g. "Zone 2 · Easy aerobic · conversational pace" or "Zone 4 · Threshold · comfortably hard". Never omit the zone number for cardio. For STRENGTH/MOBILITY (gym, yoga) do NOT use HR zones — they do not apply to lifting. Summarize with load/RPE and focus instead, e.g. "Strength · 2–3 rounds · RPE 6–7 · hips, glutes & core" or "Mobility · low intensity · hip and ankle range".',
  ),
  specificInstructions: z.string().describe(
    'Structured session breakdown using newlines between phases. Start each phase label in ALL CAPS followed by a colon.\n\nFor RUNNING/CARDIO sessions: EVERY phase must include its target zone from the 6-zone model (Zone 1–6). Zone guide: Z1 recovery, Z2 easy aerobic, Z3 aerobic/tempo, Z4 threshold, Z5 VO2max, Z6 neuromuscular/max sprint. e.g.:\nWARM-UP: 10 min Zone 1–2 · easy jog, conversational\nMAIN SET: 3 × 8 min Zone 3–4 · tempo at half-marathon effort, 2 min Zone 1 jog recovery\nCOOL-DOWN: 5 min Zone 1 · easy walk/jog\nFor strides: "4 × 20 sec Zone 6 · max sprint, 90 sec Zone 1 walk recovery". For easy runs with no phases, still state the zone: "Zone 2 throughout · nasal breathing, fully conversational".\n\nFor STRENGTH/GYM sessions: do NOT use HR zones — they do not apply to resistance work. Use strength-native phases and prescribe each movement as "exercise · sets × reps · load or RPE". Typical structure (omit phases that do not apply):\nACTIVATION: 5 min · mobility + glute/core activation (leg swings, hip openers, monster walks)\nSTRENGTH: 3 × 8 · dumbbell RDLs, split squats, calf raises — RPE 7, controlled tempo\nCORE: 2 × 30 sec · side plank, dead bug\nCOOL-DOWN: 5 min · light stretching, breathing\nFor MOBILITY/YOGA sessions: list the focus areas and durations, no zones (e.g. "FLOW: 25 min · hip and thoracic mobility, controlled breathing").',
  ),
  completed: z.boolean().default(false),
  linkedStravaActivityId: z.number().nullable().optional(),
  structuredSteps: z
    .array(structuredStepSchema)
    .optional()
    .describe(
      'Structured step-by-step blocks for interval_run and tempo_run workouts. Each block is a WorkoutStep (warmup/training/rest/cooldown) or a RepeatBlock with repeatCount and nested steps. intensityMin/Max are % of LTHR. Include bpmMin/bpmMax when LTHR is known. Omit this field entirely for easy_run, long_run, and rest days.',
    ),
});

type PlannedWorkoutInput = z.infer<typeof plannedWorkoutSchema>;

/**
 * A single day addressed by WEEKDAY NAME (mon…sun). The model never supplies a
 * calendar date — the server derives it from the week's Monday, so a workout
 * can never land on the wrong date (e.g. the model thinking Saturday is the 14th).
 */
const weekdayDaySchema = z.object({
  weekday: z
    .enum(WEEKDAY_KEYS)
    .describe('Which day: mon, tue, wed, thu, fri, sat, or sun. The calendar date is derived from this — never pass a raw date.'),
  dayNotes: z.string().nullable().optional(),
  workouts: z
    .array(plannedWorkoutSchema)
    .describe('Workouts for this day. For a hike use type "hike"; for a pure rest day pass an empty array or a single type "rest" workout.'),
});

type StoredDayInput = {
  date: string;
  dayOfWeek: number;
  dayNotes?: string | null;
  workouts: PlannedWorkoutInput[];
};

/**
 * Normalize a day into the stored PlannedDay shape (fill optional fields).
 */
function normalizeDay(d: StoredDayInput) {
  return {
    date: d.date,
    dayOfWeek: d.dayOfWeek,
    dayNotes: d.dayNotes ?? null,
    workouts: d.workouts.map(w => ({
      ...w,
      linkedStravaActivityId: w.linkedStravaActivityId ?? null,
      completed: w.completed ?? false,
    })),
  };
}

/** Build a normalized stored day from a weekday-addressed input + the week's Monday. */
function dayFromWeekday(weekStart: string, d: z.infer<typeof weekdayDaySchema>) {
  const idx = WEEKDAY_KEYS.indexOf(d.weekday); // 0=Mon … 6=Sun
  return normalizeDay({
    date: addDaysStr(weekStart, idx),
    dayOfWeek: idx,
    dayNotes: d.dayNotes,
    workouts: d.workouts,
  });
}

/**
 * Ground-truth layout the model MUST echo back to the athlete after any plan write.
 * Prevents the coach from narrating its intent instead of what was actually saved.
 */
function summarizeWeek(days: Array<{date: string; dayOfWeek: number; dayNotes?: string | null; workouts: Array<{type: string; distanceKm?: number | null; durationMinutes?: number | null; completed?: boolean}>}>): string {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  return sorted
    .map(d => {
      const name = DAY_NAMES[d.dayOfWeek] ?? d.date;
      const w = d.workouts.length === 0
        ? 'rest'
        : d.workouts
            .map(x => {
              const amt = x.distanceKm != null ? ` ${x.distanceKm}km` : x.durationMinutes != null ? ` ${x.durationMinutes}min` : '';
              return `${x.type}${amt}${x.completed ? ' [done]' : ''}`;
            })
            .join(' + ');
      return `${name} ${d.date}: ${w}`;
    })
    .join(' | ');
}

export function getCoachTools(athleteId: number) {
  const db = getDb();

  // Knowledge topics fetched during THIS chat request (closure lives one request,
  // spanning the agent's multi-step loop). Used to gate plan creation behind a
  // knowledge fetch so plans are grounded in the reference, not the model's memory.
  const fetchedKnowledge = new Set<string>();

  /** Distance-specific knowledge topic for a goalType, or null if none applies. */
  const distanceTopicFor = (goalType: string): string | null => {
    const g = goalType.toLowerCase();
    if (g.includes('ultra')) return 'ultramarathon';
    if (g.includes('half')) return 'half_marathon';
    if (g.includes('marathon')) return 'marathon';
    return null;
  };

  return {
    getCoachingKnowledge: tool({
      description:
        'Fetch distilled, evidence-based training-science reference for a specific topic (TrainingPeaks / Joe Friel sources). Call BEFORE giving detailed advice or building a plan that depends on a topic — do not answer fueling, race-distance, interval, taper, recovery, psychology, or cross-training questions from memory. Topics:\n' +
        KNOWLEDGE_TOPIC_KEYS.map(k => `- ${k}: ${KNOWLEDGE_TOPIC_SUMMARY[k]}`).join('\n'),
      inputSchema: z.object({
        topic: z.enum(KNOWLEDGE_TOPIC_KEYS).describe('Which knowledge topic to retrieve.'),
      }),
      execute: async ({topic}) => {
        const content = getKnowledgeTopic(topic);
        if (!content) return {error: `Unknown topic "${topic}". Valid topics: ${KNOWLEDGE_TOPIC_KEYS.join(', ')}.`};
        fetchedKnowledge.add(topic);
        return {topic, content};
      },
    }),
    getFitnessSummary: tool({
      description:
        "Get the athlete's current fitness metrics: CTL (base fitness), ATL (load impact), TSB (form), ACWR, and injury risk. Call this before prescribing hard sessions or making load decisions.",
      inputSchema: z.object({}),
      execute: async () => {
        const cacheRows = await db
          .select()
          .from(schema.dashboardCache)
          .where(eq(schema.dashboardCache.athleteId, athleteId))
          .limit(1);

        const cached = cacheRows[0];
        if (!cached) {
          return {error: 'No fitness data available. The athlete needs to sync activities first.'};
        }

        const fitnessData = cached.data as Array<{date: string; ctl: number; atl: number; tsb: number; tl: number}>;
        if (fitnessData.length === 0) return {error: 'No fitness data points available.'};

        const latest = fitnessData[fitnessData.length - 1];
        const ctl = latest.ctl;
        const atl = latest.atl;
        const tsb = Number((ctl - atl).toFixed(1));
        const acwr = ctl > 0 ? Number((atl / ctl).toFixed(2)) : 0;

        const tls = fitnessData.slice(-35).map(d => d.tl);
        const lastWeekTl = tls.slice(-7).reduce((s, v) => s + v, 0);
        const prior4Avg = tls.slice(-35, -7).reduce((s, v) => s + v, 0) / 4;
        const rampRate = prior4Avg > 0 ? Number((((lastWeekTl - prior4Avg) / prior4Avg) * 100).toFixed(1)) : 0;

        let riskLevel = 'low';
        const riskFactors: string[] = [];
        if (acwr > 1.5) { riskLevel = 'high'; riskFactors.push('ACWR critical (>1.5)'); }
        else if (acwr > 1.3) { riskLevel = 'moderate'; riskFactors.push('ACWR elevated (>1.3)'); }
        if (rampRate > 15) { if (riskLevel === 'low') riskLevel = 'moderate'; riskFactors.push('High ramp rate (>15%)'); }
        if (tsb < -20) { if (riskLevel === 'low') riskLevel = 'moderate'; riskFactors.push('Deep fatigue (TSB < -20)'); }

        return {
          date: latest.date,
          ctl,
          atl,
          tsb,
          acwr,
          rampRate,
          riskLevel,
          riskFactors,
          formStatus:
            tsb > 5 ? 'Fresh (race-ready)' :
            tsb > -10 ? 'Neutral (normal training)' :
            tsb > -20 ? 'Fatigued (accumulating load)' :
            'Very fatigued — recovery priority',
          acwrStatus:
            acwr < 0.8 ? 'Under-training (safe to increase load)' :
            acwr <= 1.3 ? 'Sweet spot (optimal zone)' :
            'Elevated risk (reduce intensity)',
        };
      },
    }),

    getRecentActivities: tool({
      description:
        "Get the athlete's recent activities with type, distance, pace, HR. Use to understand training patterns and compliance.",
      inputSchema: z.object({
        limit: z.number().default(14).describe('Number of recent activities (default 14)'),
      }),
      execute: async ({limit}) => {
        const rows = await db
          .select()
          .from(schema.activities)
          .where(eq(schema.activities.athleteId, athleteId))
          .orderBy(desc(schema.activities.date))
          .limit(limit);

        const activities = rows.map(r => {
          const a = transformActivity(r.data as Parameters<typeof transformActivity>[0]);
          const paceMin = Math.floor(a.avgPace);
          const paceSec = Math.round((a.avgPace - paceMin) * 60);
          return {
            id: a.id,
            name: a.name,
            date: a.date,
            type: a.type,
            distanceKm: Number(a.distance.toFixed(2)),
            durationMin: Number((a.duration / 60).toFixed(0)),
            avgPace: a.avgPace > 0 ? `${paceMin}:${String(paceSec).padStart(2, '0')} min/km` : null,
            avgHr: a.avgHr > 0 ? Math.round(a.avgHr) : null,
            elevationGainM: Math.round(a.elevationGain),
          };
        });

        return {activities, count: activities.length};
      },
    }),

    getZoneDistribution: tool({
      description:
        "Get HR zone distribution as % of time. Shows aerobic base vs intensity balance.",
      inputSchema: z.object({
        weeks: z.number().default(4).describe('Weeks to look back'),
      }),
      execute: async ({weeks}) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - weeks * 7);
        const cutoffStr = cutoffDate.toISOString().slice(0, 10);

        const actRows = await db
          .select({id: schema.activities.id})
          .from(schema.activities)
          .where(and(eq(schema.activities.athleteId, athleteId), gte(schema.activities.date, cutoffStr)));

        if (actRows.length === 0) return {zones: {}, totalSeconds: 0, weeks};

        const actIds = actRows.map(r => r.id);
        const zoneRows = await db
          .select()
          .from(schema.zoneBreakdowns)
          .where(
            and(
              eq(schema.zoneBreakdowns.athleteId, athleteId),
              sql`${schema.zoneBreakdowns.activityId} = ANY(ARRAY[${sql.raw(actIds.join(','))}]::bigint[])`,
            ),
          );

        const totals: Record<number, number> = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0};
        for (const row of zoneRows) {
          const zones = row.zones as Record<string, {time: number; distance: number}>;
          for (const [zone, data] of Object.entries(zones)) {
            const z = Number(zone);
            if (z >= 1 && z <= 6) totals[z] += data.time;
          }
        }

        const totalSeconds = Object.values(totals).reduce((s, v) => s + v, 0);
        const names: Record<number, string> = {
          1: 'Recovery', 2: 'Aerobic Base', 3: 'Tempo', 4: 'Threshold', 5: 'VO2max', 6: 'Anaerobic',
        };

        const zones: Record<string, {seconds: number; percent: number; name: string}> = {};
        for (const [z, seconds] of Object.entries(totals)) {
          zones[`Z${z}`] = {
            seconds,
            percent: totalSeconds > 0 ? Number(((seconds / totalSeconds) * 100).toFixed(1)) : 0,
            name: names[Number(z)],
          };
        }

        return {zones, totalSeconds, weeks};
      },
    }),

    getBestEfforts: tool({
      description: "Get personal bests with VDOT estimates and staleness context. Use to set realistic pace targets — always pair with getCoachingKnowledge('vdot_pacing') to translate VDOT into E/M/T/I/R paces.",
      inputSchema: z.object({}),
      execute: async () => {
        const [effortRows, cacheRows] = await Promise.all([
          db.select().from(schema.bestEffortsCache).where(eq(schema.bestEffortsCache.athleteId, athleteId)).limit(1),
          db.select().from(schema.dashboardCache).where(eq(schema.dashboardCache.athleteId, athleteId)).limit(1),
        ]);

        if (!effortRows[0]) return {efforts: {}, message: 'No best efforts cached yet.'};

        const bests = effortRows[0].bests as Record<string, {timeSeconds: number; date: string; activityId: number}>;
        const fitnessData = (cacheRows[0]?.data ?? []) as Array<{date: string; ctl: number; atl: number; tsb: number; tl: number}>;
        const currentCtl = fitnessData.length > 0 ? fitnessData[fitnessData.length - 1].ctl : null;
        const today = new Date().toISOString().slice(0, 10);

        function ctlOnDate(date: string): number | null {
          const entry = fitnessData.find(d => d.date === date) ?? fitnessData.filter(d => d.date <= date).pop();
          return entry?.ctl ?? null;
        }

        type EffortEntry = {
          time: string; date: string; effortAgeDays: number; confidence: 'fresh' | 'stale' | 'very_stale';
          vdot?: number; ctlAtEffort?: number; ctlNow?: number; ctlDelta?: number;
        };
        const formatted: Record<string, EffortEntry> = {};

        for (const [distance, best] of Object.entries(bests)) {
          const mins = Math.floor(best.timeSeconds / 60);
          const secs = best.timeSeconds % 60;
          const effortAgeDays = Math.round((Date.parse(today) - Date.parse(best.date)) / 86400000);
          const distanceM = DISTANCE_METERS_MAP[distance.toLowerCase()];
          const vdot = distanceM ? calcVdot(distanceM, best.timeSeconds) : null;
          const ctlAtEffort = ctlOnDate(best.date);
          const confidence: EffortEntry['confidence'] = effortAgeDays < 60 ? 'fresh' : effortAgeDays < 180 ? 'stale' : 'very_stale';
          formatted[distance] = {
            time: `${mins}:${String(Math.round(secs)).padStart(2, '0')}`,
            date: best.date,
            effortAgeDays,
            confidence,
            ...(vdot != null && {vdot}),
            ...(ctlAtEffort != null && {ctlAtEffort}),
            ...(currentCtl != null && {ctlNow: currentCtl}),
            ...(ctlAtEffort != null && currentCtl != null && {ctlDelta: Math.round((currentCtl - ctlAtEffort) * 10) / 10}),
          };
        }

        // Pick best VDOT from most reliable distance (≥5k), prefer fresh
        const VDOT_PRIORITY = ['marathon', 'half-marathon', '10k', '5k', '10 mile', '15k', '20k'];
        let primaryVdot: {distance: string; vdot: number; confidence: string; ageDays: number; ctlDelta?: number} | null = null;
        for (const d of VDOT_PRIORITY) {
          const e = formatted[d] ?? formatted[d.replace('-', ' ')];
          if (e?.vdot != null) {
            if (!primaryVdot || e.confidence === 'fresh') {
              primaryVdot = {distance: d, vdot: e.vdot, confidence: e.confidence, ageDays: e.effortAgeDays, ctlDelta: e.ctlDelta};
            }
            if (e.confidence === 'fresh') break;
          }
        }

        const deltaNote = primaryVdot?.ctlDelta != null && primaryVdot.confidence !== 'fresh'
          ? ` CTL has changed ${primaryVdot.ctlDelta > 0 ? '+' : ''}${primaryVdot.ctlDelta} pts since — paces likely ${primaryVdot.ctlDelta > 0 ? 'faster' : 'slower'} than table.`
          : '';

        return {
          efforts: formatted,
          primaryVdot,
          note: primaryVdot
            ? `VDOT ~${primaryVdot.vdot} from ${primaryVdot.distance} (${primaryVdot.ageDays}d ago, ${primaryVdot.confidence}).${deltaNote} Fetch getCoachingKnowledge('vdot_pacing') to map this to E/M/T/I/R training paces.`
            : 'No qualifying effort (≥5k) for VDOT estimate.',
        };
      },
    }),

    getTrainingPlan: tool({
      description: "Get the current active macro training plan with all phases.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await db
          .select()
          .from(schema.trainingPlan)
          .where(and(eq(schema.trainingPlan.athleteId, athleteId), eq(schema.trainingPlan.isActive, true)))
          .orderBy(desc(schema.trainingPlan.generatedAt))
          .limit(1);

        if (!rows[0]) return {plan: null, message: 'No active training plan. Create one with saveTrainingPlan.'};

        const p = rows[0];
        return {
          plan: {
            id: p.id,
            goalType: p.goalType,
            targetDate: p.targetDate,
            startDate: p.startDate,
            currentPhaseIndex: p.currentPhaseIndex,
            phases: p.phases,
            generatedAt: new Date(p.generatedAt).toISOString().slice(0, 10),
          },
        };
      },
    }),

    getWeeklyPlan: tool({
      description: "Get the planned workouts for a specific week. weekStart must be a Monday (YYYY-MM-DD).",
      inputSchema: z.object({
        weekStart: z.string().describe('Monday date in YYYY-MM-DD format'),
      }),
      execute: async ({weekStart}) => {
        const rows = await db
          .select()
          .from(schema.weeklyPlan)
          .where(and(eq(schema.weeklyPlan.athleteId, athleteId), eq(schema.weeklyPlan.weekStart, weekStart)))
          .limit(1);

        if (!rows[0]) return {plan: null, weekStart, message: 'No weekly plan for this week.'};
        return {plan: rows[0]};
      },
    }),

    getAthleteNotes: tool({
      description: "Get accumulated knowledge about this athlete: injury history, preferences, and training responses.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await db
          .select()
          .from(schema.athleteNotes)
          .where(eq(schema.athleteNotes.athleteId, athleteId))
          .limit(1);

        if (!rows[0]) return {notes: null, message: 'No athlete notes yet.'};
        return {notes: rows[0]};
      },
    }),

    getAdherenceSummary: tool({
      description:
        "Analyse how well the athlete has been executing their planned workouts over the past N weeks. Returns per-workout-type adherence (distance %, duration %) and overall stats. Call this before generating a new weekly plan, or when the athlete asks about their consistency or progress.",
      inputSchema: z.object({
        weeks: z.number().default(4).describe('Number of past weeks to analyse (default 4)'),
      }),
      execute: async ({weeks}) => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - weeks * 7);
        const cutoffStr = cutoff.toISOString().slice(0, 10);

        const planRows = await db
          .select()
          .from(schema.weeklyPlan)
          .where(
            and(
              eq(schema.weeklyPlan.athleteId, athleteId),
              gte(schema.weeklyPlan.weekStart, cutoffStr),
            ),
          );

        if (!planRows.length) return {message: 'No weekly plans found in this period.', weeks};

        // Collect all linked activity IDs so we can bulk-fetch
        type LinkedWorkout = {
          activityId: number;
          plannedDistanceKm: number | null;
          plannedDurationMin: number | null;
          workoutType: string;
          weekStart: string;
        };

        const linked: LinkedWorkout[] = [];
        let totalWorkouts = 0;
        let completedWorkouts = 0;
        let missedWorkouts = 0;

        for (const row of planRows) {
          const days = row.days as Array<{date: string; workouts: Array<{type: string; distanceKm?: number; durationMinutes?: number; completed?: boolean; linkedStravaActivityId?: number | null}>}>;
          for (const day of days) {
            for (const w of day.workouts) {
              if (w.type === 'rest') continue;
              totalWorkouts++;
              if (w.completed && w.linkedStravaActivityId) {
                completedWorkouts++;
                linked.push({
                  activityId: w.linkedStravaActivityId,
                  plannedDistanceKm: w.distanceKm ?? null,
                  plannedDurationMin: w.durationMinutes ?? null,
                  workoutType: w.type,
                  weekStart: row.weekStart,
                });
              } else if (w.completed) {
                completedWorkouts++;
              } else {
                missedWorkouts++;
              }
            }
          }
        }

        // Fetch actual activities for linked workouts
        const activityIds = linked.map(l => l.activityId);
        const actRows = activityIds.length > 0
          ? await db
              .select({id: schema.activities.id, data: schema.activities.data})
              .from(schema.activities)
              .where(
                and(
                  eq(schema.activities.athleteId, athleteId),
                  sql`${schema.activities.id} = ANY(ARRAY[${sql.raw(activityIds.join(','))}]::bigint[])`,
                ),
              )
          : [];

        const actMap = new Map<number, {distanceKm: number; durationMin: number}>();
        for (const row of actRows) {
          const d = row.data as {distance?: number; moving_time?: number};
          actMap.set(row.id, {
            distanceKm: (d.distance ?? 0) / 1000,
            durationMin: (d.moving_time ?? 0) / 60,
          });
        }

        // Aggregate by workout type
        type TypeStats = {count: number; distPcts: number[]; durPcts: number[]};
        const byType: Record<string, TypeStats> = {};

        for (const lw of linked) {
          const actual = actMap.get(lw.activityId);
          if (!actual) continue;

          if (!byType[lw.workoutType]) byType[lw.workoutType] = {count: 0, distPcts: [], durPcts: []};
          const ts = byType[lw.workoutType];
          ts.count++;

          if (lw.plannedDistanceKm && actual.distanceKm > 0) {
            ts.distPcts.push(Math.round((actual.distanceKm / lw.plannedDistanceKm) * 100));
          }
          if (lw.plannedDurationMin && actual.durationMin > 0) {
            ts.durPcts.push(Math.round((actual.durationMin / lw.plannedDurationMin) * 100));
          }
        }

        const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;

        const byWorkoutType: Record<string, {count: number; avgDistancePct: number | null; avgDurationPct: number | null}> = {};
        for (const [type, ts] of Object.entries(byType)) {
          byWorkoutType[type] = {
            count: ts.count,
            avgDistancePct: avg(ts.distPcts),
            avgDurationPct: avg(ts.durPcts),
          };
        }

        // Overall adherence: simple average of all scored pcts
        const allPcts: number[] = Object.values(byType).flatMap(ts => [...ts.distPcts, ...ts.durPcts]);
        const overallAdherencePct = avg(allPcts);

        return {
          period: {from: cutoffStr, to: new Date().toISOString().slice(0, 10)},
          weeks,
          totalWorkouts,
          completedWorkouts,
          missedWorkouts,
          overallAdherencePct,
          byWorkoutType,
          linkedWithData: linked.length,
        };
      },
    }),

    saveTrainingPlan: tool({
      description:
        "Save a new macro training plan. Deactivates any existing plan and creates the new one. Call this after generating a full periodized plan. You MUST provide weekSketches — one entry per week across the full block.",
      inputSchema: z.object({
        goalType: z.string(),
        targetDate: z.string().nullable(),
        startDate: z.string(),
        phases: z.array(
          z.object({
            phase: z.enum(['base', 'build', 'peak', 'taper']),
            startDate: z.string(),
            endDate: z.string(),
            weekCount: z.number(),
            focusDescription: z.string(),
            targetWeeklyKmRange: z.array(z.number()).min(2).max(2).describe('Two-element array [minKm, maxKm]'),
            keyWorkouts: z.array(z.string()),
          }),
        ),
        weekSketches: z
          .array(
            z.object({
              weekNumber: z.number().describe('1-based week index across the full block'),
              weekStart: z.string().describe('Monday date YYYY-MM-DD'),
              phase: z.enum(['base', 'build', 'peak', 'taper']),
              targetKm: z.number().describe('Single km target for this week — must follow progressive overload (no >10% consecutive jumps); recovery weeks every 3-4wks at ~85% of previous; taper at ~60-70% of peak'),
              keyWorkoutTypes: z.array(z.string()).describe('2-4 workout types for this week e.g. long_run, tempo_run'),
              progressionNote: z.string().describe('One line explaining this week\'s role in the block e.g. "first 20km long run", "recovery week after peak load"'),
            }),
          )
          .describe('One sketch per week covering the full block duration — used for the volume chart and coach context window'),
        currentPhaseIndex: z.number().default(0),
      }),
      execute: async input => {
        // Gate: a macro plan must be grounded in the knowledge reference. Require
        // mileage_progression + the distance-specific topic before saving.
        const required = ['mileage_progression'];
        const distanceTopic = distanceTopicFor(input.goalType);
        if (distanceTopic) required.push(distanceTopic);
        const missing = required.filter(t => !fetchedKnowledge.has(t));
        if (missing.length > 0) {
          return {
            error: 'KNOWLEDGE_REQUIRED',
            message: `Before saving a plan you must ground it in the training-science reference. Call getCoachingKnowledge for each of these topics first, then retry saveTrainingPlan: ${missing.join(', ')}.`,
            missingTopics: missing,
          };
        }

        const now = Date.now();

        await db
          .update(schema.trainingPlan)
          .set({isActive: false, updatedAt: now})
          .where(and(eq(schema.trainingPlan.athleteId, athleteId), eq(schema.trainingPlan.isActive, true)));

        const [row] = await db
          .insert(schema.trainingPlan)
          .values({
            id: now,
            athleteId,
            goalType: input.goalType,
            targetDate: input.targetDate,
            startDate: input.startDate,
            phases: input.phases,
            weekSketches: input.weekSketches,
            currentPhaseIndex: input.currentPhaseIndex,
            isActive: true,
            generatedAt: now,
            updatedAt: now,
          })
          .returning();

        return {success: true, planId: row.id};
      },
    }),

    getWeekSketches: tool({
      description:
        "Get the week-level volume sketches for the active training plan. Returns targetKm and key workout types per week. Use when you need to see where the block is going before generating the current week's detailed plan.",
      inputSchema: z.object({
        fromWeek: z.number().optional().describe('1-based week number to start from (default: current week - 2)'),
        toWeek: z.number().optional().describe('1-based week number to end at (default: current week + 4)'),
      }),
      execute: async ({fromWeek, toWeek}) => {
        const rows = await db
          .select()
          .from(schema.trainingPlan)
          .where(and(eq(schema.trainingPlan.athleteId, athleteId), eq(schema.trainingPlan.isActive, true)))
          .limit(1);

        if (!rows[0]) return {sketches: null, message: 'No active training plan.'};

        const sketches = (rows[0].weekSketches ?? []) as Array<{weekNumber: number; weekStart: string; phase: string; targetKm: number; keyWorkoutTypes: string[]; progressionNote: string}>;
        if (!sketches.length) return {sketches: [], message: 'Plan has no week sketches — was created before this feature.'};

        const from = fromWeek ?? Math.max(1, (sketches.find(s => s.weekStart <= new Date().toISOString().slice(0, 10))?.weekNumber ?? 1) - 2);
        const to = toWeek ?? from + 6;

        return {
          sketches: sketches.filter(s => s.weekNumber >= from && s.weekNumber <= to),
          totalWeeks: sketches.length,
        };
      },
    }),

    saveWeeklyPlan: tool({
      description:
        "Save the detailed workout schedule for a specific week (Mon–Sun). Creates or replaces the existing plan for that week. Always call this after generating a week plan — never just describe it in text.",
      inputSchema: z.object({
        trainingPlanId: z.number(),
        weekStart: z.string().describe('Monday date YYYY-MM-DD'),
        phase: z.enum(['base', 'build', 'peak', 'taper']),
        weekNumber: z.number(),
        targetWeeklyKm: z.number().nullable().optional(),
        coachNotes: z.string().nullable().optional().describe("Coach's explanation and reasoning for this week"),
        days: z
          .array(weekdayDaySchema)
          .length(7)
          .describe('All 7 days, addressed by weekday name (mon, tue, wed, thu, fri, sat, sun). Provide each weekday exactly once.'),
      }),
      execute: async input => {
        const now = Date.now();

        // Guard: weekStart must be a Monday.
        if (mondayIndex(input.weekStart) !== 0) {
          return {error: `weekStart ${input.weekStart} is not a Monday. Use the Monday that begins the week.`};
        }
        // Guard: all 7 distinct weekdays present exactly once.
        const seen = new Set(input.days.map(d => d.weekday));
        if (seen.size !== 7) {
          return {error: `Provide all 7 weekdays (mon–sun) exactly once. Got: ${input.days.map(d => d.weekday).join(', ')}.`};
        }

        // Replace existing plan for this week
        await db
          .delete(schema.weeklyPlan)
          .where(and(eq(schema.weeklyPlan.athleteId, athleteId), eq(schema.weeklyPlan.weekStart, input.weekStart)));

        const days = input.days
          .map(d => dayFromWeekday(input.weekStart, d))
          .sort((a, b) => a.date.localeCompare(b.date));

        const [row] = await db
          .insert(schema.weeklyPlan)
          .values({
            id: now,
            athleteId,
            trainingPlanId: input.trainingPlanId,
            weekStart: input.weekStart,
            phase: input.phase,
            weekNumber: input.weekNumber,
            targetWeeklyKm: input.targetWeeklyKm ?? null,
            days,
            coachNotes: input.coachNotes ?? null,
            generatedAt: now,
          })
          .returning();

        invalidateCoachPromptCache(athleteId);

        // Return the authoritative saved layout — the coach MUST restate this to the
        // athlete rather than its own recollection of what it intended to save.
        return {
          success: true,
          weeklyPlanId: row.id,
          weekStart: row.weekStart,
          savedLayout: summarizeWeek(days),
        };
      },
    }),

    setWeeklyPlanDays: tool({
      description:
        "Edit specific days of an EXISTING weekly plan without rewriting the whole week. Use this for any small change — moving the long run, swapping two days, marking a day as a hike/rest, adjusting one workout. Address each day by its WEEKDAY NAME (mon…sun); the exact calendar date is computed server-side from the week, so you never compute dates yourself. Only the days you pass are replaced; every other day is left exactly as stored. Prefer this over saveWeeklyPlan whenever a plan already exists for the week. Refuses to overwrite a day that contains a completed [done] workout. Returns the full resulting Mon–Sun layout, which you MUST restate to the athlete verbatim instead of describing your intent.",
      inputSchema: z.object({
        weekStart: z.string().describe('Monday date YYYY-MM-DD of the existing plan'),
        coachNotes: z
          .string()
          .nullable()
          .optional()
          .describe('Optional updated coach explanation. MUST match the actual resulting layout. Omit to leave unchanged.'),
        days: z
          .array(weekdayDaySchema)
          .min(1)
          .describe('Only the days to change (1–7), addressed by weekday name.'),
      }),
      execute: async input => {
        const rows = await db
          .select()
          .from(schema.weeklyPlan)
          .where(and(eq(schema.weeklyPlan.athleteId, athleteId), eq(schema.weeklyPlan.weekStart, input.weekStart)))
          .limit(1);

        const existing = rows[0];
        if (!existing) {
          return {error: `No weekly plan exists for ${input.weekStart}. Generate it first with saveWeeklyPlan.`};
        }

        const current = (existing.days as StoredDayInput[]).map(normalizeDay);
        const byDate = new Map(current.map(d => [d.date, d]));
        const changed: string[] = [];

        for (const patch of input.days) {
          const day = dayFromWeekday(input.weekStart, patch);
          const target = byDate.get(day.date);
          if (target && target.workouts.some(w => w.completed)) {
            return {
              error: `Refusing to edit ${patch.weekday} (${day.date}): it contains a completed [done] workout. Completed days are fixed.`,
            };
          }
          byDate.set(day.date, day);
          changed.push(`${patch.weekday} ${day.date}`);
        }

        const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

        await db
          .update(schema.weeklyPlan)
          .set({
            days,
            ...(input.coachNotes !== undefined ? {coachNotes: input.coachNotes} : {}),
          })
          .where(eq(schema.weeklyPlan.id, existing.id));

        invalidateCoachPromptCache(athleteId);

        return {
          success: true,
          weekStart: input.weekStart,
          changed,
          savedLayout: summarizeWeek(days),
        };
      },
    }),

    setGoal: tool({
      description:
        "Save or update the athlete's training goal in structured form. Call this once you have gathered the goal info via askQuestion and follow-up chat. Deactivates any active training plan (since the new goal invalidates the old plan). Provide the fields you've gathered; leave others null.",
      inputSchema: z.object({
        goalType: z.enum(['marathon', 'half_marathon', '10k', '5k', 'general_fitness']),
        targetDate: z.string().nullable().optional().describe('YYYY-MM-DD format or null'),
        targetEventName: z.string().nullable().optional().describe('e.g. "Berlin Marathon 2026"'),
        targetTimeMinutes: z.number().nullable().optional().describe('Total minutes for goal finish time (e.g. 225 for 3:45)'),
        recentPeakWeeklyKm: z.number().nullable().optional().describe('Highest weekly km in past 3 months — call getPeakWeeklyKm to compute'),
        experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']),
        injuryHistory: z.string().nullable().optional(),
        additionalNotes: z.string().nullable().optional(),
      }),
      execute: async input => {
        const now = Date.now();

        // Deactivate active plan when goal changes
        await db
          .update(schema.trainingPlan)
          .set({isActive: false, updatedAt: now})
          .where(and(eq(schema.trainingPlan.athleteId, athleteId), eq(schema.trainingPlan.isActive, true)));

        const existing = await db
          .select()
          .from(schema.coachGoal)
          .where(eq(schema.coachGoal.athleteId, athleteId))
          .limit(1);

        const fields = {
          goalType: input.goalType,
          targetDate: input.targetDate ?? null,
          targetEventName: input.targetEventName ?? null,
          targetTimeMinutes: input.targetTimeMinutes ?? null,
          recentPeakWeeklyKm: input.recentPeakWeeklyKm ?? null,
          experienceLevel: input.experienceLevel,
          injuryHistory: input.injuryHistory ?? null,
          additionalNotes: input.additionalNotes ?? null,
        };

        if (existing[0]) {
          await db
            .update(schema.coachGoal)
            .set({...fields, updatedAt: now})
            .where(eq(schema.coachGoal.athleteId, athleteId));
        } else {
          await db.insert(schema.coachGoal).values({
            athleteId,
            ...fields,
            createdAt: now,
            updatedAt: now,
          });
        }

        invalidateCoachPromptCache(athleteId);
        return {
          success: true,
          message: `Goal saved: ${input.goalType}${input.targetEventName ? ` — ${input.targetEventName}` : ''}${input.targetDate ? ` on ${input.targetDate}` : ''}`,
        };
      },
    }),

    getPeakWeeklyKm: tool({
      description:
        "Compute the athlete's highest weekly running km over the past 90 days. Use during onboarding to populate recentPeakWeeklyKm for setGoal.",
      inputSchema: z.object({}),
      execute: async () => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);
        const cutoffDate = cutoff.toISOString().slice(0, 10);

        const rows = await db
          .select({date: schema.activities.date, data: schema.activities.data})
          .from(schema.activities)
          .where(and(eq(schema.activities.athleteId, athleteId), gte(schema.activities.date, cutoffDate)));

        if (!rows.length) return {peakWeeklyKm: null, message: 'No activities in the last 90 days.'};

        const weeklyKm: Record<string, number> = {};
        for (const row of rows) {
          const d = row.data as {sport_type?: string; type?: string; distance?: number};
          const sportType = d.sport_type ?? d.type ?? '';
          if (!sportType.toLowerCase().includes('run')) continue;
          const distKm = (d.distance ?? 0) / 1000;
          if (distKm <= 0) continue;

          const date = new Date(row.date + 'T12:00:00');
          const day = (date.getDay() + 6) % 7;
          const monday = new Date(date);
          monday.setDate(date.getDate() - day);
          const weekKey = monday.toISOString().slice(0, 10);

          weeklyKm[weekKey] = (weeklyKm[weekKey] ?? 0) + distKm;
        }

        const values = Object.values(weeklyKm);
        if (!values.length) return {peakWeeklyKm: null, message: 'No running activities found.'};

        return {peakWeeklyKm: Math.round(Math.max(...values))};
      },
    }),

    updateAthleteNotes: tool({
      description:
        "Update accumulated knowledge about this athlete. Call when you learn something new: injuries, preferences, how they respond to training.",
      inputSchema: z.object({
        injuryHistory: z
          .array(
            z.object({
              date: z.string(),
              bodyPart: z.string(),
              severity: z.enum(['minor', 'moderate', 'serious']),
              description: z.string(),
              resolved: z.boolean(),
            }),
          )
          .optional(),
        preferences: z.record(z.string(), z.string()).optional(),
        responsePatterns: z.record(z.string(), z.string()).optional(),
        freeformNotes: z.string().optional(),
      }),
      execute: async patch => {
        const now = Date.now();
        const existing = await db
          .select()
          .from(schema.athleteNotes)
          .where(eq(schema.athleteNotes.athleteId, athleteId))
          .limit(1);

        const cur = existing[0];
        if (cur) {
          await db
            .update(schema.athleteNotes)
            .set({
              injuryHistory: patch.injuryHistory
                ? [...(cur.injuryHistory as unknown[]), ...patch.injuryHistory]
                : cur.injuryHistory,
              preferences: patch.preferences
                ? {...(cur.preferences as Record<string, string>), ...patch.preferences}
                : cur.preferences,
              responsePatterns: patch.responsePatterns
                ? {...(cur.responsePatterns as Record<string, string>), ...patch.responsePatterns}
                : cur.responsePatterns,
              freeformNotes: patch.freeformNotes
                ? (cur.freeformNotes ? cur.freeformNotes + '\n\n' + patch.freeformNotes : patch.freeformNotes)
                : cur.freeformNotes,
              lastUpdatedAt: now,
            })
            .where(eq(schema.athleteNotes.athleteId, athleteId));
        } else {
          await db.insert(schema.athleteNotes).values({
            athleteId,
            injuryHistory: patch.injuryHistory ?? [],
            preferences: patch.preferences ?? {},
            responsePatterns: patch.responsePatterns ?? {},
            freeformNotes: patch.freeformNotes ?? null,
            lastUpdatedAt: now,
          });
        }

        invalidateCoachPromptCache(athleteId);
        return {success: true};
      },
    }),

    getActivityWeather: tool({
      description:
        "Get the weather conditions during a specific past run. Returns temperature, feels-like, wind, humidity, precipitation and condition. Use to understand how weather affected performance.",
      inputSchema: z.object({
        activityId: z.number().describe('Strava activity ID'),
      }),
      execute: async ({activityId}) => {
        // Check DB cache first
        const cached = await db
          .select()
          .from(schema.activityWeather)
          .where(eq(schema.activityWeather.activityId, activityId))
          .limit(1);

        if (cached[0]) {
          const w = cached[0].data as ActivityWeatherData;
          return {
            activityId,
            temperatureC: w.temperatureC,
            apparentTemperatureC: w.apparentTemperatureC,
            conditionLabel: w.conditionLabel,
            conditionEmoji: w.conditionEmoji,
            windSpeedKmh: w.windSpeedKmh,
            windDirection: windDirectionLabel(w.windDirectionDeg),
            humidityPct: w.humidityPct,
            precipitationMm: w.precipitationMm,
          };
        }

        // Not cached — fetch from activity detail
        const detailRows = await db
          .select()
          .from(schema.activityDetails)
          .where(eq(schema.activityDetails.id, activityId))
          .limit(1);

        const detail = detailRows[0]?.data as {
          start_latlng?: number[];
          start_date?: string;
          start_date_local?: string;
        } | undefined;

        if (!detail?.start_latlng?.length || !detail.start_date || !detail.start_date_local) {
          return {error: 'No GPS data for this activity — cannot fetch weather.'};
        }

        const activityDate = detail.start_date_local.slice(0, 10);
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        if (activityDate >= yesterday) {
          return {error: 'Weather archive not available for very recent activities.'};
        }

        const [lat, lng] = detail.start_latlng;
        const utcHour = new Date(detail.start_date).getUTCHours();
        const weather = await fetchHistoricalWeather(lat, lng, activityDate, utcHour);

        if (!weather) return {error: 'Could not fetch weather data for this activity.'};

        // Persist to cache
        await db
          .insert(schema.activityWeather)
          .values({activityId, athleteId, data: weather, fetchedAt: Date.now()})
          .onConflictDoNothing();

        return {
          activityId,
          temperatureC: weather.temperatureC,
          apparentTemperatureC: weather.apparentTemperatureC,
          conditionLabel: weather.conditionLabel,
          conditionEmoji: weather.conditionEmoji,
          windSpeedKmh: weather.windSpeedKmh,
          windDirection: windDirectionLabel(weather.windDirectionDeg),
          humidityPct: weather.humidityPct,
          precipitationMm: weather.precipitationMm,
        };
      },
    }),

    getActivityData: tool({
      description:
        "Retrieve a single activity at one of three completeness tiers. detail 1 = overall summary (avg pace, avg/max HR, distance, duration, elevation). detail 2 = per-kilometer splits (pace, avg HR, elevation gain per km) — use to judge pacing and HR drift. detail 3 = ~50 evenly-spaced high-resolution samples (time, distance, pace, HR, altitude) for fine intra-run trends. Higher tiers return more data and cost more tokens — start at 1 and escalate only when a question needs it. Tiers 2/3 require cached stream data; when it isn't available the summary is returned with a detailNote.",
      inputSchema: z.object({
        activityId: z.number().describe('Strava activity ID'),
        detail: z
          .union([z.literal(1), z.literal(2), z.literal(3)])
          .default(1)
          .describe('Completeness tier: 1 = summary, 2 = per-km splits, 3 = high-res samples'),
      }),
      execute: async ({activityId, detail}) => {
        const actRows = await db
          .select()
          .from(schema.activities)
          .where(and(eq(schema.activities.athleteId, athleteId), eq(schema.activities.id, activityId)))
          .limit(1);

        if (!actRows[0]) return {error: `Activity ${activityId} not found.`};

        const a = transformActivity(actRows[0].data as Parameters<typeof transformActivity>[0]);
        const paceMin = Math.floor(a.avgPace);
        const paceSec = Math.round((a.avgPace - paceMin) * 60);
        const summary = {
          id: a.id,
          name: a.name,
          date: a.date,
          type: a.type,
          distanceKm: Number(a.distance.toFixed(2)),
          durationMin: Number((a.duration / 60).toFixed(0)),
          avgPace: a.avgPace > 0 ? `${paceMin}:${String(paceSec).padStart(2, '0')} min/km` : null,
          avgHr: a.avgHr > 0 ? Math.round(a.avgHr) : null,
          maxHr: a.maxHr > 0 ? Math.round(a.maxHr) : null,
          elevationGainM: Math.round(a.elevationGain),
        };

        if (detail === 1) return {tier: 1, summary};

        // Tiers 2/3 need the cached HR/pace stream — DB-only read, no Strava fetch.
        const streamRows = await db
          .select()
          .from(schema.activityStreams)
          .where(
            and(
              eq(schema.activityStreams.athleteId, athleteId),
              eq(schema.activityStreams.activityId, activityId),
            ),
          )
          .limit(1);

        if (!streamRows[0]) {
          return {
            tier: 1,
            summary,
            detailNote:
              'Detailed stream data is not cached for this activity yet — only the summary is available.',
          };
        }

        const stream = transformStreams(
          streamRows[0].data as Parameters<typeof transformStreams>[0],
        );

        if (detail === 2) {
          const splits = computeKmSplits(stream).map(s => ({
            km: s.km,
            distanceKm: s.distanceKm,
            pace: s.paceMinPerKm > 0 ? `${formatPace(s.paceMinPerKm)} min/km` : null,
            avgHr: s.avgHr,
            elevGainM: s.elevGainM,
            durationSec: s.durationSec,
          }));
          return {tier: 2, summary, splits, splitCount: splits.length};
        }

        // detail === 3
        const samples = downsampleStream(stream).map(s => ({
          timeSec: s.timeSec,
          distanceKm: s.distanceKm,
          pace: s.paceMinPerKm > 0 ? `${formatPace(s.paceMinPerKm)} min/km` : null,
          hr: s.hr,
          altitudeM: s.altitudeM,
        }));
        return {tier: 3, summary, samples, sampleCount: samples.length};
      },
    }),

    getWeatherForecast: tool({
      description:
        "Get current conditions and a 7-day weather forecast for a location. Use to recommend optimal training days, warn about bad conditions, or plan race-day preparation. Defaults to the athlete's saved city if no location is provided.",
      inputSchema: z.object({
        location: z.string().optional().describe('City name (e.g. "Milan", "London") or leave empty to use the athlete\'s saved city'),
      }),
      execute: async ({location}) => {
        let resolvedLocation = location;

        if (!resolvedLocation) {
          const settingsRows = await db
            .select()
            .from(schema.userSettings)
            .where(eq(schema.userSettings.athleteId, athleteId))
            .limit(1);
          resolvedLocation = settingsRows[0]?.city ?? undefined;
        }

        if (!resolvedLocation) {
          return {error: 'No location provided and no city saved in settings. Ask the athlete for their city.'};
        }

        const forecast = await fetchWeatherForecast(resolvedLocation);
        if (!forecast) {
          return {error: `Could not fetch weather for "${resolvedLocation}". Check the spelling or try a different city name.`};
        }

        return {
          location: forecast.locationName ?? resolvedLocation,
          current: forecast.current,
          daily: forecast.daily.map((d) => ({
            date: d.date,
            conditionEmoji: d.conditionEmoji,
            conditionLabel: d.conditionLabel,
            maxTempC: d.maxTempC,
            minTempC: d.minTempC,
            precipProbabilityPct: d.precipProbabilityPct,
            precipitationMm: d.precipitationMm,
            windSpeedKmh: d.windSpeedKmh,
          })),
        };
      },
    }),

    linkCompletedActivity: tool({
      description:
        "Mark a planned workout as completed and link it to a Strava activity. Call when the athlete says they completed a workout.",
      inputSchema: z.object({
        weekStart: z.string().describe('YYYY-MM-DD Monday'),
        date: z.string().describe('YYYY-MM-DD date of the workout'),
        workoutIndex: z.number().describe('0-based index within that day'),
        stravaActivityId: z.number(),
      }),
      execute: async ({weekStart, date, workoutIndex, stravaActivityId}) => {
        const rows = await db
          .select()
          .from(schema.weeklyPlan)
          .where(and(eq(schema.weeklyPlan.athleteId, athleteId), eq(schema.weeklyPlan.weekStart, weekStart)))
          .limit(1);

        if (!rows[0]) return {success: false, message: 'Weekly plan not found.'};

        const days = rows[0].days as Array<{date: string; workouts: Array<{completed: boolean; linkedStravaActivityId: number | null; type: string}>}>;
        const dayIdx = days.findIndex(d => d.date === date);
        if (dayIdx === -1) return {success: false, message: `No day found for ${date}.`};

        const workouts = days[dayIdx].workouts;
        if (workoutIndex >= workouts.length) return {success: false, message: 'Workout index out of range.'};

        workouts[workoutIndex].completed = true;
        workouts[workoutIndex].linkedStravaActivityId = stravaActivityId;

        await db.update(schema.weeklyPlan).set({days}).where(eq(schema.weeklyPlan.id, rows[0].id));

        return {success: true, message: `Linked Strava activity ${stravaActivityId} to ${workouts[workoutIndex].type} on ${date}.`};
      },
    }),

    getDecouplingTrend: tool({
      description:
        "Get aerobic decoupling data for recent long runs (≥45 min). Decoupling measures HR drift vs pace — lower is better (<5% = well coupled, 5–8% = acceptable, >8% = decoupled). Use to assess aerobic base quality and easy-run pacing.",
      inputSchema: z.object({
        limit: z.number().default(10).describe('Number of recent long runs to return (default 10)'),
      }),
      execute: async ({limit}) => {
        const MIN_DURATION_SECS = 45 * 60;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);
        const cutoffStr = cutoff.toISOString().slice(0, 10);

        const zbRows = await db
          .select({activityId: schema.zoneBreakdowns.activityId, decouplingPct: schema.zoneBreakdowns.decouplingPct})
          .from(schema.zoneBreakdowns)
          .where(
            and(
              eq(schema.zoneBreakdowns.athleteId, athleteId),
              isNotNull(schema.zoneBreakdowns.decouplingPct),
            ),
          );

        if (zbRows.length === 0) return {runs: [], message: 'No decoupling data yet — data populates as activities are viewed.'};

        const actIds = zbRows.map((r) => r.activityId);
        const decoupMap = new Map(zbRows.map((r) => [r.activityId, r.decouplingPct as number]));

        const actRows = await db
          .select({id: schema.activities.id, date: schema.activities.date, data: schema.activities.data})
          .from(schema.activities)
          .where(
            and(
              eq(schema.activities.athleteId, athleteId),
              gte(schema.activities.date, cutoffStr),
              sql`${schema.activities.id} = ANY(ARRAY[${sql.raw(actIds.join(','))}]::bigint[])`,
            ),
          )
          .orderBy(desc(schema.activities.date))
          .limit(limit * 3);

        const runs = actRows
          .filter((r) => {
            const d = r.data as {sport_type?: string; type?: string; moving_time?: number};
            const sport = d.sport_type ?? d.type ?? '';
            return sport.toLowerCase().includes('run') && (d.moving_time ?? 0) >= MIN_DURATION_SECS;
          })
          .slice(0, limit)
          .map((r) => {
            const d = r.data as {name?: string; moving_time?: number};
            const pct = decoupMap.get(Number(r.id)) ?? 0;
            return {
              activityId: Number(r.id),
              name: d.name ?? 'Run',
              date: r.date,
              durationMins: Math.round((d.moving_time ?? 0) / 60),
              decouplingPct: pct,
              assessment: pct < 5 ? 'well coupled' : pct < 8 ? 'mild decoupling' : 'high decoupling',
            };
          });

        const avg = runs.length > 0
          ? Number((runs.reduce((s, r) => s + r.decouplingPct, 0) / runs.length).toFixed(1))
          : null;

        return {
          runs,
          avgDecouplingPct: avg,
          summary: avg == null ? 'No data' : avg < 5 ? 'Strong aerobic base — runs well coupled' : avg < 8 ? 'Moderate aerobic efficiency' : 'Elevated decoupling — consider more easy aerobic volume',
        };
      },
    }),

    getGearStatus: tool({
      description:
        "Get the athlete's gear (shoes and bikes) with mileage, retirement thresholds, and wear percentage. Use when planning long runs or discussing injury prevention.",
      inputSchema: z.object({}),
      execute: async () => {
        const gearRows = await db
          .select()
          .from(schema.athleteGear)
          .where(eq(schema.athleteGear.athleteId, athleteId))
          .limit(1);

        if (!gearRows[0]) return {gear: [], message: 'No gear synced. Gear syncs from Strava on next login.'};

        const thresholdRows = await db
          .select()
          .from(schema.gearThresholds)
          .where(eq(schema.gearThresholds.athleteId, athleteId));
        const threshMap = new Map(thresholdRows.map((t) => [t.gearId, t.thresholdMeters]));

        const statsRows = await db
          .select()
          .from(schema.athleteStats)
          .where(eq(schema.athleteStats.athleteId, athleteId))
          .limit(1);
        const recentRunM = (statsRows[0]?.data as {recent_run_totals?: {distance?: number}} | undefined)?.recent_run_totals?.distance ?? 0;
        const avgWeeklyMeters = recentRunM / 4;

        const allGear = [
          ...(gearRows[0].bikes as Array<{id: string; name: string; distance: number; primary: boolean}>).map((g) => ({...g, type: 'bike' as const})),
          ...(gearRows[0].shoes as Array<{id: string; name: string; distance: number; primary: boolean}>).map((g) => ({...g, type: 'shoe' as const})),
        ];

        const retiredIds = new Set(gearRows[0].retiredGearIds as string[]);

        const gear = allGear
          .filter((g) => !retiredIds.has(g.id))
          .map((g) => {
            const threshold = threshMap.get(g.id) ?? null;
            const distanceKm = Number((g.distance / 1000).toFixed(0));
            const thresholdKm = threshold ? Number((threshold / 1000).toFixed(0)) : null;
            const pctUsed = threshold && threshold > 0 ? Number(((g.distance / threshold) * 100).toFixed(0)) : null;
            let estimatedRetirementDate: string | null = null;
            if (threshold && avgWeeklyMeters > 0) {
              const remainingMeters = threshold - g.distance;
              if (remainingMeters > 0) {
                const weeksLeft = remainingMeters / avgWeeklyMeters;
                const retireDate = new Date();
                retireDate.setDate(retireDate.getDate() + Math.round(weeksLeft * 7));
                estimatedRetirementDate = retireDate.toISOString().slice(0, 10);
              } else {
                estimatedRetirementDate = 'overdue';
              }
            }
            return {
              gearId: g.id,
              name: g.name,
              type: g.type,
              primary: g.primary,
              distanceKm,
              thresholdKm,
              pctUsed,
              estimatedRetirementDate,
              status: pctUsed == null ? 'no threshold set' : pctUsed >= 100 ? 'overdue for retirement' : pctUsed >= 80 ? 'nearing retirement' : 'ok',
            };
          });

        return {gear};
      },
    }),

    askQuestion: tool({
      description:
        "Present the user with a structured multiple-choice question when you need clarification or want to guide them through a decision. Use this instead of asking in free text when 2–4 discrete options capture the full range of sensible answers.",
      inputSchema: z.object({
        question: z.string().describe("The question to ask the user — one concise sentence."),
        options: z
          .array(z.object({
            value: z.string().describe("Machine-readable identifier (snake_case)"),
            label: z.string().describe("Human-readable button text shown to the user"),
          }))
          .min(2)
          .max(4)
          .describe("2 to 4 answer options"),
      }),
      execute: async ({question, options}) => ({
        status: 'question_presented',
        question,
        optionCount: options.length,
        instruction: "The question has been shown to the user with clickable option buttons. Wait for the user's reply; do not produce additional text in the same turn.",
      }),
    }),
  };
}
