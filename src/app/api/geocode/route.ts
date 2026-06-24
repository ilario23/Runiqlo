// Server-side proxy for reverse geocoding — avoids CORS / client-network
// restrictions, mirrors /api/weather.
// GET /api/geocode?lat=…&lng=…  → PlaceLabel | null

import {NextRequest, NextResponse} from 'next/server';
import {reverseGeocode} from '@/lib/geocode';
import {rateLimit} from '@/lib/rateLimit';

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, 'geocode', 60, 60_000);
  if (limited) return limited;

  const {searchParams} = req.nextUrl;
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');

  if (!lat || !lng) {
    return NextResponse.json({error: 'lat, lng required'}, {status: 400});
  }

  const latN = Number(lat);
  const lngN = Number(lng);
  if (
    !Number.isFinite(latN) || latN < -90 || latN > 90 ||
    !Number.isFinite(lngN) || lngN < -180 || lngN > 180
  ) {
    return NextResponse.json({error: 'invalid params'}, {status: 400});
  }

  const place = await reverseGeocode(latN, lngN);
  if (!place) {
    return NextResponse.json(null, {headers: {'Cache-Control': 'no-store'}});
  }

  return NextResponse.json(place, {
    // Place names don't change — cache hard.
    headers: {'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800'},
  });
}
