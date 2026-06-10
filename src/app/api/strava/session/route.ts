import {NextRequest, NextResponse} from 'next/server';
import {deleteStravaSession, STRAVA_SESSION_COOKIE} from '@/lib/stravaTokenBroker';

const ACCESS_COOKIE = 'strava_access_token';
const REFRESH_COOKIE = 'strava_refresh_token';
const EXPIRES_COOKIE = 'strava_expires_at';
const ATHLETE_COOKIE = 'strava_athlete';
const CSRF_COOKIE = 'strava_csrf_token';
const COOKIE_SECURE = process.env.NODE_ENV === 'production';

const ensureCsrfToken = (req: NextRequest, res: NextResponse): string => {
  const existing = req.cookies.get(CSRF_COOKIE)?.value;
  if (existing) return existing;
  const token = crypto.randomUUID();
  res.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return token;
};

const validateCsrf = (req: NextRequest): boolean => {
  const cookieToken = req.cookies.get(CSRF_COOKIE)?.value;
  const headerToken = req.headers.get('x-csrf-token');
  return Boolean(cookieToken && headerToken && cookieToken === headerToken);
};

export async function GET(req: NextRequest) {
  // Authenticated if any credential can still mint an access token: the
  // access cookie itself, the refresh cookie, or the DB-backed session cookie.
  const hasAccess = Boolean(
    req.cookies.get(ACCESS_COOKIE)?.value ||
      req.cookies.get(REFRESH_COOKIE)?.value ||
      req.cookies.get(STRAVA_SESSION_COOKIE)?.value,
  );
  const athleteRaw = req.cookies.get(ATHLETE_COOKIE)?.value ?? null;
  let athlete: unknown = null;
  if (athleteRaw) {
    try {
      athlete = JSON.parse(athleteRaw);
    } catch { /* corrupt cookie — treat as absent */ }
  }
  const response = NextResponse.json({
    authenticated: hasAccess,
    athlete,
  });
  const csrfToken = ensureCsrfToken(req, response);
  response.headers.set('x-csrf-token', csrfToken);
  return response;
}

export async function POST(req: NextRequest) {
  if (!validateCsrf(req)) {
    return NextResponse.json({error: 'CSRF validation failed'}, {status: 403});
  }
  const action = req.nextUrl.searchParams.get('action');
  if (action !== 'logout') {
    return NextResponse.json({error: 'Unsupported action'}, {status: 400});
  }
  await deleteStravaSession(req);
  const response = NextResponse.json({ok: true});
  response.cookies.set(ACCESS_COOKIE, '', {path: '/', maxAge: 0});
  response.cookies.set(REFRESH_COOKIE, '', {path: '/', maxAge: 0});
  response.cookies.set(EXPIRES_COOKIE, '', {path: '/', maxAge: 0});
  response.cookies.set(ATHLETE_COOKIE, '', {path: '/', maxAge: 0});
  response.cookies.set(STRAVA_SESSION_COOKIE, '', {path: '/', maxAge: 0});
  return response;
}
