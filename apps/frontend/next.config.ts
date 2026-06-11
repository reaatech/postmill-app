import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';
import { redirects } from './src/redirects.config';

// The browser fetches the backend directly (NEXT_PUBLIC_BACKEND_URL). When the
// frontend and backend are served from different origins (e.g. the cross-origin
// dev split :4200 → :3000), that origin must be in connect-src or the browser
// blocks the request with "Failed to fetch" before it leaves the page. Same-origin
// deployments already covered by 'self'; adding it explicitly is harmless.
const backendOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_BACKEND_URL!).origin;
  } catch {
    return '';
  }
})();

const nextConfig: NextConfig = {
  experimental: {
    proxyTimeout: 90_000,
    // Turbopack's dev cache is native (Rust) memory, unbounded by default and
    // outside --max-old-space-size; without a target it grows past 5 GB on this
    // app. This sets a GC target (bytes) so dev fits in a memory-limited VM.
    ...(process.env.NODE_ENV === 'development'
      ? { turbopackMemoryLimit: 3 * 1024 * 1024 * 1024 }
      : {}),
  },
  // Document-Policy header for browser profiling
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Document-Policy',
            value: 'js-profiling',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.googletagmanager.com https://plausible.io https://js.stripe.com https://m.stripe.network",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://js.stripe.com",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https://fonts.gstatic.com",
              `connect-src 'self' ${backendOrigin} https://plausible.io https://api.stripe.com https://m.stripe.network https://www.googletagmanager.com ws://localhost:* wss://*`,
              "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
              "frame-ancestors 'none'",
              "media-src 'self' data: blob: https:",
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
  reactStrictMode: false,
  transpilePackages: ['crypto-hash'],
  // Sourcemaps disabled for production security; Sentry gets hidden-source-map via webpack
  productionBrowserSourceMaps: false,

  // Custom webpack config to ensure sourcemaps are generated properly
  webpack: (config, { buildId, dev, isServer, defaultLoaders }) => {
    // Enable sourcemaps for both client and server in production
    if (!dev) {
      config.devtool = isServer ? 'source-map' : 'hidden-source-map';
    }

    return config;
  },
  redirects,
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: '/api/uploads/:path*',
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Sourcemap configuration optimized for monorepo
  sourcemaps: {
    disable: false,
    // More comprehensive asset patterns for monorepo
    assets: [
      '.next/static/**/*.js',
      '.next/static/**/*.js.map',
      '.next/server/**/*.js',
      '.next/server/**/*.js.map',
    ],
    ignore: [
      '**/node_modules/**',
      '**/*hot-update*',
      '**/_buildManifest.js',
      '**/_ssgManifest.js',
      '**/*.test.js',
      '**/*.spec.js',
    ],
    deleteSourcemapsAfterUpload: true,
  },

  // Release configuration
  release: {
    create: true,
    finalize: true,
    // Use git commit hash for releases in monorepo
    name:
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || undefined,
  },

  // NextJS specific optimizations for monorepo
  widenClientFileUpload: true,

  // Additional configuration
  telemetry: false,
  silent: process.env.NODE_ENV === 'production',
  debug: process.env.NODE_ENV === 'development',

  // Error handling for CI/CD
  errorHandler: (error) => {
    console.warn('Sentry build error occurred:', error.message);
    console.warn(
      'This might be due to missing Sentry environment variables or network issues'
    );
    // Don't fail the build if Sentry upload fails in monorepo context
    return;
  },
});
