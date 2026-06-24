// Reverse geocoding — turn an activity's start coordinate into a place label
// like "Arzignano, Veneto". Uses BigDataCloud's free reverse-geocode-client
// endpoint (no API key). Proxied server-side to match the weather pattern and
// keep the client off third-party origins.

export interface PlaceLabel {
  /** Short display label, e.g. "Arzignano, Veneto". */
  label: string;
  city?: string;
  region?: string;
  country?: string;
}

interface BigDataCloudResponse {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryName?: string;
}

/** Reverse-geocode a coordinate to a place label, or null on failure. */
export async function reverseGeocode(lat: number, lng: number): Promise<PlaceLabel | null> {
  const url =
    `https://api.bigdatacloud.net/data/reverse-geocode-client` +
    `?latitude=${lat}&longitude=${lng}&localityLanguage=en`;

  try {
    const res = await fetch(url, {signal: AbortSignal.timeout(8000)});
    if (!res.ok) return null;
    const data = (await res.json()) as BigDataCloudResponse;

    const city = data.city || data.locality || undefined;
    const region = data.principalSubdivision || undefined;
    const country = data.countryName || undefined;

    const parts = [city, region].filter(Boolean) as string[];
    const label = parts.length ? parts.join(', ') : country;
    if (!label) return null;

    return {label, city, region, country};
  } catch {
    return null;
  }
}
