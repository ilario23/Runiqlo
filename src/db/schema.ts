import {pgTable, bigint, integer, real, text, jsonb, boolean} from 'drizzle-orm/pg-core';

export const activities = pgTable('activities', {
  id: bigint('id', {mode: 'number'}).primaryKey(),
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull().default(0),
  data: jsonb('data').notNull(),
  date: text('date').notNull(),
  fetchedAt: bigint('fetched_at', {mode: 'number'}).notNull(),
});

export const activityDetails = pgTable('activity_details', {
  id: bigint('id', {mode: 'number'}).primaryKey(),
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull().default(0),
  data: jsonb('data').notNull(),
  fetchedAt: bigint('fetched_at', {mode: 'number'}).notNull(),
});

export const activityStreams = pgTable('activity_streams', {
  activityId: bigint('activity_id', {mode: 'number'}).primaryKey(),
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull().default(0),
  data: jsonb('data').notNull(),
  fetchedAt: bigint('fetched_at', {mode: 'number'}).notNull(),
});

export const athleteStats = pgTable('athlete_stats', {
  athleteId: bigint('athlete_id', {mode: 'number'}).primaryKey(),
  data: jsonb('data').notNull(),
  fetchedAt: bigint('fetched_at', {mode: 'number'}).notNull(),
});

export const athleteZones = pgTable('athlete_zones', {
  key: text('key').primaryKey(),
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull().default(0),
  data: jsonb('data').notNull(),
  fetchedAt: bigint('fetched_at', {mode: 'number'}).notNull(),
});

export const athleteGear = pgTable('athlete_gear', {
  key: text('key').primaryKey(),
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull().default(0),
  bikes: jsonb('bikes').notNull(),
  shoes: jsonb('shoes').notNull(),
  retiredGearIds: jsonb('retired_gear_ids').notNull().default([]),
  fetchedAt: bigint('fetched_at', {mode: 'number'}).notNull(),
});

export const zoneBreakdowns = pgTable('zone_breakdowns', {
  activityId: bigint('activity_id', {mode: 'number'}).primaryKey(),
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull().default(0),
  settingsHash: text('settings_hash').notNull(),
  zones: jsonb('zones').notNull(),
  computedAt: bigint('computed_at', {mode: 'number'}).notNull(),
});

export const dashboardCache = pgTable('dashboard_cache', {
  key: text('key').primaryKey(),
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull(),
  settingsHash: text('settings_hash').notNull(),
  lastActivityId: bigint('last_activity_id', {mode: 'number'}).notNull(),
  lastActivityCount: integer('last_activity_count').notNull(),
  lastDate: text('last_date').notNull(),
  continuationState: jsonb('continuation_state').notNull(),
  data: jsonb('data').notNull(),
  computedAt: bigint('computed_at', {mode: 'number'}).notNull(),
});

export const bestEffortsCache = pgTable('best_efforts_cache', {
  athleteId: bigint('athlete_id', {mode: 'number'}).primaryKey(),
  bests: jsonb('bests').notNull(),
  activityCount: integer('activity_count').notNull(),
  computedAt: bigint('computed_at', {mode: 'number'}).notNull(),
});

export const userSettings = pgTable('user_settings', {
  athleteId: bigint('athlete_id', {mode: 'number'}).primaryKey(),
  maxHr: integer('max_hr').notNull().default(190),
  restingHr: integer('resting_hr').notNull().default(55),
  zones: jsonb('zones').notNull(),
  paceZones: jsonb('pace_zones'),
  weight: real('weight'),
  city: text('city'),
  updatedAt: bigint('updated_at', {mode: 'number'}).notNull(),
});

// ── Coach tables ──────────────────────────────────────────────────────────────

export const coachGoal = pgTable('coach_goal', {
  athleteId: bigint('athlete_id', {mode: 'number'}).primaryKey(),
  goalType: text('goal_type').notNull(), // 'marathon'|'half_marathon'|'10k'|'5k'|'general_fitness'
  targetDate: text('target_date'), // YYYY-MM-DD; null for general fitness
  targetEventName: text('target_event_name'),
  weeklyHoursAvailable: real('weekly_hours_available').notNull().default(6),
  experienceLevel: text('experience_level').notNull().default('intermediate'),
  injuryHistory: text('injury_history'),
  additionalNotes: text('additional_notes'),
  createdAt: bigint('created_at', {mode: 'number'}).notNull(),
  updatedAt: bigint('updated_at', {mode: 'number'}).notNull(),
});

export const trainingPlan = pgTable('training_plan', {
  id: bigint('id', {mode: 'number'}).primaryKey(), // Date.now()
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull(),
  goalType: text('goal_type').notNull(),
  targetDate: text('target_date'),
  startDate: text('start_date').notNull(),
  phases: jsonb('phases').notNull(), // TrainingPhase[]
  currentPhaseIndex: integer('current_phase_index').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  generatedAt: bigint('generated_at', {mode: 'number'}).notNull(),
  updatedAt: bigint('updated_at', {mode: 'number'}).notNull(),
});

export const weeklyPlan = pgTable('weekly_plan', {
  id: bigint('id', {mode: 'number'}).primaryKey(), // Date.now()
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull(),
  trainingPlanId: bigint('training_plan_id', {mode: 'number'}).notNull(),
  weekStart: text('week_start').notNull(), // YYYY-MM-DD (always Monday)
  phase: text('phase').notNull(),
  weekNumber: integer('week_number').notNull(),
  targetWeeklyKm: real('target_weekly_km'),
  days: jsonb('days').notNull(), // PlannedDay[7]
  coachNotes: text('coach_notes'),
  generatedAt: bigint('generated_at', {mode: 'number'}).notNull(),
});

export const coachMessages = pgTable('coach_messages', {
  id: bigint('id', {mode: 'number'}).primaryKey(),
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull(),
  role: text('role').notNull(), // 'user' | 'assistant' | 'tool'
  content: text('content').notNull(),
  toolCallId: text('tool_call_id'),
  toolName: text('tool_name'),
  createdAt: bigint('created_at', {mode: 'number'}).notNull(),
});

export const athleteNotes = pgTable('athlete_notes', {
  athleteId: bigint('athlete_id', {mode: 'number'}).primaryKey(),
  injuryHistory: jsonb('injury_history').notNull().default([]),
  preferences: jsonb('preferences').notNull().default({}),
  responsePatterns: jsonb('response_patterns').notNull().default({}),
  freeformNotes: text('freeform_notes'),
  lastUpdatedAt: bigint('last_updated_at', {mode: 'number'}).notNull(),
});
