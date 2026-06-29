import type {NextConfig} from 'next';

const isDev = process.env.NODE_ENV !== 'production';

// Content-Security-Policy. script-src keeps 'unsafe-inline' because Next's
// App Router injects inline hydration bootstrap without a nonce; dev also
// needs 'unsafe-eval' for React Refresh. External script *loading* is still
// blocked. img-src is permissive (Strava avatars live on rotating CDN hosts).
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https://*.basemaps.cartocdn.com https:`,
  `font-src 'self'`,
  // basemaps.cartocdn.com and cloudfront.net are also here, not just img-src:
  // the service worker's fetch handler re-fetches cross-origin map tile /
  // avatar requests itself (sw.js), and some browsers check that against
  // connect-src rather than img-src.
  `connect-src 'self' https://www.strava.com https://*.open-meteo.com https://*.basemaps.cartocdn.com https://*.cloudfront.net${
    isDev ? ' ws:' : ''
  }`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
].join('; ');

const nextConfig: NextConfig = {
  experimental: {},
  allowedDevOrigins: ['192.168.15.102'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {key: 'X-Content-Type-Options', value: 'nosniff'},
          {key: 'X-Frame-Options', value: 'DENY'},
          {key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'},
          {key: 'Content-Security-Policy', value: csp},
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(), camera=(), microphone=(), payment=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
