# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repo.

@AGENTS.md

## Commands

```bash
npm run dev          # start Next.js dev server
npm run build        # production build
npm run test         # run Vitest tests once
npm run test:watch   # watch mode
npm run db:generate  # generate Drizzle migrations
npm run db:migrate   # apply migrations
npm run db:push      # push schema to DB (dev shortcut)
npm run db:studio    # open Drizzle Studio
```

Single test file:
```bash
npx vitest run src/lib/__tests__/chatUtils.test.ts
```

## Architecture Overview

### Stack
- **Next.js 16** (App Router) — React 19, TypeScript, Tailwind v4
- **Database**: Supabase Postgres via **Drizzle ORM** (`src/db/schema.ts` defines all tables)
- **AI**: Vercel AI SDK v6 (`ai`) — supports Anthropic and OpenAI via `LLM_PROVIDER` env var
- **State**: TanStack React Query for server state; React context for auth and settings
- **Auth**: Strava OAuth; tokens stored client-side in localStorage

### Key Environment Variables
- `LLM_PROVIDER` — `anthropic` (uses `ANTHROPIC_API_KEY`) or any other value (uses `OPENAI_API_KEY`)
- `NEXT_PUBLIC_DEV_ATHLETE_ID` — set to bypass OAuth, auto-login as dev athlete
- `NEXT_PUBLIC_STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` — Strava OAuth
- `DATABASE_URL` — Postgres connection string

### API Auth & Rate Limiting

`src/lib/apiAuth.ts` — `requireAthlete(req, requestedAthleteId)` verifies the caller's Strava access token (httpOnly session cookie or `Authorization: Bearer`) against Strava `/athlete` (15-min in-process cache) and rejects athleteId mismatches. Applied to all coach routes, `/api/db/[table]`, `/api/decoupling`, `/api/gear`. Dev bypass via `NEXT_PUBLIC_DEV_ATHLETE_ID`. `/api/db/[table]` auth defaults ON (`DB_ROUTE_ENFORCE_AUTH=false` to opt out); `x-db-api-key` header allows server-to-server access. `/api/coach/week/ics` is intentionally unauthenticated (external calendar subscriptions can't send cookies).

`src/lib/rateLimit.ts` — in-memory per-IP sliding window; applied to `/api/weather` (60/min) and coach chat POST (20/min). Per-instance, resets on restart — fine for single-user deploys.

### Data Flow: Strava → DB → UI

Caching layer: `src/lib/stravaCache.ts`. All Strava data types (activities, streams, athlete stats, zones, gear) follow same pattern:
1. Check Drizzle DB for cached row + `fetchedAt` timestamp
2. If stale/missing, fetch from Strava API (`src/lib/strava.ts`)
3. Write back to DB, return data

`src/lib/dbSync.ts` — raw DB read/write helpers. `src/lib/stravaCache.ts` composes with freshness logic + Strava API calls.

Activities background-synced on page load; calls deduplicated via in-flight Set.

Fitness metrics (CTL/ATL/TSB) computed in `src/utils/trainingLoad.ts`, cached in `dashboard_cache`. Cache invalidated on HR settings change (settings hash).

### Coach System

Coach: AI agent in `src/app/api/coach/chat/route.ts`:

- **System prompt** built dynamically per-athlete in `src/lib/coachContext.ts` — injects fitness snapshot, goal, active plan, this week's schedule, athlete notes. Cached in-process 60s.
- **Tools** defined in `src/lib/coachTools.ts` — read/write DB directly. Key tools: `getFitnessSummary`, `getRecentActivities`, `saveTrainingPlan`, `saveWeeklyPlan`, `setGoal`, `updateAthleteNotes`, `linkCompletedActivity`, `askQuestion`, weather tools.
- **Chat history** persisted in `coach_messages` table, scoped by `athleteId` + `sessionId`. Max 40 messages loaded; pruned above 80.
- Agent uses `streamText` with `stopWhen: stepCountIs(10)` to bound multi-step tool calls.

Training plan hierarchy: `training_plan` (macro phases) → `training_plan.weekSketches[]` (volume targets/week) → `weekly_plan` (detailed 7-day schedule with `PlannedDay[]`).

All coach types in `src/lib/coachTypes.ts`.

### Auth Context

`src/contexts/StravaAuthContext.tsx` holds Strava tokens in state (loaded from localStorage on mount). When `NEXT_PUBLIC_DEV_ATHLETE_ID` set, skips OAuth + injects fake "broker" token — Strava API calls proxy through `/api/strava/session/access-token` to fetch real token server-side.

### API Routes

All routes under `src/app/api/`:
- `/api/coach/chat` — GET (load history/sessions), POST (stream new message), DELETE (clear session)
- `/api/coach/plan`, `/week`, `/goal`, `/fitness`, `/notes`, `/adherence` — read endpoints for coach data
- `/api/strava/token` — OAuth token exchange
- `/api/strava/session` and `/api/strava/session/access-token` — server-side token broker for dev mode
- `/api/db/[table]` — generic DB read endpoint (hooks use for direct table access)
- `/api/weather` — proxies Open-Meteo weather fetch (avoids CORS)

### UI System

`src/app/globals.css` — full design token system:
- Surface classes: `surface-card`, `surface-raised`, `surface-stage`
- Color tokens: `--color-base`, `--color-surface-0/1/2`, `--color-text-1/2/3`, `--color-accent` (Strava orange `#fc4c02`)
- Use CSS variables for colors — no hardcoded hex in components.

App always dark mode (`.dark` class on `<html>`). Tailwind v4 + PostCSS.

### Pages
- `/` — Dashboard: TSB hero, today's workout strip, last run card, training load chart, zone distribution, activity feed
- `/activities` — paginated activity list
- `/activities/[id]` — activity detail: map, streams, zone breakdown, plan adherence panel
- `/coach` — chat interface with plan overview, week schedule, session history
- `/segments` — aggregated segment efforts across all activities (background-fetches missing details)
- `/segments/[id]` — segment effort history
- `/profile` — athlete stats
- `/settings` — HR zones, LLM model selection, Strava connection

### Hooks

`src/hooks/useStrava.ts` — primary React Query hook file. Wraps `stravaCache.ts`, exposes `useDashboardActivities`, `useFitnessData`, `usePerActivityZoneBreakdowns`, etc. Coach page uses direct `fetch` calls, not React Query.

### Zone Model

Custom 6-zone HR model (not Strava's 5-zone default). Zone boundaries stored per-athlete in `user_settings.zones`. Zone breakdowns computed from raw HR streams via `src/lib/zoneCompute.ts`, cached in `zone_breakdowns` with settings hash for boundary change detection.
