import {describe, it, expect} from 'vitest';
import {NextRequest, NextResponse} from 'next/server';
import {
  validateRefreshCsrf,
  applyStravaTokenPayloadToResponse,
  STRAVA_CSRF_COOKIE,
  STRAVA_ACCESS_COOKIE,
  STRAVA_REFRESH_COOKIE,
  STRAVA_ATHLETE_COOKIE,
} from '../stravaTokenBroker';

function reqWith(headers: Record<string, string>): NextRequest {
  return new NextRequest('https://app.test/api/strava/token', {
    headers: new Headers(headers),
  });
}

describe('validateRefreshCsrf (double-submit)', () => {
  it('passes when cookie and header match', () => {
    const req = reqWith({
      cookie: `${STRAVA_CSRF_COOKIE}=abc123`,
      'x-csrf-token': 'abc123',
    });
    expect(validateRefreshCsrf(req)).toBe(true);
  });

  it('fails when the header is missing', () => {
    const req = reqWith({cookie: `${STRAVA_CSRF_COOKIE}=abc123`});
    expect(validateRefreshCsrf(req)).toBe(false);
  });

  it('fails when the cookie is missing', () => {
    const req = reqWith({'x-csrf-token': 'abc123'});
    expect(validateRefreshCsrf(req)).toBe(false);
  });

  it('fails when cookie and header differ', () => {
    const req = reqWith({
      cookie: `${STRAVA_CSRF_COOKIE}=abc123`,
      'x-csrf-token': 'different',
    });
    expect(validateRefreshCsrf(req)).toBe(false);
  });

  it('fails when both are empty strings', () => {
    const req = reqWith({
      cookie: `${STRAVA_CSRF_COOKIE}=`,
      'x-csrf-token': '',
    });
    expect(validateRefreshCsrf(req)).toBe(false);
  });
});

describe('applyStravaTokenPayloadToResponse', () => {
  it('sets the access token as an httpOnly cookie', () => {
    const res = NextResponse.json({});
    applyStravaTokenPayloadToResponse(res, {access_token: 'AT'});
    const cookie = res.cookies.get(STRAVA_ACCESS_COOKIE);
    expect(cookie?.value).toBe('AT');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('lax');
  });

  it('sets the refresh token httpOnly', () => {
    const res = NextResponse.json({});
    applyStravaTokenPayloadToResponse(res, {refresh_token: 'RT'});
    const cookie = res.cookies.get(STRAVA_REFRESH_COOKIE);
    expect(cookie?.value).toBe('RT');
    expect(cookie?.httpOnly).toBe(true);
  });

  it('exposes the athlete cookie to JS (httpOnly false)', () => {
    const res = NextResponse.json({});
    applyStravaTokenPayloadToResponse(res, {athlete: {id: 1, firstname: 'A'}});
    const cookie = res.cookies.get(STRAVA_ATHLETE_COOKIE);
    expect(cookie?.httpOnly).toBe(false);
    expect(JSON.parse(cookie!.value)).toMatchObject({id: 1});
  });

  it('omits cookies for fields not present in the payload', () => {
    const res = NextResponse.json({});
    applyStravaTokenPayloadToResponse(res, {access_token: 'only'});
    expect(res.cookies.get(STRAVA_REFRESH_COOKIE)).toBeUndefined();
  });
});
