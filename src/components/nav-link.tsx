'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * A top-level navigation item that knows whether it is the current screen.
 *
 * `aria-current="page"` carries the state, and the stylesheet draws the rule
 * under it — so the marker is announced to a screen reader as well as drawn,
 * rather than being colour alone.
 */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  // /admin/fields is current while on /admin/fields and anything below it, but
  // /people must not light up for /people/<id>/preview's sibling screens only —
  // prefix matching on a path segment boundary gets both right.
  const current = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href} className="nav-link" aria-current={current ? 'page' : undefined}>
      {children}
    </Link>
  );
}
