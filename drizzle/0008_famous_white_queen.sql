CREATE TABLE "strava_sessions" (
	"session_token_hash" text PRIMARY KEY NOT NULL,
	"athlete_id" bigint NOT NULL,
	"refresh_token" text NOT NULL,
	"created_at" bigint NOT NULL,
	"last_used_at" bigint NOT NULL
);

-- Lock down: only the service-role connection (which bypasses RLS) may touch
-- session rows. RLS enabled with no policies = deny-all for everyone else.
ALTER TABLE strava_sessions ENABLE ROW LEVEL SECURITY;
