import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  basePath: '/docs',
  assetPrefix: '/docs',
  async rewrites() {
    return {
      beforeFiles: [
        // Allow /api/search to work alongside /docs/api/search
        {
          source: '/api/search',
          destination: '/docs/api/search',
        },
      ],
    };
  },
};

export default withMDX(config);
