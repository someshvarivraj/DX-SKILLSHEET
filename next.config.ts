import type { NextConfig } from 'next';

const config: NextConfig = {
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
