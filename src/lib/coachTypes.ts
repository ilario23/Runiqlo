export type GoalType =
  | 'marathon'
  | 'half_marathon'
  | '10k'
  | '5k'
  | 'general_fitness';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export type PlanPhase = 'base' | 'build' | 'peak' | 'taper';

export type WorkoutType =
  | 'easy_run'
  | 'long_run'
  | 'tempo_run'
  | 'interval_run'
  | 'recovery_run'
  | 'gym'
  | 'cycling'
  | 'yoga'
  | 'cross_training'
  | 'rest'
  | 'swim'
  | 'walk'
  | 'hike';

export interface Goal {
  athleteId: number;
  goalType: GoalType;
  targetDate: string | null;
  targetEventName: string | null;
  targetTimeMinutes: number | null;
  recentPeakWeeklyKm: number | null;
  weeklyHoursAvailable: number | null;
  experienceLevel: ExperienceLevel;
  injuryHistory: string | null;
  additionalNotes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TrainingPhase {
  phase: PlanPhase;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  weekCount: number;
  focusDescription: string;
  targetWeeklyKmRange: [number, number];
  keyWorkouts: string[];
}

export interface WeekSketch {
  weekNumber: number;
  weekStart: string; // YYYY-MM-DD (Monday)
  phase: PlanPhase;
  targetKm: number;
  keyWorkoutTypes: WorkoutType[];
  progressionNote: string;
}

export interface TrainingPlan {
  id: number;
  athleteId: number;
  goalType: GoalType;
  targetDate: string | null;
  startDate: string;
  phases: TrainingPhase[];
  weekSketches: WeekSketch[] | null;
  currentPhaseIndex: number;
  isActive: boolean;
  generatedAt: number;
  updatedAt: number;
}

export interface PlannedWorkout {
  type: WorkoutType;
  durationMinutes: number | null;
  distanceKm: number | null;
  intensityDescription: string;
  specificInstructions: string;
  linkedStravaActivityId: number | null;
  completed: boolean;
}

export interface PlannedDay {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0=Mon … 6=Sun
  workouts: PlannedWorkout[];
  dayNotes: string | null;
}

export interface WeeklyPlan {
  id: number;
  athleteId: number;
  trainingPlanId: number;
  weekStart: string; // YYYY-MM-DD (always Monday)
  phase: PlanPhase;
  weekNumber: number;
  targetWeeklyKm: number | null;
  days: PlannedDay[];
  coachNotes: string | null;
  generatedAt: number;
}

export interface InjuryNote {
  date: string;
  bodyPart: string;
  severity: 'minor' | 'moderate' | 'serious';
  description: string;
  resolved: boolean;
}

export interface AthleteNotes {
  athleteId: number;
  injuryHistory: InjuryNote[];
  preferences: Record<string, string>;
  responsePatterns: Record<string, string>;
  freeformNotes: string | null;
  lastUpdatedAt: number;
}
