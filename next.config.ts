import type { NextConfig } from 'next';

const config: NextConfig = {
  // Set only when this deployment is served under a subpath, e.g.
  // https://dx.morabu.com/skill-sheet-2 — the trial and any root-domain
  // deployment leave this unset, per-server in .env.production (see
  // src/lib/base-path.ts, .env.production.example). basePath is baked in at
  // build time, so this must be present when `docker build` / `next build`
  // runs, not only at container start.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  // Identifies this build. A page left open across a deployment compares it
  // with the server's and asks to reload (components/new-version-notice.tsx),
  // because its server-action references no longer exist after a rebuild.
  // Set once by the Dockerfile for the whole build. Never computed here: the
  // config is evaluated in several build processes, which would each get a
  // different value. Unset (local development) turns the check off.
  env: { NEXT_PUBLIC_BUILD_ID: process.env.NEXT_PUBLIC_BUILD_ID || '' },
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  // Playwright and the AWS SDK are server-only and must not be bundled.
  serverExternalPackages: [
    'playwright-core',
    '@aws-sdk/client-s3',
    '@aws-sdk/client-bedrock-runtime',
    'exceljs',
    'nodemailer',
  ],
  experimental: {
    serverActions: {
      // Photo uploads and response files.
      bodySizeLimit: '12mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default config;
