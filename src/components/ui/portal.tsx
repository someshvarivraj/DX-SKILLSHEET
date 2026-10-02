'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Render a dialog at the end of <body>, not where its button sits. A dialog
 * opened from inside a group chip (white-space: nowrap) or a category header
 * (<summary>) otherwise inherits their styles — text stopped wrapping and was
 * cut off — and a click inside it toggled the section behind it.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}
