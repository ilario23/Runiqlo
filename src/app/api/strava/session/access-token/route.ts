import {NextRequest, NextResponse} from 'next/server';
import {
  STRAVA_ACCESS_COOKIE,
  STRAVA_EXPIRES_COOKIE,
  STRAVA_REFRESH_COOKIE,
  STRAVA_CSRF_COOKIE,
  applyStravaTokenPayloadToResponse,
  refreshStravaTokensFromRequest,
  getSessionRefreshToken,
  persistStravaSession,
  updateSessionRefreshToken,
} from '@/lib/stravaTokenBroker';

const validateCsrf = (req: NextRequest): boolean => {
  const cookieToken = req.cookies.get(STRAVA_CSRF_COOKIE)?.value;
  const headerToken = req.headers.get('x-csrf-token');
  return Boolean(cookieToken && headerToken && cookieToken === headerToken);
};

export async function POST(req: NextRequest) {
  if (!validateCsrf(req)) {
    return NextResponse.json({error: 'CSRF validation failed'}, {status: 403});
  }

  const token = req.cookies.get(STRAVA_ACCESS_COOKIE)?.value;
  const expiresAtRaw = req.cookies.get(STRAVA_EXPIRES_COOKIE)?.value;
  const refreshToken = req.cookies.get(STRAVA_REFRESH_COOKIE)?.value;

  const expiresAt = Number(expiresAtRaw ?? '0');
  const nowEpoch = Math.floor(Date.now() / 1000);
  const accessUsable =
    Boolean(token) && Number.isFinite(expiresAt) && expiresAt - nowEpoch >= 300;

  if (accessUsable) {
    return NextResponse.json({accessToken: token});
  }

  // Access token missing or near expiry — refresh from the cookie first,
  // falling back to the DB-backed session when the refresh cookie is gone.
  if (refreshToken) {
    const result = await refreshStravaTokensFromRequest(req);
    if (result.ok && result.parsed.access_token) {
      const res = NextResponse.json({accessToken: result.parsed.access_token});
      applyStravaTokenPayloadToResponse(res, result.parsed);
      if (result.parsed.refresh_token) {
        // Keep the DB session in sync — Strava may rotate the refresh token.
        await updateSessionRefreshToken(req, res, result.parsed.refresh_token);
      }
      return res;
    }
    // Refresh failed but the current token may still be briefly valid.
    if (token && expiresAt > nowEpoch) {
      return NextResponse.json({accessToken: token});
    }
  }

  const session = await getSessionRefreshToken(req);
  if (session) {
    const result = await refreshStravaTokensFromRequest(req, session.refreshToken);
    if (result.ok && result.parsed.access_token) {
      const res = NextResponse.json({accessToken: result.parsed.access_token});
      applyStravaTokenPayloadToResponse(res, result.parsed);
      // Strava rotates refresh tokens — persist the new one or the session dies.
      await persistStravaSession(
        req,
        res,
        session.athleteId,
        result.parsed.refresh_token ?? session.refreshToken,
      );
      return res;
    }
  }

  if (token && expiresAt > nowEpoch) {
    return NextResponse.json({accessToken: token});
  }
  return NextResponse.json({error: 'Not authenticated'}, {status: 401});
}
