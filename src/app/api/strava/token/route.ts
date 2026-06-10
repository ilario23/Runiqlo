import {NextRequest, NextResponse} from 'next/server';
import {
  applyStravaTokenPayloadToResponse,
  persistStravaSession,
  postStravaOAuthToken,
  refreshStravaTokensFromRequest,
  updateSessionRefreshToken,
} from '@/lib/stravaTokenBroker';

const CLIENT_ID = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET ?? '';

export async function POST(request: NextRequest) {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({error: 'Invalid JSON'}, {status: 400});
  }

  if (body.grant_type === 'refresh_token') {
    const result = await refreshStravaTokensFromRequest(request, body.refresh_token);
    if (!result.ok) {
      return new NextResponse(result.bodyText, {
        status: result.status,
        headers: {'Content-Type': 'application/json'},
      });
    }
    const response = new NextResponse(result.bodyText, {
      status: result.status,
      headers: {'Content-Type': 'application/json'},
    });
    applyStravaTokenPayloadToResponse(response, result.parsed);
    if (result.parsed.refresh_token) {
      await updateSessionRefreshToken(request, response, result.parsed.refresh_token);
    }
    return response;
  }

  if (body.grant_type !== 'authorization_code') {
    return NextResponse.json({error: 'Unsupported grant_type'}, {status: 400});
  }

  const formData = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: body.grant_type,
    code: body.code,
  });

  try {
    const {status, bodyText} = await postStravaOAuthToken(formData);
    const response = new NextResponse(bodyText, {
      status,
      headers: {'Content-Type': 'application/json'},
    });
    if (status >= 200 && status < 300) {
      try {
        const parsed = JSON.parse(bodyText) as {
          access_token?: string;
          refresh_token?: string;
          expires_at?: number;
          athlete?: {id?: number};
        };
        applyStravaTokenPayloadToResponse(response, parsed);
        const athleteId = parsed.athlete?.id;
        if (parsed.refresh_token && typeof athleteId === 'number') {
          await persistStravaSession(request, response, athleteId, parsed.refresh_token);
        }
      } catch { /* noop */ }
    }
    return response;
  } catch {
    return NextResponse.json({error: 'Failed to contact Strava'}, {status: 500});
  }
}
