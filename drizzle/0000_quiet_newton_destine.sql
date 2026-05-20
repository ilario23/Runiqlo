CREATE TABLE "activities" (
	"id" bigint PRIMARY KEY NOT NULL,
	"athlete_id" bigint DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL,
	"date" text NOT NULL,
	"fetched_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_details" (
	"id" bigint PRIMARY KEY NOT NULL,
	"athlete_id" bigint DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_streams" (
	"activity_id" bigint PRIMARY KEY NOT NULL,
	"athlete_id" bigint DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "athlete_gear" (
	"key" text PRIMARY KEY NOT NULL,
	"athlete_id" bigint DEFAULT 0 NOT NULL,
	"bikes" jsonb NOT NULL,
	"shoes" jsonb NOT NULL,
	"retired_gear_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fetched_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "athlete_stats" (
	"athlete_id" bigint PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "athlete_zones" (
	"key" text PRIMARY KEY NOT NULL,
	"athlete_id" bigint DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "best_efforts_cache" (
	"athlete_id" bigint PRIMARY KEY NOT NULL,
	"bests" jsonb NOT NULL,
	"activity_count" integer NOT NULL,
	"computed_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"athlete_id" bigint NOT NULL,
	"settings_hash" text NOT NULL,
	"last_activity_id" bigint NOT NULL,
	"last_activity_count" integer NOT NULL,
	"last_date" text NOT NULL,
	"continuation_state" jsonb NOT NULL,
	"data" jsonb NOT NULL,
	"computed_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"athlete_id" bigint PRIMARY KEY NOT NULL,
	"max_hr" integer DEFAULT 190 NOT NULL,
	"resting_hr" integer DEFAULT 55 NOT NULL,
	"zones" jsonb NOT NULL,
	"pace_zones" jsonb,
	"weight" real,
	"city" text,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zone_breakdowns" (
	"activity_id" bigint PRIMARY KEY NOT NULL,
	"athlete_id" bigint DEFAULT 0 NOT NULL,
	"settings_hash" text NOT NULL,
	"zones" jsonb NOT NULL,
	"computed_at" bigint NOT NULL
);
