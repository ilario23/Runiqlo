// Open-Meteo integration — no API key required.
// Historical: https://archive-api.open-meteo.com (past activities)
// Forecast:   https://api.open-meteo.com          (coach tool)
// Geocoding:  https://geocoding-api.open-meteo.com (city → lat/lng)

// WMO weather interpretation codes
const WMO_CODES: Record<number, {label: string; emoji: string}> = {
  0:  {label: 'Clear sky',           emoji: '☀️'},
  1:  {label: 'Mainly clear',        emoji: '🌤️'},
  2:  {label: 'Partly cloudy',       emoji: '⛅'},
  3:  {label: 'Overcast',            emoji: '☁️'},
  45: {label: 'Foggy',               emoji: '🌫️'},
  48: {label: 'Freezing fog',        emoji: '🌫️'},
  51: {label: 'Light drizzle',       emoji: '🌦️'},
  53: {label: 'Drizzle',             emoji: '🌦️'},
  55: {label: 'Dense drizzle',       emoji: '🌦️'},
  56: {label: 'Freezing drizzle',    emoji: '🌨️'},
  57: {label: 'Heavy freezing drizzle', emoji: '🌨️'},
  61: {label: 'Light rain',          emoji: '🌧️'},
  63: {label: 'Rain',                emoji: '🌧️'},
  65: {label: 'Heavy rain',          emoji: '🌧️'},
  66: {label: 'Freezing rain',       emoji: '🌨️'},
  67: {label: 'Heavy freezing rain', emoji: '🌨️'},
  71: {label: 'Light snow',          emoji: '🌨️'},
  73: {label: 'Snow',                emoji: '❄️'},
  75: {label: 'Heavy snow',          emoji: '❄️'},
  77: {label: 'Snow grains',         emoji: '🌨️'},
  80: {label: 'Rain showers',        emoji: '🌧️'},
  81: {label: 'Moderate rain showers', emoji: '🌧️'},
  82: {label: 'Violent rain showers', emoji: '⛈️'},
  85: {label: 'Snow showers',        emoji: '🌨️'},
  86: {label: 'Heavy snow showers',  emoji: '❄️'},
  95: {label: 'Thunderstorm',        emoji: '⛈️'},
  96: {label: 'Thunderstorm + hail', emoji: '⛈️'},
  99: {label: 'Thunderstorm + heavy hail', emoji: '⛈️'},
};

export function describeWMO(code: number): {label: string; emoji: string} {
  if (WMO_CODES[code]) return WMO_CODES[code];
  // Find nearest known code
  const keys = Object.keys(WMO_CODES).map(Number);
  const nearest = keys.reduce((a, b) => (Math.abs(b - code) < Math.abs(a - code) ? b : a));
  return WMO_CODES[nearest] ?? {label: 'Unknown', emoji: '🌡️'};
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function windDirectionLabel(deg: number): string {
  return COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ActivityWeatherData {
  temperatureC: number;
  apparentTemperatureC: number;
  precipitationMm: number;
  weatherCode: number;
  windSpeedKmh: number;
  windDirectionDeg: number;
  humidityPct: number;
  conditionLabel: string;
  conditionEmoji: string;
}

export interface WeatherForecastDay {
  date: string;
  maxTempC: number;
  minTempC: number;
  precipitationMm: number;
  precipProbabilityPct: number;
  windSpeedKmh: number;
  weatherCode: number;
  conditionLabel: string;
  conditionEmoji: string;
}

export interface WeatherForecast {
  current: {
    temperatureC: number;
    apparentTemperatureC: number;
    weatherCode: number;
    conditionLabel: string;
    conditionEmoji: string;
    windSpeedKmh: number;
    humidityPct: number;
    precipitationMm: number;
  };
  daily: WeatherForecastDay[];
  locationName?: string;
}

// ─── Shared hourly fields ──────────────────────────────────────────────────────

const HOURLY_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation',
  'weathercode',
  'windspeed_10m',
  'winddirection_10m',
  'relativehumidity_2m',
].join(',');

function parseHourlySlice(hourly: Record<string, number[]>, idx: number): ActivityWeatherData | null {
  if (!hourly?.temperature_2m) return null;
  const weatherCode = hourly.weathercode[idx] ?? 0;
  const {label, emoji} = describeWMO(weatherCode);
  return {
    temperatureC: Math.round((hourly.temperature_2m[idx] ?? 0) * 10) / 10,
    apparentTemperatureC: Math.round((hourly.apparent_temperature[idx] ?? 0) * 10) / 10,
    precipitationMm: Math.round((hourly.precipitation[idx] ?? 0) * 10) / 10,
    weatherCode,
    windSpeedKmh: Math.round(hourly.windspeed_10m[idx] ?? 0),
    windDirectionDeg: Math.round(hourly.winddirection_10m[idx] ?? 0),
    humidityPct: Math.round(hourly.relativehumidity_2m[idx] ?? 0),
    conditionLabel: label,
    conditionEmoji: emoji,
  };
}

// ─── Historical weather (for past activities) ──────────────────────────────────
// Strategy:
//   ≤ 16 days ago → forecast API with past_days (no lag, available immediately)
//   > 16 days ago → ERA5 archive API (highly accurate reanalysis)
// This means even today's run can get weather data.

export async function fetchHistoricalWeather(
  lat: number,
  lng: number,
  dateStr: string,
  utcHour: number,
): Promise<ActivityWeatherData | null> {
  try {
    const activityMs = new Date(dateStr + 'T00:00:00Z').getTime();
    const todayMs = Date.now() - (Date.now() % 86400000); // start of UTC day
    const daysAgo = Math.floor((todayMs - activityMs) / 86400000);

    if (daysAgo <= 16) {
      return await fetchRecentWeather(lat, lng, dateStr, utcHour, daysAgo);
    } else {
      return await fetchArchiveWeather(lat, lng, dateStr, utcHour);
    }
  } catch {
    return null;
  }
}

// Forecast API with past_days — covers same-day up to 16 days ago, no lag.
// NOTE: past_days is mutually exclusive with start_date/end_date on this API.
// We request past_days only, then locate the exact hour via the time[] array.
async function fetchRecentWeather(
  lat: number,
  lng: number,
  dateStr: string,
  utcHour: number,
  daysAgo: number,
): Promise<ActivityWeatherData | null> {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('hourly', HOURLY_FIELDS);
    // past_days must cover at least daysAgo; cap at 16 (API max)
    url.searchParams.set('past_days', String(Math.min(Math.max(daysAgo, 1), 16)));
    url.searchParams.set('forecast_days', '1'); // limit future payload
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('wind_speed_unit', 'kmh');

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const json = await res.json();

    // Locate the exact hour by matching the ISO time string (e.g. "2026-05-21T07:00")
    const targetTime = `${dateStr}T${String(utcHour).padStart(2, '0')}:00`;
    const times: string[] = json.hourly?.time ?? [];
    const idx = times.indexOf(targetTime);
    if (idx === -1) return null;

    return parseHourlySlice(json.hourly, idx);
  } catch {
    return null;
  }
}

