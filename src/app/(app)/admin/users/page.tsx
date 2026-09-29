import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { can, ROLE_LABELS } from '@/lib/auth/permissions';
import { UserManager } from '@/components/admin/user-manager';
import { PageHeader } from '@/components/page-header';

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
    <div>
      <PageHeader
        title="利用者"
        lead="ログインできる人を登録します。登録したメールアドレスにログイン用のリンクが届きます（パスワードは不要）。"
      />

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
