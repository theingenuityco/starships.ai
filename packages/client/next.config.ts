import {withSentryConfig} from '@sentry/nextjs';
import type { NextConfig } from 'next'
import { loadEnvConfig } from '@next/env'
import path from 'path'

// Load env from monorepo root for local dev
// In production (Docker/K8s), env vars are injected directly into process.env
const monorepoRoot = path.resolve(__dirname, '../..')
loadEnvConfig(monorepoRoot)

const nextConfig: NextConfig = {
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
    // Use dirs to specify which directories to run ESLint on during next build
    dirs: ['src'],
  },
  typescript: {
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true,
  },
  // Enable experimental build optimizations for CI builds
  experimental: {
    // Enable optimizations for CI builds to reduce memory usage
    ...(process.env.CI ? { optimizePackageImports: ['@radix-ui/react-icons', '@iconify/react'] } : {}),
  },
  webpack: (config, { isServer }) => {
    // Prevent Node.js modules from being bundled in the browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        assert: false,
        http: false,
        https: false,
        url: false,
        zlib: false,
        dotenv: false, // Prevent dotenv from client bundle
      }
    }
    return config
  },
}

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "the-ingenuity-labs-inc",

  project: "starships-client",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  // automaticVercelMonitors: true,
});