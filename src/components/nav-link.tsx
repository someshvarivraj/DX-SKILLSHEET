'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * A menu item that knows whether it is the current screen.
 *
 * `aria-current="page"` carries the state and the stylesheet draws it, so the
 * marker is announced to a screen reader as well as shown.
 */
export function NavLink({
  href,
  title,
  children,
}: {
  href: string;
  /** Shown as a tooltip — the only label when the menu is folded to icons. */
  title?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '';
  // /admin/fields is current while on /admin/fields and anything below it;
  // prefix matching on a path segment boundary keeps /people from lighting up
  // for an unrelated path that merely starts with the same letters.
  const current = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      title={title}
      className="nav-link"
      aria-current={current ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}
