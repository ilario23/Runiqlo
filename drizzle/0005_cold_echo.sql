CREATE TABLE "gear_thresholds" (
	"gear_id" text PRIMARY KEY NOT NULL,
	"athlete_id" bigint NOT NULL,
	"threshold_meters" integer NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "zone_breakdowns" ADD COLUMN "decoupling_pct" real;