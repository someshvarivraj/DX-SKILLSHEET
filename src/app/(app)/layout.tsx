import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { getEnv } from '@/lib/env';
import { NavLink } from '@/components/nav-link';
import { HeaderOffset } from '@/components/header-offset';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const env = getEnv();

  const links: Array<{ href: string; label: string; show: boolean }> = [
    { href: '/people', label: '対象者一覧', show: user.role !== 'ENGINEER' },
    { href: '/my-sheet', label: '自分のスキルシート', show: user.role === 'ENGINEER' },
    { href: '/admin/import', label: '取り込み', show: can(user, 'import.run') },
    { href: '/admin/fields', label: '項目定義', show: can(user, 'definition.manage') },
    { href: '/admin/glossary', label: '対訳辞書', show: can(user, 'glossary.manage') },
    { href: '/admin/users', label: '利用者', show: can(user, 'user.manage') },
    { href: '/admin/audit', label: '操作ログ', show: can(user, 'audit.view') },
  ];

  return (
    <div className="min-h-screen">
      <HeaderOffset />
      <header className="app-header sticky top-0 z-30">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-2.5">
          <Link href="/" className="wordmark">
            <span className="mark" aria-hidden>
              SS
            </span>
            スキルシート管理システム
          </Link>
          {/* order-last on a narrow screen: the nav drops to its own scrollable
              row rather than pushing the whole header sideways. */}
          <nav
            className="order-last flex w-full min-w-0 items-center gap-1 overflow-x-auto md:order-none md:w-auto md:flex-1"
            aria-label="主要メニュー"
          >
            {links
              .filter((l) => l.show)
              .map((link) => (
                <NavLink key={link.href} href={link.href}>
                  {link.label}
                </NavLink>
              ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="header-user text-right text-xs leading-tight">
              <span className="block font-semibold">{user.displayName}</span>
              <span className="header-user-role block">{ROLE_LABELS[user.role]}</span>
            </span>
            <form action="/auth/logout" method="post">
              <button type="submit" className="btn btn-on-bar">
                ログアウト
              </button>
            </form>
          </div>
        </div>
        {env.NODE_ENV !== 'production' || env.AI_PROVIDER === 'mock' ? (
          <div className="env-banner">
            {env.AI_PROVIDER === 'mock'
              ? 'AIサービスは未接続です（モックプロバイダで動作中）。生成された文章は仮のものです。'
              : `環境: ${env.NODE_ENV}`}
          </div>
        ) : null}
      </header>
      <main className="mx-auto max-w-[1400px] px-6 py-7">{children}</main>
    </div>
  );
}
