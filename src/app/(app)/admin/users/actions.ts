'use server';

import { revalidatePath } from 'next/cache';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireUser, isEmailDomainAllowed } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { recordAudit } from '@/lib/audit';

export type UserResult = { ok: boolean; message: string };

async function guard() {
  const user = await requireUser();
  if (!can(user, 'user.manage')) throw new Error('利用者を管理する権限がない');
  return user;
}

export async function saveUserAction(input: {
  id?: string;
  email: string;
  displayName: string;
  role: Role;
  personId?: string | null;
  isActive: boolean;
}): Promise<UserResult> {
  const actor = await guard();
  const email = input.email.trim().toLowerCase();

  if (!isEmailDomainAllowed(email)) {
    return {
      ok: false,
      message: '許可されたドメインのメールアドレスのみ登録できる',
    };
  }
  if (input.role === 'ENGINEER' && !input.personId) {
    return { ok: false, message: '技術者アカウントは対象者と紐付ける必要がある' };
  }

  const data = {
    email,
    displayName: input.displayName.trim(),
    role: input.role,
    personId: input.role === 'ENGINEER' ? input.personId : null,
    isActive: input.isActive,
  };

  const saved = input.id
    ? await prisma.user.update({ where: { id: input.id }, data })
    : await prisma.user.create({ data });

  await recordAudit({
    userId: actor.id,
    action: input.id ? 'user.update' : 'user.create',
    entityType: 'User',
    entityId: saved.id,
    summary: `${saved.email}（${saved.role}）`,
  });

  revalidatePath('/admin/users');
  return { ok: true, message: '保存した' };
}
