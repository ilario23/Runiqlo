// ============================================================
// Strava OAuth token broker (server-only)
// ============================================================
// Shared cookie application + refresh-token exchange used by
// /api/strava/token and /api/strava/session/access-token.

import {createHash, randomBytes} from 'crypto';
import {eq} from 'drizzle-orm';
import type {NextRequest} from 'next/server';
import type {NextResponse} from 'next/server';
import {getDb} from '@/db';
import {stravaSessions} from '@/db/schema';

export const STRAVA_ACCESS_COOKIE = 'strava_access_token';
export const STRAVA_REFRESH_COOKIE = 'strava_refresh_token';
export const STRAVA_EXPIRES_COOKIE = 'strava_expires_at';
export const STRAVA_ATHLETE_COOKIE = 'strava_athlete';
export const STRAVA_CSRF_COOKIE = 'strava_csrf_token';
export const STRAVA_SESSION_COOKIE = 'strava_session';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const COOKIE_SECURE = process.env.NODE_ENV === 'production';

export type StravaTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  athlete?: unknown;
};

export const validateRefreshCsrf = (request: NextRequest): boolean => {
  const csrfCookie = request.cookies.get(STRAVA_CSRF_COOKIE)?.value;
  const csrfHeader = request.headers.get('x-csrf-token');
  return Boolean(csrfCookie && csrfHeader && csrfCookie === csrfHeader);
};

/**
 * Apply Strava oauth/token JSON fields to httpOnly / public cookies on a response.
 */
