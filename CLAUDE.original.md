# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

Run a single test file:
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
- `NEXT_PUBLIC_DEV_ATHLETE_ID` — set to bypass OAuth and auto-login as a dev athlete
- `NEXT_PUBLIC_STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` — Strava OAuth
- `DATABASE_URL` — Postgres connection string

### Data Flow: Strava → DB → UI

The caching layer lives in `src/lib/stravaCache.ts`. Every Strava data type (activities, streams, athlete stats, zones, gear) follows the same pattern:
1. Check the Drizzle DB for a cached row and its `fetchedAt` timestamp
2. If stale or missing, fetch from Strava API (`src/lib/strava.ts`)
3. Write back to DB, return data

`src/lib/dbSync.ts` contains all raw DB read/write helpers. `src/lib/stravaCache.ts` composes them with freshness logic and Strava API calls.

Activities are background-synced on page load; calls are deduplicated via an in-flight Set.

Fitness metrics (CTL/ATL/TSB) are computed in `src/utils/trainingLoad.ts` and cached in `dashboard_cache`. The cache is invalidated when HR settings change (tracked via a settings hash).

### Coach System

The coach is an AI agent that runs in `src/app/api/coach/chat/route.ts`:

- **System prompt** is built dynamically per-athlete in `src/lib/coachContext.ts` — it injects current fitness snapshot, goal, active training plan, this week's schedule, and athlete notes. Cached in-process for 60 s.
- **Tools** are defined in `src/lib/coachTools.ts` — they read/write DB directly. Key tools: `getFitnessSummary`, `getRecentActivities`, `saveTrainingPlan`, `saveWeeklyPlan`, `setGoal`, `updateAthleteNotes`, `linkCompletedActivity`, `askQuestion`, weather tools.
- **Chat history** is persisted in `coach_messages` table, scoped by `athleteId` + `sessionId`. Max 40 messages loaded; pruned above 80.
- The agent uses `streamText` with `stopWhen: stepCountIs(10)` to bound multi-step tool calls.

Training plan hierarchy: `training_plan` (macro phases) → `training_plan.weekSketches[]` (volume targets per week) → `weekly_plan` (detailed 7-day schedule with `PlannedDay[]`).

All coach types live in `src/lib/coachTypes.ts`.

### Auth Context

`src/contexts/StravaAuthContext.tsx` holds Strava tokens in state (loaded from localStorage on mount). When `NEXT_PUBLIC_DEV_ATHLETE_ID` is set, it skips OAuth and injects a fake "broker" token — all Strava API calls then proxy through `/api/strava/session/access-token` which fetches a real token server-side.

### API Routes

All routes are under `src/app/api/`:
- `/api/coach/chat` — GET (load history/sessions), POST (stream new message), DELETE (clear session)
- `/api/coach/plan`, `/week`, `/goal`, `/fitness`, `/notes`, `/adherence` — read endpoints for coach data
- `/api/strava/token` — OAuth token exchange
- `/api/strava/session` and `/api/strava/session/access-token` — server-side token broker for dev mode
- `/api/db/[table]` — generic DB read endpoint (used by hooks for direct table access)
- `/api/weather` — proxies Open-Meteo weather fetch (avoids CORS)

### UI System

`src/app/globals.css` defines the full design token system:
- Surface classes: `surface-card`, `surface-raised`, `surface-stage`
- Color tokens: `--color-base`, `--color-surface-0/1/2`, `--color-text-1/2/3`, `--color-accent` (Strava orange `#fc4c02`)
- Always use these CSS variables for colors — avoid hardcoded hex in components.

The app is always in dark mode (`.dark` class on `<html>`). Tailwind v4 is configured with PostCSS.

### Pages
- `/` — Dashboard: TSB hero, today's workout strip, last run card, training load chart, zone distribution, activity feed
- `/activities` — paginated activity list
- `/activities/[id]` — activity detail with map, streams, zone breakdown, plan adherence panel
- `/coach` — chat interface with plan overview, week schedule, session history
- `/segments` — aggregated segment efforts across all activities (background-fetches missing details)
- `/segments/[id]` — segment effort history
- `/profile` — athlete stats
- `/settings` — HR zones, LLM model selection, Strava connection

### Hooks

`src/hooks/useStrava.ts` is the primary React Query hook file. It wraps `stravaCache.ts` functions and exposes `useDashboardActivities`, `useFitnessData`, `usePerActivityZoneBreakdowns`, etc. The coach page uses direct `fetch` calls rather than React Query.

### Zone Model

The app uses a custom 6-zone HR model (not Strava's 5-zone default). Zone boundaries are stored per-athlete in `user_settings.zones`. Zone breakdowns are computed from raw HR streams via `src/lib/zoneCompute.ts` and cached in `zone_breakdowns` with a settings hash to detect zone boundary changes.
