import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { hashToken } from '@/lib/auth/crypto';
import { createSession } from '@/lib/auth/session';
import { redirectToPath } from '@/lib/redirect';
import { BASE_PATH } from '@/lib/base-path';
import { LANG_COOKIE } from '@/lib/i18n';

/**
 * Login link (spec §12.2). A staff link is valid for a short period and single
 * use: it is consumed whether or not the session is created, so a link that
 * leaks into a mail archive cannot be replayed. A candidate's dashboard link
 * (reusable) opens their page again until it expires.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const failure = () => redirectToPath('/login?error=invalid');

  if (!token) return failure();

  const record = await prisma.loginToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  const spent = record && !record.reusable && record.usedAt;
  if (!record || spent || record.expiresAt < new Date() || !record.user.isActive) {
    await recordAudit({
      userId: record?.userId,
      action: 'auth.login_failed',
      summary: 'リンクが無効または期限切れである',
    });
    return failure();
  }

  // A reusable link records its last use instead of being spent.
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
  const response = redirectToPath(destination);
  // Candidates read English first; staff Japanese. A language already chosen
  // in this browser is kept.
  if (record.user.role === 'ENGINEER' && !request.cookies.get(LANG_COOKIE)) {
    response.cookies.set(LANG_COOKIE, 'en', { path: BASE_PATH || '/', maxAge: 31_536_000, sameSite: 'lax' });
  }
  return response;
}
