import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { hashToken } from '@/lib/auth/crypto';
import { createSession } from '@/lib/auth/session';
import { redirectToPath } from '@/lib/redirect';

/**
 * One-time login link (spec §12.2): valid for a short period, single use.
 * The token is consumed whether or not the session is created, so a link that
 * leaks into a mail archive cannot be replayed.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const failure = () => redirectToPath('/login?error=invalid');

  if (!token) return failure();

  const record = await prisma.loginToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.isActive) {
    await recordAudit({
      userId: record?.userId,
      action: 'auth.login_failed',
      summary: 'リンクが無効または期限切れである',
    });
    return failure();
  }

  await prisma.loginToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  await createSession(record.userId);
  await recordAudit({
    userId: record.userId,
    action: 'auth.login',
    summary: record.user.email,
  });

  const destination = record.user.role === 'ENGINEER' ? '/my-sheet' : '/people';
  return redirectToPath(destination);
}
