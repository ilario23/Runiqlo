// Server-side proxy for Open-Meteo — avoids CORS / client-network restrictions.
// GET /api/weather?lat=…&lng=…&date=YYYY-MM-DD&hour=0-23   → ActivityWeatherData | null
// GET /api/weather?forecast=1&location=Milan               → WeatherForecast | null

import {NextRequest, NextResponse} from 'next/server';
import {fetchHistoricalWeather, fetchWeatherForecast} from '@/lib/weather';

export async function GET(req: NextRequest) {
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

const weather = await fetchHistoricalWeather(
    Number(lat),
    Number(lng),
    date,
    Number(hour),
  );

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
