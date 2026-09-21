import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { getAiProvider } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Used by the container health check and by the deployment runbook. */
export async function GET() {
  const env = getEnv();
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true };
  } catch (error) {
    checks.database = { ok: false, detail: (error as Error).message };
  }

  checks.ai = { ok: true, detail: `provider=${env.AI_PROVIDER}` };
  checks.storage = { ok: true, detail: `driver=${env.STORAGE_DRIVER}` };
  checks.mail = { ok: true, detail: `transport=${env.MAIL_TRANSPORT}` };

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { ok, checks, provider: getAiProvider().name, time: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