export const applyStravaTokenPayloadToResponse = (
  response: NextResponse,
  parsed: StravaTokenPayload,
): void => {
  if (parsed.access_token) {
    response.cookies.set(STRAVA_ACCESS_COOKIE, parsed.access_token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      path: '/',
      maxAge: 60 * 60 * 6,
    });
  }
  if (parsed.refresh_token) {
    response.cookies.set(STRAVA_REFRESH_COOKIE, parsed.refresh_token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  if (parsed.expires_at) {
    response.cookies.set(STRAVA_EXPIRES_COOKIE, String(parsed.expires_at), {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  if (parsed.athlete) {
    response.cookies.set(STRAVA_ATHLETE_COOKIE, JSON.stringify(parsed.athlete), {
      httpOnly: false,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
};

// ── DB-backed long-lived sessions ─────────────────────────────────────────────
// The browser keeps an opaque random session ID (httpOnly cookie, 1 year);
// the DB stores only its SHA-256 hash plus the Strava refresh token. When the
// short-lived token cookies are gone, the session row lets the server re-mint
// tokens without sending the user back through OAuth.

const hashSessionToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/**
 * Create (or rotate) a persistent session for the athlete and set the session
 * cookie on the response. Failures are swallowed: the cookie-based flow keeps
 * working even if the DB is unreachable.
 */
export const persistStravaSession = async (
  request: NextRequest,
  response: NextResponse,
  athleteId: number,
  refreshToken: string,
): Promise<void> => {
  try {
    const db = getDb();
    const now = Date.now();
    const existing = request.cookies.get(STRAVA_SESSION_COOKIE)?.value;

    if (existing) {
      const updated = await db
        .update(stravaSessions)
        .set({refreshToken, lastUsedAt: now})
        .where(eq(stravaSessions.sessionTokenHash, hashSessionToken(existing)))
        .returning({athleteId: stravaSessions.athleteId});
      if (updated.length > 0 && updated[0].athleteId === athleteId) {
        // Sliding expiry: re-set the cookie so active users never log in again.
        setSessionCookie(response, existing);
        return;
      }
    }

    const sessionToken = randomBytes(32).toString('base64url');
    await db.insert(stravaSessions).values({
      sessionTokenHash: hashSessionToken(sessionToken),
      athleteId,
      refreshToken,
      createdAt: now,
      lastUsedAt: now,
    });
    setSessionCookie(response, sessionToken);
  } catch (error) {
    console.error('persistStravaSession failed:', error);
  }
};

const setSessionCookie = (response: NextResponse, value: string): void => {
  response.cookies.set(STRAVA_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
};

/**
 * Update the stored refresh token for the request's session cookie, if any.
 * Used after a cookie-based refresh, where Strava may rotate the token but
 * the response carries no athlete to re-key the session by.
 */
export const updateSessionRefreshToken = async (
  request: NextRequest,
  response: NextResponse,
  refreshToken: string,
): Promise<void> => {
  const sessionToken = request.cookies.get(STRAVA_SESSION_COOKIE)?.value;
  if (!sessionToken) return;
  try {
    const db = getDb();
    await db
      .update(stravaSessions)
      .set({refreshToken, lastUsedAt: Date.now()})
      .where(eq(stravaSessions.sessionTokenHash, hashSessionToken(sessionToken)));
    setSessionCookie(response, sessionToken);
  } catch (error) {
    console.error('updateSessionRefreshToken failed:', error);
  }
};

/**
 * Look up the refresh token stored for the request's session cookie.
 * Returns null when there is no cookie, no matching row, or the DB errors.
 */
export const getSessionRefreshToken = async (
  request: NextRequest,
): Promise<{athleteId: number; refreshToken: string} | null> => {
  const sessionToken = request.cookies.get(STRAVA_SESSION_COOKIE)?.value;
  if (!sessionToken) return null;
  try {
    const db = getDb();
    const rows = await db
      .select({
        athleteId: stravaSessions.athleteId,
        refreshToken: stravaSessions.refreshToken,
      })
      .from(stravaSessions)
      .where(eq(stravaSessions.sessionTokenHash, hashSessionToken(sessionToken)))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('getSessionRefreshToken failed:', error);
    return null;
  }
};

/** Delete the DB session row for the request's session cookie (logout). */
export const deleteStravaSession = async (request: NextRequest): Promise<void> => {
  const sessionToken = request.cookies.get(STRAVA_SESSION_COOKIE)?.value;
  if (!sessionToken) return;
  try {
    const db = getDb();
    await db
      .delete(stravaSessions)
      .where(eq(stravaSessions.sessionTokenHash, hashSessionToken(sessionToken)));
  } catch (error) {
    console.error('deleteStravaSession failed:', error);
  }
};

export const postStravaOAuthToken = async (
  formData: URLSearchParams,
): Promise<{status: number; bodyText: string}> => {
  const stravaRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: formData.toString(),
  });
  const bodyText = await stravaRes.text();
  return {status: stravaRes.status, bodyText};
};

export type RefreshFromCookiesResult =
  | {ok: true; parsed: StravaTokenPayload; bodyText: string; status: number}
  | {ok: false; status: number; bodyText: string};

/**
 * Exchange refresh_token (from cookie or body) for new tokens. Validates CSRF.
 * Caller must pass client_id / secret via env (same as token route).
 */
export const refreshStravaTokensFromRequest = async (
  request: NextRequest,
  bodyRefreshToken?: string,
): Promise<RefreshFromCookiesResult> => {
  if (!validateRefreshCsrf(request)) {
    return {ok: false, status: 403, bodyText: JSON.stringify({error: 'CSRF validation failed'})};
  }

  const CLIENT_ID = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID ?? '';
  const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET ?? '';

  const cookieRefresh = request.cookies.get(STRAVA_REFRESH_COOKIE)?.value;
  const refresh = bodyRefreshToken || cookieRefresh;
  if (!refresh) {
    return {ok: false, status: 400, bodyText: JSON.stringify({error: 'refresh_token required'})};
  }

  const formData = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refresh,
  });

  const {status, bodyText} = await postStravaOAuthToken(formData);

  if (!status.toString().startsWith('2')) {
    return {ok: false, status, bodyText};
  }

  try {
    const parsed = JSON.parse(bodyText) as StravaTokenPayload;
    if (!parsed.access_token) {
      return {ok: false, status: 502, bodyText};
    }
    return {ok: true, parsed, bodyText, status};
  } catch {
    return {ok: false, status: 502, bodyText};
  }
};
