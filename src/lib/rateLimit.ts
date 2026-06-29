// ============================================================
// Lightweight in-memory rate limiter (server-only)
// ============================================================
// Sliding-window counter per key (typically IP). In-process only — resets on
// restart and is per-instance, which is acceptable for this single-user app.

import {NextRequest, NextResponse} from 'next/server';

type Window = {count: number; windowStart: number};

const buckets = new Map<string, Window>();
const MAX_BUCKETS = 1000;

const clientKey = (req: NextRequest): string =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
  req.headers.get('x-real-ip') ??
  'local';

/**
 * Returns a 429 response when the caller exceeded `limit` requests within
 * `windowMs`, otherwise null. Scope separates routes sharing one limiter.
 */
export const rateLimit = (
  req: NextRequest,
  scope: string,
  limit: number,
  windowMs: number,
): NextResponse | null => {
  const key = `${scope}:${clientKey(req)}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    if (buckets.size >= MAX_BUCKETS) {
      const oldest = buckets.keys().next().value;
      if (oldest) buckets.delete(oldest);
    }
    buckets.set(key, {count: 1, windowStart: now});
    return null;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    const retryAfter = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
    return NextResponse.json(
      {error: 'Rate limit exceeded'},
      {status: 429, headers: {'Retry-After': String(retryAfter)}},
    );
  }
  return null;
};

/**
 * Same sliding-window bucket as `rateLimit`, but keyed globally (not per-IP) —
 * for capping total usage of a metered third-party API regardless of caller.
 * Returns true when the call should be BLOCKED (budget exhausted this window).
 */
export const globalRateLimit = (scope: string, limit: number, windowMs: number): boolean => {
  const key = `global:${scope}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    if (buckets.size >= MAX_BUCKETS) {
      const oldest = buckets.keys().next().value;
      if (oldest) buckets.delete(oldest);
    }
    buckets.set(key, {count: 1, windowStart: now});
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
};
