'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { withBasePath } from '@/lib/base-path';
import { NavLink } from './nav-link';

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

const STORAGE_KEY = 'skillsheet.sidebar';
/** A person's editing screen (/people/<id>, not the list or the preview). */
const SHEET_SCREEN = /^\/people\/[^/]+$/;

/**
 * The page frame: the left menu, plus a ☰ top bar on phones.
 *
 * - Wide screen: the menu is docked beside the page. The « button in its
 *   header folds it to a strip of icons, so a long sheet or the field list
 *   gets nearly the whole width while every screen is still one click away;
 *   the choice is remembered in this browser (Sano-san's review, 2026-09-29).
 * - Phone: the menu is hidden and ☰ slides it in over the page as a drawer.
 */
export function AppShell({
  items,
  userName,
  userRole,
  note,
  children,
}: {
  items: NavItem[];
  userName: string;
  userRole: string;
  /** A short notice shown above the user's name (e.g. AI not connected). */
  note?: string | null;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [savedDocked, setSavedDocked] = useState(true);
  // On a person's sheet the menu starts folded, so the form (and the preview
  // beside it) get the width (Sano-san's review, 2026-09-30). Opening it there
  // lasts until the next screen and does not change the saved preference.
  const [openedOnSheet, setOpenedOnSheet] = useState(false);
  const pathname = usePathname() ?? '';
  const onSheet = SHEET_SCREEN.test(pathname);
  const docked = onSheet ? openedOnSheet : savedDocked;

  // Choosing a screen closes the phone drawer and re-folds the menu on the
  // next sheet.
  useEffect(() => {
    setDrawerOpen(false);
    setOpenedOnSheet(false);
  }, [pathname]);

  // Restore the wide-screen choice. Storage can be unavailable (private
  // window, blocked site data); the menu then simply starts open.
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'closed') setSavedDocked(false);
    } catch {}
  }, []);

  // The stylesheet reads this attribute on <html>; it is removed on the way
  // out so screens outside this frame (login, preview) are unaffected.
  useEffect(() => {
    const root = document.documentElement;
    if (docked) delete root.dataset.sidebar;
    else root.dataset.sidebar = 'closed';
    return () => {
      delete root.dataset.sidebar;
    };
  }, [docked]);

  const toggleDocked = () => {
    const next = !docked;
    if (onSheet) {
      setOpenedOnSheet(next);
      return;
    }
    setSavedDocked(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'open' : 'closed');
    } catch {}
  };

  return (
    <div className="app-shell">
      {drawerOpen ? (
        <div className="sidebar-scrim" onClick={() => setDrawerOpen(false)} aria-hidden />
      ) : null}

      <aside id="app-menu" className={`sidebar ${drawerOpen ? 'sidebar-open' : ''}`} aria-label="メニュー">
        <div className="sidebar-head">
          <Link href="/" className="wordmark">
            <span className="mark" aria-hidden>
              SS
            </span>
            <span>
              スキルシート
              <br />
              管理システム
            </span>
          </Link>
          <button
            type="button"
            className="sidebar-collapse"
            onClick={toggleDocked}
            aria-label={docked ? 'メニューをたたむ' : 'メニューを広げる'}
            title={docked ? 'メニューをたたむ' : 'メニューを広げる'}
          >
            {docked ? <PanelLeftClose size={18} aria-hidden /> : <PanelLeftOpen size={18} aria-hidden />}
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="主要メニュー">
          {items.map((item) => (
            <NavLink key={item.href} href={item.href} title={item.label}>
              {ICONS[item.icon]}
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          {/* A plain form action, not next/link's href — Next does not
              rewrite this for the base path on its own. */}
          <form action={withBasePath('/auth/logout')} method="post">
            <div className="sidebar-foot-full">
              {note ? <p className="sidebar-note">{note}</p> : null}
              <p className="sidebar-user-name">{userName}</p>
              <p className="sidebar-user-role">{userRole}</p>
              <button type="submit" className="btn btn-secondary mt-2.5 w-full">
                ログアウト
              </button>
            </div>
            <button
              type="submit"
              className="icon-btn sidebar-logout-icon"
              aria-label="ログアウト"
              title={`${userName}（${userRole}）— ログアウト`}
            >
              <LogOut size={18} aria-hidden />
            </button>
          </form>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <button
            type="button"
            className="icon-btn"
            aria-label="メニューを開く"
            aria-controls="app-menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link href="/" className="wordmark">
            <span className="mark" aria-hidden>
              SS
            </span>
            スキルシート管理システム
          </Link>
        </header>
        <main className="page">{children}</main>
      </div>
    </div>
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
