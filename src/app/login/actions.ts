'use server';

import { redirect } from 'next/navigation';
import { prisma, isDatabaseUnreachable, DATABASE_UNREACHABLE_MESSAGE } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { recordAudit } from '@/lib/audit';
import { buildLoginEmail, sendMail } from '@/lib/mail';
import { generateToken, hashToken, verifyPassword } from '@/lib/auth/crypto';
import { createSession, isEmailDomainAllowed } from '@/lib/auth/session';

export type LoginState = { message?: string; error?: string };

/** Spec §12.2 — one-time link, company domain only, no password stored. */
export async function requestLoginLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const env = getEnv();
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();

  if (!email || !email.includes('@')) {
    return { error: 'メールアドレスを入力してください。' };
  }

  if (!isEmailDomainAllowed(email)) {
    await recordAudit({
      action: 'auth.login_failed',
      summary: `許可されていないドメイン: ${email}`,
    });
    return {
      error: `${env.AUTH_ALLOWED_EMAIL_DOMAINS.join('、')} のメールアドレスのみ利用できます。`,
    };
  }

  let user;
  try {
    user = await prisma.user.findUnique({ where: { email } });
  } catch (error) {
    if (isDatabaseUnreachable(error)) {
      return { error: DATABASE_UNREACHABLE_MESSAGE };
    }
    throw error;
  }

  // The same message is shown whether or not the account exists, so the form
  // cannot be used to discover who has access.
  const genericMessage = `ログインリンクを送信しました。メールを確認してください。リンクの有効期限は${env.AUTH_LINK_TTL_MINUTES}分です。`;

  if (!user || !user.isActive) {
    await recordAudit({
      action: 'auth.login_failed',
      summary: `未登録または無効なアカウント: ${email}`,
    });
    return { message: genericMessage };
  }

  const token = generateToken();
  await prisma.loginToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + env.AUTH_LINK_TTL_MINUTES * 60_000),
    },
  });

  const link = `${env.APP_URL.replace(/\/$/, '')}/auth/verify?token=${token}`;
  const mail = buildLoginEmail(link, env.AUTH_LINK_TTL_MINUTES);
  await sendMail({ ...mail, to: email });

  await recordAudit({
    userId: user.id,
    action: 'auth.login_link_requested',
    summary: email,
  });

  return { message: genericMessage };
}

/** Spec §12.3 — the shared, read-only demo account. */
export async function loginWithDemoAccount(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const env = getEnv();
  if (!env.DEMO_ACCOUNT_EMAIL) {
    return { error: 'デモアカウントは無効になっています。' };
  }

  const password = String(formData.get('password') ?? '');
  let user;
  try {
    user = await prisma.user.findUnique({
      where: { email: env.DEMO_ACCOUNT_EMAIL.toLowerCase() },
    });
  } catch (error) {
    if (isDatabaseUnreachable(error)) {
      return { error: DATABASE_UNREACHABLE_MESSAGE };
    }
    throw error;
  }

  if (!user?.passwordHash || !user.isActive) {
    return { error: 'デモアカウントは利用できません。' };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await recordAudit({ action: 'auth.login_failed', summary: 'デモアカウント' });
    return { error: 'パスワードが違います。' };
  }

  await createSession(user.id);
  await recordAudit({ userId: user.id, action: 'auth.login', summary: 'デモアカウント' });
  redirect('/people');
}
