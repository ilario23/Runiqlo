// ============================================================
// Server-side request authentication (server-only)
// ============================================================
// Verifies the caller's Strava access token (httpOnly session cookie or
// Authorization: Bearer header) against the Strava API and resolves the
// athlete it belongs to. Routes must use the returned athleteId — never a
// client-supplied one — for any data access.
//
// Dev bypass: when NEXT_PUBLIC_DEV_ATHLETE_ID is set, requests are treated
// as that athlete without contacting Strava (mirrors the OAuth bypass in
// StravaAuthContext).

import {NextRequest, NextResponse} from 'next/server';
import {STRAVA_ACCESS_COOKIE} from './stravaTokenBroker';

export type AuthResult =
  | {ok: true; athleteId: number}
  | {ok: false; response: NextResponse};

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 50;

// token → verified athlete. In-process; resets on server restart, which is
// fine — worst case is one extra Strava /athlete call per token.
const verifiedTokens = new Map<string, {athleteId: number; verifiedAt: number}>();

const getDevAthleteId = (): number | null => {
  const raw = process.env.NEXT_PUBLIC_DEV_ATHLETE_ID;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const extractToken = (req: NextRequest): string | null => {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length);
  return req.cookies.get(STRAVA_ACCESS_COOKIE)?.value ?? null;
};

const verifyTokenWithStrava = async (token: string): Promise<number | null> => {
  const cached = verifiedTokens.get(token);
  if (cached && Date.now() - cached.verifiedAt < CACHE_TTL_MS) {
    return cached.athleteId;
  }

  const res = await fetch('https://www.strava.com/api/v3/athlete', {
    headers: {Authorization: `Bearer ${token}`},
  });
  if (!res.ok) {
    verifiedTokens.delete(token);
    return null;
  }
  const athlete = (await res.json()) as {id?: number};
  const id = athlete?.id;
  if (typeof id !== 'number' || !Number.isFinite(id) || id <= 0) return null;

  if (verifiedTokens.size >= CACHE_MAX_ENTRIES) {
    const oldest = verifiedTokens.keys().next().value;
    if (oldest) verifiedTokens.delete(oldest);
  }
  verifiedTokens.set(token, {athleteId: id, verifiedAt: Date.now()});
  return id;
};

/**
 * Authenticate the request and resolve the caller's athleteId.
 *
 * When `requestedAthleteId` is provided (parsed by the route from query/body),
 * a mismatch with the verified identity returns 403. Routes should still use
 * the returned athleteId for all queries.
 */
export const requireAthlete = async (
  req: NextRequest,
  requestedAthleteId?: number | null,
): Promise<AuthResult> => {
  const devAthleteId = getDevAthleteId();
  if (devAthleteId) {
    if (requestedAthleteId && requestedAthleteId !== devAthleteId) {
      return {
        ok: false,
        response: NextResponse.json({error: 'Forbidden athlete scope'}, {status: 403}),
      };
    }
    return {ok: true, athleteId: devAthleteId};
  }

  const token = extractToken(req);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({error: 'Not authenticated'}, {status: 401}),
    };
  }

  let athleteId: number | null;
  try {
    athleteId = await verifyTokenWithStrava(token);
  } catch {
    return {
      ok: false,
      response: NextResponse.json({error: 'Auth verification failed'}, {status: 503}),
    };
  }
  if (!athleteId) {
    return {
      ok: false,
      response: NextResponse.json({error: 'Invalid or expired token'}, {status: 401}),
    };
  }

  if (requestedAthleteId && requestedAthleteId !== athleteId) {
    return {
      ok: false,
      response: NextResponse.json({error: 'Forbidden athlete scope'}, {status: 403}),
    };
  }

  return {ok: true, athleteId};
};
