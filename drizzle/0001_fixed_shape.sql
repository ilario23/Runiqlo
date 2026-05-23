CREATE TABLE "activity_weather" (
	"activity_id" bigint PRIMARY KEY NOT NULL,
	"athlete_id" bigint DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "athlete_notes" (
	"athlete_id" bigint PRIMARY KEY NOT NULL,
	"injury_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_patterns" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"freeform_notes" text,
	"last_updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_goal" (
	"athlete_id" bigint PRIMARY KEY NOT NULL,
	"goal_type" text NOT NULL,
	"target_date" text,
	"target_event_name" text,
	"weekly_hours_available" real DEFAULT 6 NOT NULL,
	"experience_level" text DEFAULT 'intermediate' NOT NULL,
	"injury_history" text,
	"additional_notes" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_messages" (
	"id" bigint PRIMARY KEY NOT NULL,
	"athlete_id" bigint NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_call_id" text,
	"tool_name" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_plan" (
	"id" bigint PRIMARY KEY NOT NULL,
	"athlete_id" bigint NOT NULL,
	"goal_type" text NOT NULL,
	"target_date" text,
	"start_date" text NOT NULL,
	"phases" jsonb NOT NULL,
	"current_phase_index" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"generated_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_plan" (
	"id" bigint PRIMARY KEY NOT NULL,
	"athlete_id" bigint NOT NULL,
	"training_plan_id" bigint NOT NULL,
	"week_start" text NOT NULL,
	"phase" text NOT NULL,
	"week_number" integer NOT NULL,
	"target_weekly_km" real,
	"days" jsonb NOT NULL,
	"coach_notes" text,
	"generated_at" bigint NOT NULL
);
