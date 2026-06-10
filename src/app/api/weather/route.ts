// Server-side proxy for Open-Meteo — avoids CORS / client-network restrictions.
// GET /api/weather?lat=…&lng=…&date=YYYY-MM-DD&hour=0-23   → ActivityWeatherData | null
// GET /api/weather?forecast=1&location=Milan               → WeatherForecast | null

import {NextRequest, NextResponse} from 'next/server';
import {fetchHistoricalWeather, fetchWeatherForecast} from '@/lib/weather';
import {rateLimit} from '@/lib/rateLimit';

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, 'weather', 60, 60_000);
  if (limited) return limited;

  const {searchParams} = req.nextUrl;

  // ── Forecast mode ──────────────────────────────────────────────────────────
  if (searchParams.get('forecast') === '1') {
    const location = searchParams.get('location');
    if (!location) {
      return NextResponse.json({error: 'location required'}, {status: 400});
    }
    const forecast = await fetchWeatherForecast(location);
    if (!forecast) {
      return NextResponse.json(null, {headers: {'Cache-Control': 'no-store'}});
    }
    return NextResponse.json(forecast, {
      headers: {'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600'},
    });
  }

  // ── Historical mode ─────────────────────────────────────────────────────────
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const date = searchParams.get('date');
  const hour = searchParams.get('hour');

  if (!lat || !lng || !date || !hour) {
    return NextResponse.json({error: 'lat, lng, date, hour required'}, {status: 400});
  }

  const latN = Number(lat);
  const lngN = Number(lng);
  const hourN = Number(hour);
  if (
    !Number.isFinite(latN) || latN < -90 || latN > 90 ||
    !Number.isFinite(lngN) || lngN < -180 || lngN > 180 ||
    !Number.isInteger(hourN) || hourN < 0 || hourN > 23 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return NextResponse.json({error: 'invalid params'}, {status: 400});
  }

  const weather = await fetchHistoricalWeather(latN, lngN, date, hourN);

  if (!weather) {
    // Don't cache failures — upstream might be temporarily unavailable
    return NextResponse.json(null, {
      headers: {'Cache-Control': 'no-store'},
    });
  }

  return NextResponse.json(weather, {
    // Historical weather never changes — safe to cache for 24 h
    headers: {'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800'},
  });
}
