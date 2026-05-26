ALTER TABLE "training_plan" ADD COLUMN IF NOT EXISTS "week_sketches" jsonb;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "coach_model" text;