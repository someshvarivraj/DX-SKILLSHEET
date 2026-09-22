'use client';

import { useEffect } from 'react';

/** Shared with the プレビュー link in `sheet-toolbar.tsx`, which writes this key. */
export function previewScrollKey(personId: string): string {
  return `sheet-scroll:${personId}`;
}

/**
 * Restores the scroll position saved just before leaving for the preview
 * screen. Sano-san's review (2026-09-22, item 7): "The preview button shows
 * the result, but closing it returns me to the very top of the editing
 * screen. I then have to scroll back down... Please make closing the preview
 * return to the position I was editing."
 *
 * This runs on every load of the editing screen, not only a return from the
 * preview, so it also covers the browser's own back button — not just the
 * 「編集に戻る」 link.
 */
export function ScrollRestore({ personId }: { personId: string }) {
  useEffect(() => {
    const key = previewScrollKey(personId);
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
    } catch {
      // Private browsing / storage disabled: fall back to the top of the page.
      return;
    }
    if (saved === null) return;
    const y = Number(saved);
    if (!Number.isFinite(y)) return;
    // Runs after the initial paint, so the page already has its real height.
    requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' }));
  }, [personId]);

  return null;
}
