import {tool} from 'ai';
import {z} from 'zod';
import {getDb} from '@/db';
import * as schema from '@/db/schema';
import {eq, and, desc, gte, sql} from 'drizzle-orm';
import {transformActivity} from './strava';
import {fetchHistoricalWeather, fetchWeatherForecast, windDirectionLabel} from './weather';
import type {ActivityWeatherData} from './weather';

export function getCoachTools(athleteId: number) {
  const db = getDb();

  return {
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

        const fitnessData = cached.data as Array<{date: string; bf: number; li: number; it: number; tl: number}>;
        if (fitnessData.length === 0) return {error: 'No fitness data points available.'};

        const latest = fitnessData[fitnessData.length - 1];
        const bf = latest.bf;
        const li = latest.li;
        const tsb = Number((bf - li).toFixed(1));
        const acwr = bf > 0 ? Number((li / bf).toFixed(2)) : 0;

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
          ctl: bf,
          atl: li,
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
      description: "Get personal bests at standard distances. Useful for setting realistic pace targets.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await db
          .select()
          .from(schema.bestEffortsCache)
          .where(eq(schema.bestEffortsCache.athleteId, athleteId))
          .limit(1);

        if (!rows[0]) return {efforts: {}, message: 'No best efforts cached yet.'};

        const bests = rows[0].bests as Record<string, {timeSeconds: number; date: string; activityId: number}>;
        const formatted: Record<string, {time: string; date: string}> = {};

        for (const [distance, best] of Object.entries(bests)) {
          const mins = Math.floor(best.timeSeconds / 60);
          const secs = best.timeSeconds % 60;
          formatted[distance] = {
            time: `${mins}:${String(Math.round(secs)).padStart(2, '0')}`,
            date: best.date,
          };
        }

        return {efforts: formatted};
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

    saveTrainingPlan: tool({
      description:
        "Save a new macro training plan. Deactivates any existing plan and creates the new one. Call this after generating a full periodized plan.",
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
        currentPhaseIndex: z.number().default(0),
      }),
      execute: async input => {
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
            currentPhaseIndex: input.currentPhaseIndex,
            isActive: true,
            generatedAt: now,
            updatedAt: now,
          })
          .returning();

        return {success: true, planId: row.id};
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
          .array(
            z.object({
              date: z.string(),
              dayOfWeek: z.number().describe('0=Mon…6=Sun'),
              dayNotes: z.string().nullable().optional(),
              workouts: z.array(
                z.object({
                  type: z.string().describe(
                    'easy_run|long_run|tempo_run|interval_run|recovery_run|gym|cycling|yoga|cross_training|rest',
                  ),
                  durationMinutes: z.number().nullable().optional(),
                  distanceKm: z.number().nullable().optional(),
                  intensityDescription: z.string(),
                  specificInstructions: z.string(),
                  completed: z.boolean().default(false),
                  linkedStravaActivityId: z.number().nullable().optional(),
                }),
              ),
            }),
          )
          .describe('Exactly 7 days Mon–Sun'),
      }),
      execute: async input => {
        const now = Date.now();

        // Replace existing plan for this week
        await db
          .delete(schema.weeklyPlan)
          .where(and(eq(schema.weeklyPlan.athleteId, athleteId), eq(schema.weeklyPlan.weekStart, input.weekStart)));

        const days = input.days.map(d => ({
          ...d,
          dayNotes: d.dayNotes ?? null,
          workouts: d.workouts.map(w => ({
            ...w,
            linkedStravaActivityId: w.linkedStravaActivityId ?? null,
            completed: w.completed ?? false,
          })),
        }));

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

        return {success: true, weeklyPlanId: row.id, weekStart: row.weekStart};
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
