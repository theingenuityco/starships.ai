import nextEnv from '@next/env';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const monorepoRoot = path.resolve(__dirname, '../..');
const isDev = process.env.NODE_ENV !== 'production';
nextEnv.loadEnvConfig(monorepoRoot, isDev);

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  async headers() {
    const PUBLIC_HTML_CACHE_CONTROL = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400';
    const IMMUTABLE_STATIC = 'public, max-age=31536000, immutable';
    const PRIVATE_NO_STORE = 'private, no-store';

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      { source: '/api/contact', headers: [{ key: 'Cache-Control', value: PRIVATE_NO_STORE }] },
      { source: '/screenshots/:path*', headers: [{ key: 'Cache-Control', value: IMMUTABLE_STATIC }] },
      { source: '/', headers: [{ key: 'Cache-Control', value: PUBLIC_HTML_CACHE_CONTROL }] },
    ];
  },
};

export default config;
