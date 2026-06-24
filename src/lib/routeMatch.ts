// "Runs on this route" — Strava groups activities that cover the same route and
// shows your pace progression. The API doesn't expose that grouping, so we
// approximate it client-side from summary polylines: same sport, similar
// distance, and start/end points close together.

import {decodePolyline} from './polyline';
import type {ActivitySummary} from './activityModel';

/** Haversine distance between two [lat, lng] points, metres. */
function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** First and last decoded point of a summary polyline, or null. */
function endpoints(polyline?: string): {start: [number, number]; end: [number, number]} | null {
  if (!polyline) return null;
  const pts = decodePolyline(polyline);
  if (pts.length < 2) return null;
  return {start: pts[0], end: pts[pts.length - 1]};
}

export interface RouteMatch {
  activity: ActivitySummary;
  isCurrent: boolean;
  isFastest: boolean;
}

const START_END_TOLERANCE_M = 150; // start & end must be within this radius
const DISTANCE_TOLERANCE = 0.06; // ±6% on total distance

/**
 * Find activities that cover the same route as `current`, including itself.
 * Returns null when the route can't be matched (no GPS) or only the current
 * activity qualifies. Sorted oldest → newest.
 */
export function findRunsOnRoute(
  current: ActivitySummary,
  all: ActivitySummary[],
): RouteMatch[] | null {
  const curEnds = endpoints(current.polyline);
  if (!curEnds) return null;

  const matches = all.filter((a) => {
    if (a.type !== current.type) return false;
    if (current.distance <= 0) return false;
    const distDelta = Math.abs(a.distance - current.distance) / current.distance;
    if (distDelta > DISTANCE_TOLERANCE) return false;

    const ends = endpoints(a.polyline);
    if (!ends) return false;
    return (
      haversineMeters(ends.start, curEnds.start) <= START_END_TOLERANCE_M &&
      haversineMeters(ends.end, curEnds.end) <= START_END_TOLERANCE_M
    );
  });

  if (matches.length < 2) return null; // just this run — nothing to compare

  // Fastest = lowest avg pace (>0).
  const paced = matches.filter((a) => a.avgPace > 0);
  const fastestId = paced.length
    ? paced.reduce((best, a) => (a.avgPace < best.avgPace ? a : best)).id
    : null;

  return matches
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((a) => ({
      activity: a,
      isCurrent: a.id === current.id,
      isFastest: a.id === fastestId,
    }));
}
