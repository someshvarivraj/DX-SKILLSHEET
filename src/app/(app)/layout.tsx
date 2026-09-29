import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { getEnv } from '@/lib/env';
import { AppSidebar, type NavItem } from '@/components/app-sidebar';
import { HeaderOffset } from '@/components/header-offset';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const env = getEnv();

  const links: Array<NavItem & { show: boolean }> = [
    { href: '/people', label: '対象者一覧', icon: 'people', show: user.role !== 'ENGINEER' },
    { href: '/my-sheet', label: '自分のスキルシート', icon: 'sheet', show: user.role === 'ENGINEER' },
    { href: '/admin/import', label: '回答の取り込み', icon: 'import', show: can(user, 'import.run') },
    { href: '/admin/fields', label: '項目定義', icon: 'fields', show: can(user, 'definition.manage') },
    { href: '/admin/glossary', label: '対訳辞書', icon: 'glossary', show: can(user, 'glossary.manage') },
    { href: '/admin/users', label: '利用者', icon: 'users', show: can(user, 'user.manage') },
  ];

  return (
    <div className="app-shell">
      <HeaderOffset />
      <AppSidebar
        items={links.filter((l) => l.show).map(({ show: _show, ...item }) => item)}
        userName={user.displayName}
        userRole={ROLE_LABELS[user.role]}
        note={
          env.AI_PROVIDER === 'mock'
            ? 'AIは未接続です。自動生成される文章は仮のものです。'
            : null
        }
      />
      <div className="app-main">
        <main className="page">{children}</main>
      </div>
    </div>
  );
}
