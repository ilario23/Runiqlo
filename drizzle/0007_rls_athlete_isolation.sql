-- Enable RLS and add athlete isolation policies on all tables.
-- Service role bypasses RLS entirely; policies apply only to non-service connections.
-- Non-service connections must SET app.current_athlete_id = '<id>' to access rows.

-- activities
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete_isolation" ON activities
  FOR ALL
  USING (athlete_id = current_setting('app.current_athlete_id', true)::bigint)
  WITH CHECK (athlete_id = current_setting('app.current_athlete_id', true)::bigint);

-- activity_details
ALTER TABLE activity_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete_isolation" ON activity_details
  FOR ALL
  USING (athlete_id = current_setting('app.current_athlete_id', true)::bigint)
  WITH CHECK (athlete_id = current_setting('app.current_athlete_id', true)::bigint);

-- activity_streams
ALTER TABLE activity_streams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete_isolation" ON activity_streams
  FOR ALL
  USING (athlete_id = current_setting('app.current_athlete_id', true)::bigint)
  WITH CHECK (athlete_id = current_setting('app.current_athlete_id', true)::bigint);

-- activity_weather
ALTER TABLE activity_weather ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete_isolation" ON activity_weather
  FOR ALL
  USING (athlete_id = current_setting('app.current_athlete_id', true)::bigint)
  WITH CHECK (athlete_id = current_setting('app.current_athlete_id', true)::bigint);

-- segment_efforts
ALTER TABLE segment_efforts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete_isolation" ON segment_efforts
  FOR ALL
  USING (athlete_id = current_setting('app.current_athlete_id', true)::bigint)
  WITH CHECK (athlete_id = current_setting('app.current_athlete_id', true)::bigint);

-- athlete_stats
ALTER TABLE athlete_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete_isolation" ON athlete_stats
  FOR ALL
  USING (athlete_id = current_setting('app.current_athlete_id', true)::bigint)
  WITH CHECK (athlete_id = current_setting('app.current_athlete_id', true)::bigint);

-- athlete_zones
ALTER TABLE athlete_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete_isolation" ON athlete_zones
  FOR ALL
  USING (athlete_id = current_setting('app.current_athlete_id', true)::bigint)
  WITH CHECK (athlete_id = current_setting('app.current_athlete_id', true)::bigint);

-- athlete_gear
ALTER TABLE athlete_gear ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete_isolation" ON athlete_gear
  FOR ALL
  USING (athlete_id = current_setting('app.current_athlete_id', true)::bigint)
  WITH CHECK (athlete_id = current_setting('app.current_athlete_id', true)::bigint);

-- athlete_notes
ALTER TABLE athlete_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete_isolation" ON athlete_notes
  FOR ALL
  USING (athlete_id = current_setting('app.current_athlete_id', true)::bigint)
  WITH CHECK (athlete_id = current_setting('app.current_athlete_id', true)::bigint);

-- user_settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete_isolation" ON user_settings
  FOR ALL
  USING (athlete_id = current_setting('app.current_athlete_id', true)::bigint)
  WITH CHECK (athlete_id = current_setting('app.current_athlete_id', true)::bigint);

-- zone_breakdowns
ALTER TABLE zone_breakdowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete_isolation" ON zone_breakdowns
  FOR ALL
  USING (athlete_id = current_setting('app.current_athlete_id', true)::bigint)
  WITH CHECK (athlete_id = current_setting('app.current_athlete_id', true)::bigint);

-- dashboard_cache
ALTER TABLE dashboard_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete_isolation" ON dashboard_cache
  FOR ALL
  USING (athlete_id = current_setting('app.current_athlete_id', true)::bigint)
  WITH CHECK (athlete_id = current_setting('app.current_athlete_id', true)::bigint);

-- best_efforts_cache
ALTER TABLE best_efforts_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete_isolation" ON best_efforts_cache
  FOR ALL
  USING (athlete_id = current_setting('app.current_athlete_id', true)::bigint)
  WITH CHECK (athlete_id = current_setting('app.current_athlete_id', true)::bigint);

-- gear_thresholds
ALTER TABLE gear_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete_isolation" ON gear_thresholds
  FOR ALL
  USING (athlete_id = current_setting('app.current_athlete_id', true)::bigint)
  WITH CHECK (athlete_id = current_setting('app.current_athlete_id', true)::bigint);

-- coach_goal
ALTER TABLE coach_goal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete_isolation" ON coach_goal
  FOR ALL
  USING (athlete_id = current_setting('app.current_athlete_id', true)::bigint)
  WITH CHECK (athlete_id = current_setting('app.current_athlete_id', true)::bigint);

-- training_plan
ALTER TABLE training_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete_isolation" ON training_plan
  FOR ALL
  USING (athlete_id = current_setting('app.current_athlete_id', true)::bigint)
  WITH CHECK (athlete_id = current_setting('app.current_athlete_id', true)::bigint);

-- weekly_plan
ALTER TABLE weekly_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete_isolation" ON weekly_plan
  FOR ALL
  USING (athlete_id = current_setting('app.current_athlete_id', true)::bigint)
  WITH CHECK (athlete_id = current_setting('app.current_athlete_id', true)::bigint);

-- coach_messages
ALTER TABLE coach_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "athlete_isolation" ON coach_messages
  FOR ALL
  USING (athlete_id = current_setting('app.current_athlete_id', true)::bigint)
  WITH CHECK (athlete_id = current_setting('app.current_athlete_id', true)::bigint);
