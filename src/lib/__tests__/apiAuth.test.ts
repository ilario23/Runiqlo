import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {NextRequest} from 'next/server';
import {requireAthlete} from '../apiAuth';
import {STRAVA_ACCESS_COOKIE} from '../stravaTokenBroker';

// Each test uses a unique token so the module-level verified-token cache
// never bleeds a verified identity across cases.
let tokenSeq = 0;
const freshToken = () => `tok-${tokenSeq++}`;

function reqWith({
  bearer,
  cookie,
}: {
  bearer?: string;
  cookie?: string;
} = {}): NextRequest {
  const headers = new Headers();
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  if (cookie) headers.set('cookie', `${STRAVA_ACCESS_COOKIE}=${cookie}`);
  return new NextRequest('https://app.test/api/coach', {headers});
}

const DEV_KEY = 'NEXT_PUBLIC_DEV_ATHLETE_ID';

beforeEach(() => {
  delete process.env[DEV_KEY];
  vi.restoreAllMocks();
});
afterEach(() => {
  delete process.env[DEV_KEY];
});

describe('requireAthlete — dev bypass', () => {
  it('resolves the dev athlete without contacting Strava', async () => {
    process.env[DEV_KEY] = '42';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await requireAthlete(reqWith());
    expect(res).toEqual({ok: true, athleteId: 42});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('403s when requested athlete differs from dev athlete', async () => {
    process.env[DEV_KEY] = '42';
    const res = await requireAthlete(reqWith(), 99);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(403);
  });

  it('allows matching requested athlete in dev', async () => {
    process.env[DEV_KEY] = '42';
    const res = await requireAthlete(reqWith(), 42);
    expect(res).toEqual({ok: true, athleteId: 42});
  });
});

describe('requireAthlete — token verification', () => {
  it('401s when no token is present', async () => {
    const res = await requireAthlete(reqWith());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(401);
  });

  it('verifies a bearer token against Strava and returns the athlete', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({id: 7}), {status: 200}),
    );
    const res = await requireAthlete(reqWith({bearer: freshToken()}));
    expect(res).toEqual({ok: true, athleteId: 7});
  });

  it('accepts the token from the httpOnly cookie too', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({id: 8}), {status: 200}),
    );
    const res = await requireAthlete(reqWith({cookie: freshToken()}));
    expect(res).toEqual({ok: true, athleteId: 8});
  });

  it('403s when the verified athlete differs from the requested one', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({id: 7}), {status: 200}),
    );
    const res = await requireAthlete(reqWith({bearer: freshToken()}), 999);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(403);
  });

  it('401s on a Strava 401 (invalid/expired token)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', {status: 401}),
    );
    const res = await requireAthlete(reqWith({bearer: freshToken()}));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(401);
  });

  it('503s (fail-closed) when the Strava call throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const res = await requireAthlete(reqWith({bearer: freshToken()}));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(503);
  });

  it('caches a verified token — no second Strava call', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({id: 5}), {status: 200}));
    const token = freshToken();
    await requireAthlete(reqWith({bearer: token}));
    await requireAthlete(reqWith({bearer: token}));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects an athlete payload with a non-positive id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({id: 0}), {status: 200}),
    );
    const res = await requireAthlete(reqWith({bearer: freshToken()}));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(401);
  });
});
