/**
 * Sessions and access control.  Specification chapter 12.
 *
 * - One-time email link for named users; no password is stored for them.
 * - Only addresses on the allowed domains may sign in.
 * - A single shared, read-only demo account exists for the trial period.
 * - Every sign-in, view, edit, finalise and export is written to the audit log.
 */

import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { generateToken, hashToken } from './crypto';

export const SESSION_COOKIE = 'skillsheet_session';

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  personId: string | null;
};

export async function createSession(userId: string): Promise<string> {
  const env = getEnv();
  const token = generateToken();
  const hdrs = await headers();

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + env.AUTH_SESSION_TTL_DAYS * 86_400_000),
      userAgent: hdrs.get('user-agent') ?? undefined,
      ip: clientIp(hdrs),
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: env.AUTH_SESSION_TTL_DAYS * 86_400,
  });

  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });

  return token;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => undefined);
  }
  store.delete(SESSION_COOKIE);
}

/**
 * Look up the session behind a raw token. Pulled out of `getCurrentUser` so
 * that code outside the App Router — the Pages Router PDF endpoint, which
 * can't call `cookies()` from `next/headers` — can still resolve a user from
 * the session cookie it reads itself (`req.cookies[SESSION_COOKIE]`).
 */
export async function getUserFromToken(token: string): Promise<SessionUser | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    role: session.user.role,
    personId: session.user.personId,
  };
}

/** Current user, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getUserFromToken(token);
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError('ログインが必要である', 401);
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new AuthError('この操作を行う権限がない', 403);
  }
  return user;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number = 401,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export function clientIp(hdrs: Headers): string | undefined {
  return (
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    hdrs.get('x-real-ip') ??
    undefined
  );
}

export function isEmailDomainAllowed(email: string): boolean {
  const domains = getEnv().AUTH_ALLOWED_EMAIL_DOMAINS;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return domains.includes(domain);
}
