'use client';

import { useEffect } from 'react';

/**
 * Publishes the sticky header's real height as `--app-header-h`.
 *
 * Anything else that sticks below the header (the sheet toolbar) needs to know
 * where the header ends. A hardcoded value is wrong the moment the header is
 * any other height than the one it was measured at — and it changes for real
 * reasons: the environment banner appears in development and disappears in
 * production, and the navigation wraps to a second row on a narrow window. When
 * the guess is too small the toolbar slides under the header and is cut in half.
 *
 * So it is measured rather than assumed, and re-measured whenever the header
 * resizes.
 */
export function HeaderOffset() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('header.app-header');
    if (!header) return;

    const apply = () => {
      document.documentElement.style.setProperty(
        '--app-header-h',
        `${Math.round(header.getBoundingClientRect().height)}px`,
      );
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return null;
}
