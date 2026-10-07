'use client';

import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export type FloatingPlace = {
  top?: number;
  bottom?: number;
  left: number;
  width?: number;
  maxHeight: number;
};

/**
 * Where to draw a menu that opens from a button, in screen coordinates.
 *
 * Menus are drawn at the top level of the page (see Portal) with these fixed
 * coordinates. Drawn inside a card, a table or a dialog they were cut off by
 * its edge, or made the dialog scroll. The menu stays on screen: it opens
 * upwards when there is no room below, and lines up with the button's other
 * edge when it would run off the left or right side.
 *
 * align 'end' lines up right edges (a ⋯ button at the end of a row); 'start'
 * lines up left edges; matchWidth makes the menu as wide as the button
 * (a dropdown).
 */
export function useFloating(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  floatRef: RefObject<HTMLElement | null>,
  { align = 'start', matchWidth = false }: { align?: 'start' | 'end'; matchWidth?: boolean } = {},
): React.CSSProperties {
  const [place, setPlace] = useState<FloatingPlace | null>(null);

  const position = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    const float = floatRef.current;
    // Hidden until the menu itself can be measured.
    if (!anchor || !float) return false;
    const margin = 8;
    const vw = document.documentElement.clientWidth; // without the scrollbar
    const vh = document.documentElement.clientHeight;

    const width = Math.min(
      matchWidth ? anchor.width : float.offsetWidth,
      vw - margin * 2,
    );
    const fits = (x: number) => x >= margin && x + width <= vw - margin;
    const preferred = align === 'end' ? anchor.right - width : anchor.left;
    const other = align === 'end' ? anchor.left : anchor.right - width;
    const left = fits(preferred)
      ? preferred
      : fits(other)
        ? other
        : Math.min(Math.max(margin, preferred), vw - width - margin);

    const height = float.scrollHeight;
    const below = vh - anchor.bottom - margin - 4;
    const above = anchor.top - margin - 4;
    const up = height > below && above > below;
    setPlace({
      ...(up ? { bottom: vh - anchor.top + 4 } : { top: anchor.bottom + 4 }),
      left,
      width: matchWidth ? width : undefined,
      maxHeight: Math.max(120, up ? above : below),
    });
    return true;
  }, [anchorRef, floatRef, align, matchWidth]);

  // FloatingLayer draws the menu in the same render that opens it, so it can
  // be measured and placed before it is first painted.
  useLayoutEffect(() => {
    if (open) position();
    else setPlace(null);
  }, [open, position]);

  // The menu stays with its button while the page scrolls or resizes.
  useEffect(() => {
    if (!open) return;
    const follow = () => void position();
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
  }, [open, position]);

  return {
    position: 'fixed',
    zIndex: 70,
    right: 'auto',
    top: place?.top ?? 'auto',
    bottom: place?.bottom ?? 'auto',
    left: place?.left ?? 0,
    // Its own width, not squeezed by where it was placed before measuring.
    width: matchWidth ? place?.width : 'max-content',
    maxWidth: 'calc(100vw - 16px)',
    maxHeight: place?.maxHeight,
    visibility: place ? 'visible' : 'hidden',
  };
}

/**
 * Draw a menu at the end of <body>. Unlike Portal it renders at once: a menu
 * only exists after a click, never in the server's HTML, so there is nothing
 * to wait for — and useFloating needs it on the page to measure it.
 */
export function FloatingLayer({ children }: { children: React.ReactNode }) {
  return typeof document === 'undefined' ? null : createPortal(children, document.body);
}
