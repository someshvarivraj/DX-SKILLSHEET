import { NewVersionNotice } from '@/components/new-version-notice';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { getEnv } from '@/lib/env';
import { AppShell, type NavItem } from '@/components/app-sidebar';
import { HeaderOffset } from '@/components/header-offset';
import { getT } from '@/lib/i18n/server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const env = getEnv();
  const t = await getT();

  const links: Array<NavItem & { show: boolean }> = [
    { href: '/people', label: t('対象者一覧'), icon: 'people', show: user.role !== 'ENGINEER' },
    { href: '/my-sheet', label: t('自分のスキルシート'), icon: 'sheet', show: user.role === 'ENGINEER' },
    { href: '/admin/import', label: t('回答の取り込み'), icon: 'import', show: can(user, 'import.run') },
    { href: '/admin/items', label: t('設問マスタ'), icon: 'items', show: can(user, 'definition.manage') },
    { href: '/admin/fields', label: t('項目定義'), icon: 'fields', show: can(user, 'definition.manage') },
    { href: '/admin/glossary', label: t('対訳辞書'), icon: 'glossary', show: can(user, 'glossary.manage') },
    { href: '/admin/users', label: t('利用者'), icon: 'users', show: can(user, 'user.manage') },
  ];

  return (
    <>
      <HeaderOffset />
      <NewVersionNotice />
      <AppShell
        items={links.filter((l) => l.show).map(({ show: _show, ...item }) => item)}
        userName={user.displayName}
        userRole={t(ROLE_LABELS[user.role])}
        note={
          env.AI_PROVIDER === 'mock'
            ? t('AIは未接続です。自動生成される文章は仮のものです。')
            : null
        }
      >
        {children}
      </AppShell>
    </>
  );
}
