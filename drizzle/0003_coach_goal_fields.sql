ALTER TABLE "coach_goal" ADD COLUMN "target_time_minutes" integer;
--> statement-breakpoint
ALTER TABLE "coach_goal" ADD COLUMN "recent_peak_weekly_km" real;
--> statement-breakpoint
ALTER TABLE "coach_goal" ALTER COLUMN "weekly_hours_available" DROP NOT NULL;
