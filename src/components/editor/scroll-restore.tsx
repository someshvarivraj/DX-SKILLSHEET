'use client';

import { useEffect } from 'react';

/**
 * Returning from the preview to the place that was being edited.
 *
 * Sano-san's review, 2026-09-22 item 7 and again 2026-09-23 item 5: closing
 * the preview returned her to the top of the editing screen.
 *
 * The first attempt saved `window.scrollY` and scrolled back to it. That could
 * not work once the sections became tabs: the editing screen always reopened
 * on the first tab, so the saved height belonged to a different, usually
 * shorter, page and the browser clamped it to the top. Two things are now kept
 * instead:
 *
 *  1. the open tab, in the URL (`?tab=`), so the screen reopens on the same
 *     section — also after the browser's own back button;
 *  2. which field was at the top of the screen and how far down it sat, so the
 *     screen is scrolled to that field rather than to a pixel height that
 *     depends on how long everything above it happens to be.
 */

type SavedPosition = {
  /** `id` of the field block that was at the top of the screen. */
  anchorId: string | null;
  /** Its distance from the top of the window when the preview was opened. */
  offset: number;
  /** Plain scroll height, used if the field can no longer be found. */
  y: number;
};

export function previewScrollKey(personId: string): string {
  return `sheet-scroll:${personId}`;
}

/** Lower edge of whatever is pinned to the top of the window (header, toolbar). */
export function pinnedHeight(): number {
  let bottom = 0;
  for (const el of document.querySelectorAll<HTMLElement>('header.app-header, .sticky-below-header')) {
    const style = getComputedStyle(el);
    if (style.position !== 'sticky' && style.position !== 'fixed') continue;
    bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
  }
  return bottom;
}

/** Called just before leaving for the preview. */
export function saveEditingPosition(personId: string) {
  const top = pinnedHeight();
  const anchors = [...document.querySelectorAll<HTMLElement>('[data-field-anchor]')];
  // The first field whose lower edge is still below the pinned bars is the one
  // the operator is looking at.
  const anchor = anchors.find((el) => el.getBoundingClientRect().bottom > top + 8) ?? null;
  const saved: SavedPosition = {
    anchorId: anchor?.id ?? null,
    offset: anchor ? anchor.getBoundingClientRect().top : 0,
    y: window.scrollY,
  };
  try {
    sessionStorage.setItem(previewScrollKey(personId), JSON.stringify(saved));
  } catch {
    // Storage disabled: the preview still opens, the return is just to the top.
  }
}

export function ScrollRestore({ personId }: { personId: string }) {
  useEffect(() => {
    const key = previewScrollKey(personId);
    let saved: SavedPosition | null = null;
    try {
      const raw = sessionStorage.getItem(key);
      saved = raw ? (JSON.parse(raw) as SavedPosition) : null;
    } catch {
      return;
    }
    if (!saved) return;
    const target = saved;

    // The saved position is removed only once it has been used, not when it is
    // read: React may run this effect, clean it up and run it again (it does
    // so on purpose in development), and a position removed on the first run
    // would be gone by the second.
    const done = () => {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // Nothing to clean up.
      }
    };

    // The field may not be on the page on the very first frame (the section
    // panel is a client component), so look for it for up to about a second.
    let frames = 0;
    let handle = 0;
    const attempt = () => {
      const el = target.anchorId ? document.getElementById(target.anchorId) : null;
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY - target.offset;
        window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
        done();
        return;
      }
      if (++frames < 60) {
        handle = requestAnimationFrame(attempt);
        return;
      }
      window.scrollTo({ top: target.y, behavior: 'auto' });
      done();
    };
    handle = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(handle);
  }, [personId]);

  return null;
}
