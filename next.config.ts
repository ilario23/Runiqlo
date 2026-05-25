import type {NextConfig} from 'next';

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
        ],
      },
    ];
  },
};

export default nextConfig;
