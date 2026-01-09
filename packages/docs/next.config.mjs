import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  basePath: '/docs',
  assetPrefix: '/docs',
  async headers() {
    // Docs is public, fully cacheable; keep search/API endpoints uncached.
    const PUBLIC_HTML_CACHE_CONTROL = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400';
    const IMMUTABLE_STATIC = 'public, max-age=31536000, immutable';
    const PRIVATE_NO_STORE = 'private, no-store';

    return [
      // Docs search endpoint (dynamic)
      { source: '/api/search', headers: [{ key: 'Cache-Control', value: PRIVATE_NO_STORE }] },
      { source: '/docs/api/search', headers: [{ key: 'Cache-Control', value: PRIVATE_NO_STORE }] },

      // Next build assets (note: assetPrefix/basePath means these are typically under /docs/_next/*)
      { source: '/_next/static/:path*', headers: [{ key: 'Cache-Control', value: IMMUTABLE_STATIC }] },
      { source: '/docs/_next/static/:path*', headers: [{ key: 'Cache-Control', value: IMMUTABLE_STATIC }] },

      // Public docs HTML
      { source: '/:path*', headers: [{ key: 'Cache-Control', value: PUBLIC_HTML_CACHE_CONTROL }] },
    ];
  },
};

export default withMDX(config);