// ERA5 archive API — covers dates older than 16 days with high accuracy.
async function fetchArchiveWeather(
  lat: number,
  lng: number,
  dateStr: string,
  utcHour: number,
): Promise<ActivityWeatherData | null> {
  try {
    const url = new URL('https://archive-api.open-meteo.com/v1/archive');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('start_date', dateStr);
    url.searchParams.set('end_date', dateStr);
    url.searchParams.set('hourly', HOURLY_FIELDS);
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('wind_speed_unit', 'kmh');

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const json = await res.json();
    const idx = Math.min(Math.max(0, utcHour), 23);
    return parseHourlySlice(json.hourly, idx);
  } catch {
    return null;
  }
}

// ─── Geocoding (city name → lat/lng) ──────────────────────────────────────────

async function geocodeCity(
  cityName: string,
): Promise<{lat: number; lng: number; name: string} | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`;
    const res = await fetch(url, {next: {revalidate: 3600}});
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.results?.length) return null;
    const r = json.results[0];
    return {lat: r.latitude, lng: r.longitude, name: `${r.name}, ${r.country}`};
  } catch {
    return null;
  }
}

// ─── Forecast (for coach tool) ─────────────────────────────────────────────────

export async function fetchWeatherForecast(
  location: string | {lat: number; lng: number},
): Promise<WeatherForecast | null> {
  try {
    let lat: number, lng: number, locationName: string | undefined;

    if (typeof location === 'string') {
      const geo = await geocodeCity(location);
      if (!geo) return null;
      lat = geo.lat;
      lng = geo.lng;
      locationName = geo.name;
    } else {
      lat = location.lat;
      lng = location.lng;
    }

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('current', [
      'temperature_2m',
      'apparent_temperature',
      'precipitation',
      'weathercode',
      'windspeed_10m',
      'relativehumidity_2m',
    ].join(','));
    url.searchParams.set('daily', [
      'weathercode',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'precipitation_probability_max',
      'windspeed_10m_max',
    ].join(','));
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('wind_speed_unit', 'kmh');
    url.searchParams.set('forecast_days', '7');

    const res = await fetch(url.toString(), {next: {revalidate: 1800}});
    if (!res.ok) return null;
    const json = await res.json();

    const c = json.current;
    const d = json.daily;
    if (!c || !d) return null;

    const currentCode = c.weathercode ?? 0;
    const {label: cLabel, emoji: cEmoji} = describeWMO(currentCode);

    return {
      current: {
        temperatureC: Math.round((c.temperature_2m ?? 0) * 10) / 10,
        apparentTemperatureC: Math.round((c.apparent_temperature ?? 0) * 10) / 10,
        weatherCode: currentCode,
        conditionLabel: cLabel,
        conditionEmoji: cEmoji,
        windSpeedKmh: Math.round(c.windspeed_10m ?? 0),
        humidityPct: Math.round(c.relativehumidity_2m ?? 0),
        precipitationMm: Math.round((c.precipitation ?? 0) * 10) / 10,
      },
      daily: (d.time as string[]).map((date: string, i: number) => {
        const code = d.weathercode[i] ?? 0;
        const {label, emoji} = describeWMO(code);
        return {
          date,
          maxTempC: Math.round((d.temperature_2m_max[i] ?? 0) * 10) / 10,
          minTempC: Math.round((d.temperature_2m_min[i] ?? 0) * 10) / 10,
          precipitationMm: Math.round((d.precipitation_sum[i] ?? 0) * 10) / 10,
          precipProbabilityPct: d.precipitation_probability_max[i] ?? 0,
          windSpeedKmh: Math.round(d.windspeed_10m_max[i] ?? 0),
          weatherCode: code,
          conditionLabel: label,
          conditionEmoji: emoji,
        };
      }),
      locationName,
    };
  } catch {
    return null;
  }
}
