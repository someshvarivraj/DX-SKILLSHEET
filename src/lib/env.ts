/**
 * Environment configuration.
 *
 * Every deployment difference between local and AWS lives here and nowhere
 * else, so moving between them is a matter of environment variables only
 * (spec §5.7: "externalise the connection settings so that migration only
 * requires changing the endpoint").
 */

import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** PostgreSQL connection string. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /** Public origin, e.g. https://dx.morabu.com — used in login links and PDFs. */
  APP_URL: z.string().url().default('http://localhost:3000'),
  APP_NAME: z.string().default('スキルシート管理システム'),
  /** Printed in the PDF footer. */
  COMPANY_NAME: z.string().default('モラブ阪神工業株式会社'),

  /** Secret used to sign session and login tokens. 32+ characters. */
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  /** Comma-separated list of email domains allowed to sign in. */
  AUTH_ALLOWED_EMAIL_DOMAINS: z
    .string()
    .default('morabu.com')
    .transform((v) =>
      v
        .split(',')
        .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean),
    ),
  AUTH_LINK_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  AUTH_SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** Shared read-only demo account (spec §12.3). Blank disables it. */
  DEMO_ACCOUNT_EMAIL: z.string().optional(),
  DEMO_ACCOUNT_PASSWORD: z.string().optional(),

  /** smtp | console — console prints the login link to the server log. */
  MAIL_TRANSPORT: z.enum(['smtp', 'console']).default('console'),
  MAIL_FROM: z.string().default('skillsheet@example.local'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: bool(false),

  /** local | s3 */
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./storage'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('ap-northeast-1'),
  /** Optional; on EC2 the instance role is used when these are unset. */
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),

  /** mock | bedrock | openai-compatible */
  AI_PROVIDER: z.enum(['mock', 'bedrock', 'openai-compatible']).default('mock'),
  AI_MODEL: z.string().default('mock-model'),
  AI_REGION: z.string().default('ap-northeast-1'),
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().optional(),
  /** Kept at 0 so the same input produces the same text (spec §8.6). */
  AI_TEMPERATURE: z.coerce.number().min(0).max(1).default(0),
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(1500),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

  /** Chromium executable used for PDF rendering. */
  CHROMIUM_PATH: z.string().optional(),
  /** Only one PDF at a time on a small instance (spec §11.3). */
  PDF_MAX_CONCURRENCY: z.coerce.number().int().positive().default(1),
  /** Print the time as well as the date in the PDF footer (spec §11.5). */
  PDF_FOOTER_SHOW_TIME: bool(false),
});

export type AppEnv = z.infer<typeof schema>;

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Environment configuration is invalid:\n${issues}\n\n` +
        'Copy .env.example to .env and fill in the values.',
    );
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = () => getEnv().NODE_ENV === 'production';
