// ============================================================
// Exa AI web search wrapper (server-only)
// ============================================================
// Thin wrapper around exa-js, mirroring weather.ts's shape: every function
// returns a typed result or a typed failure — never throws. This keeps the
// coach tools' error handling uniform (see coachTools.ts's `{error: ...}`
// convention) regardless of whether the failure is a missing API key, an
// exhausted self-imposed budget, or Exa itself being out of credits.
//
// Feature is fully disabled (zero network calls, zero schema exposure) when
// EXA_API_KEY is unset — see the registration gate in coachTools.ts.

import Exa, {ExaError} from 'exa-js';
import {globalRateLimit} from './rateLimit';

export interface SearchAnswerResult {
  answer: string;
  citations: {title: string | null; url: string}[];
}

export interface UrlContentResult {
  url: string;
  title: string | null;
  text: string;
}

export type ExaFailureReason = 'no_api_key' | 'quota_exceeded' | 'rate_limited' | 'request_failed';

export type ExaOutcome<T> = {ok: true; data: T} | {ok: false; reason: ExaFailureReason};

const DEFAULT_DAILY_BUDGET = 50;
const dailyBudget = (): number => {
  const raw = Number(process.env.EXA_DAILY_BUDGET);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_BUDGET;
};

const ANSWER_TTL_MS = 60 * 60 * 1000; // 1h — answers can go stale
const CONTENTS_TTL_MS = 24 * 60 * 60 * 1000; // 24h — page content rarely changes
const MAX_CACHE_ENTRIES = 200;

const cache = new Map<string, {expiresAt: number; value: unknown}>();

function cacheGet<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, {expiresAt: Date.now() + ttlMs, value});
}

function reasonFromError(err: unknown): ExaFailureReason {
  if (err instanceof ExaError) {
    if (err.statusCode === 402) return 'quota_exceeded';
    if (err.statusCode === 429) return 'rate_limited';
  }
  return 'request_failed';
}

export async function fetchSearchAnswer(query: string): Promise<ExaOutcome<SearchAnswerResult>> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return {ok: false, reason: 'no_api_key'};

  const cacheKey = `answer:${query.trim().toLowerCase()}`;
  const cached = cacheGet<SearchAnswerResult>(cacheKey);
  if (cached) return {ok: true, data: cached};

  if (globalRateLimit('exa-daily', dailyBudget(), 24 * 60 * 60 * 1000)) {
    return {ok: false, reason: 'quota_exceeded'};
  }

  try {
    const exa = new Exa(apiKey);
    const res = await exa.answer(query);
    const data: SearchAnswerResult = {
      answer: typeof res.answer === 'string' ? res.answer : JSON.stringify(res.answer),
      citations: res.citations.map((c) => ({title: c.title, url: c.url})),
    };
    cacheSet(cacheKey, data, ANSWER_TTL_MS);
    return {ok: true, data};
  } catch (err) {
    return {ok: false, reason: reasonFromError(err)};
  }
}

export async function fetchUrlContents(urls: string[]): Promise<ExaOutcome<UrlContentResult[]>> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return {ok: false, reason: 'no_api_key'};

  const cacheKey = `contents:${urls.slice().sort().join(',')}`;
  const cached = cacheGet<UrlContentResult[]>(cacheKey);
  if (cached) return {ok: true, data: cached};

  if (globalRateLimit('exa-daily', dailyBudget(), 24 * 60 * 60 * 1000)) {
    return {ok: false, reason: 'quota_exceeded'};
  }

  try {
    const exa = new Exa(apiKey);
    const res = await exa.getContents(urls, {text: true});
    const data: UrlContentResult[] = res.results.map((r) => ({url: r.url, title: r.title, text: r.text}));
    cacheSet(cacheKey, data, CONTENTS_TTL_MS);
    return {ok: true, data};
  } catch (err) {
    return {ok: false, reason: reasonFromError(err)};
  }
}

export function describeExaFailure(reason: ExaFailureReason): string {
  switch (reason) {
    case 'quota_exceeded':
      return 'Web search is temporarily unavailable (search budget exhausted for today). Continue without it.';
    case 'rate_limited':
      return 'Web search rate limit hit, try again shortly.';
    default:
      return 'Web search is unavailable right now.';
  }
}
