import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { can, ROLE_LABELS } from '@/lib/auth/permissions';
import { UserManager } from '@/components/admin/user-manager';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const user = await requireUser();
  if (!can(user, 'user.manage')) notFound();

  const [users, people] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { email: 'asc' }],
      include: { person: { select: { fullNameEnglish: true } } },
    }),
    prisma.person.findMany({
      where: { isActive: true },
      orderBy: { fullNameEnglish: 'asc' },
      select: { id: true, fullNameEnglish: true, fullNameKatakana: true, email: true },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">利用者</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-500">
          ログインは社内メールアドレスへのワンタイムリンクで行います。パスワードは保存しません。
          技術者本人のアカウントは、対象者と紐付けることで自分のスキルシートの経験欄だけを編集できるようになります。
          デモ用アカウントは閲覧のみで、編集・確定・PDF出力はできません。
        </p>
      </div>

      <UserManager
        users={users.map((u) => ({
          id: u.id,
          email: u.email,
          displayName: u.displayName,
          role: u.role,
          roleLabel: ROLE_LABELS[u.role],
          personId: u.personId,
          personName: u.person?.fullNameEnglish ?? null,
          isActive: u.isActive,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        }))}
        people={people}
      />
    </div>
  );
}
