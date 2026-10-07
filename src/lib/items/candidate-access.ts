/**
 * A candidate's own account and the link to their dashboard (マイページ).
 *
 * Candidates do not get a link to a form: they get a login link to their
 * page, where they see their questionnaire, any request to update it, and
 * their skill sheet once it is ready. The link in the e-mail keeps working
 * for LINK_DAYS (staff login links are single use and expire in minutes); after
 * that they enter their address on the login page for a new one.
 */

import { prisma } from '@/lib/db';
import { generateToken, hashToken } from '@/lib/auth/crypto';
import { getEnv } from '@/lib/env';
import { withBasePath } from '@/lib/base-path';

export const LINK_DAYS = 30;

/**
 * The candidate's account (role ENGINEER, tied to the person), created on
 * first use. An address that already belongs to a staff account is refused:
 * one login cannot be both.
 */
export async function ensureCandidateUser(personId: string): Promise<{ id: string; email: string }> {
  const person = await prisma.person.findUniqueOrThrow({ where: { id: personId }, include: { user: true } });
  if (person.user) {
    if (!person.user.isActive) {
      await prisma.user.update({ where: { id: person.user.id }, data: { isActive: true } });
    }
    return { id: person.user.id, email: person.user.email };
  }
  const email = person.email?.trim().toLowerCase();
  if (!email) throw new Error('メールアドレスが登録されていません');
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== 'ENGINEER') {
      throw new Error(`${email} は管理者・社員のアカウントで使われているため、候補者のログインに使えません`);
    }
    // An engineer account left over from before, not yet tied to anyone.
    if (!existing.personId) {
      await prisma.user.update({ where: { id: existing.id }, data: { personId, isActive: true } });
      return { id: existing.id, email };
    }
    throw new Error(`${email} は別の候補者のアカウントで使われています`);
  }
  const user = await prisma.user.create({
    data: {
      email,
      displayName: person.fullNameKatakana ?? person.fullNameEnglish,
      role: 'ENGINEER',
      personId,
    },
  });
  return { id: user.id, email };
}

/** A new dashboard link for the candidate. Earlier links keep working until they expire. */
export async function candidateLoginLink(personId: string): Promise<{ link: string; email: string }> {
  const user = await ensureCandidateUser(personId);
  const token = generateToken();
  await prisma.loginToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      reusable: true,
      expiresAt: new Date(Date.now() + LINK_DAYS * 86_400_000),
    },
  });
  const link = `${getEnv().APP_URL.replace(/\/$/, '')}${withBasePath(`/auth/verify?token=${token}`)}`;
  return { link, email: user.email };
}
