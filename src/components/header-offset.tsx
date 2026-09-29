'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Publishes the real heights of the pinned bars as CSS variables:
 *
 * - `--app-header-h`: the phone-width top bar (0 on a wide screen, where it is
 *   hidden and the menu is a sidebar instead);
 * - `--toolbar-h`: the editing screen's pinned toolbar, so the section list
 *   beside the form can stick just below it.
 *
 * They are measured rather than assumed because both change height for real
 * reasons (the window width, buttons wrapping onto a second row), and a wrong
 * guess slides one bar underneath another.
 */
export function HeaderOffset() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const header = document.querySelector<HTMLElement>('header.app-header');
    const toolbar = document.querySelector<HTMLElement>('.sticky-below-header');

    const apply = () => {
      root.style.setProperty(
        '--app-header-h',
        `${header ? Math.round(header.getBoundingClientRect().height) : 0}px`,
      );
      root.style.setProperty(
        '--toolbar-h',
        `${toolbar ? Math.round(toolbar.getBoundingClientRect().height) : 0}px`,
      );
    };

    apply();
    const observer = new ResizeObserver(apply);
    if (header) observer.observe(header);
    if (toolbar) observer.observe(toolbar);
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
