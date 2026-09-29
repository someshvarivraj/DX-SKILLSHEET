'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { withBasePath } from '@/lib/base-path';
import { NavLink } from './nav-link';

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

/**
 * The left menu. Always visible on a wide screen; on a phone it is hidden
 * behind the top bar's menu button and slides in as a drawer.
 */
export function AppSidebar({
  items,
  userName,
  userRole,
  note,
}: {
  items: NavItem[];
  userName: string;
  userRole: string;
  /** A short notice shown above the user's name (e.g. AI not connected). */
  note?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Choosing a screen from the drawer closes it.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <header className="app-header">
        <button
          type="button"
          className="icon-btn"
          aria-label="メニューを開く"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link href="/" className="wordmark">
          <span className="mark" aria-hidden>
            SS
          </span>
          スキルシート管理
        </Link>
      </header>

      {open ? <div className="sidebar-scrim" onClick={() => setOpen(false)} aria-hidden /> : null}

      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`} aria-label="メニュー">
        <Link href="/" className="wordmark">
          <span className="mark" aria-hidden>
            SS
          </span>
          スキルシート
          <br />
          管理システム
        </Link>

        <nav className="sidebar-nav" aria-label="主要メニュー">
          {items.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {ICONS[item.icon]}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          {note ? <p className="sidebar-note">{note}</p> : null}
          <p className="sidebar-user-name">{userName}</p>
          <p className="sidebar-user-role">{userRole}</p>
          {/* A plain form action, not next/link's href — Next does not
              rewrite this for the base path on its own. */}
          <form action={withBasePath('/auth/logout')} method="post" className="mt-2.5">
            <button type="submit" className="btn btn-secondary w-full">
              ログアウト
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

const svg = (d: string) => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const ICONS = {
  people: svg('M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.87M16 3.13a3.5 3.5 0 0 1 0 6.75'),
  sheet: svg('M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6'),
  import: svg('M12 3v12M7 10l5 5 5-5M5 21h14'),
  fields: svg('M4 6h16M4 12h16M4 18h10'),
  glossary: svg('M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5'),
  users: svg('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1'),
} as const;
