'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ChevronDown } from 'lucide-react';
import { FloatingLayer, useFloating } from '@/components/ui/floating';
import { BASE_PATH } from '@/lib/base-path';
import { LANG_COOKIE, type Lang } from '@/lib/i18n';
import { useLang } from '@/lib/i18n/client';

const OPTIONS: Array<{ lang: Lang; label: string }> = [
  { lang: 'ja', label: '日本語' },
  { lang: 'en', label: 'English' },
];

/**
 * 🇯🇵 日本語 / 🇬🇧 English. The choice is a cookie, so it is remembered in this
 * browser and every screen — server-rendered ones included — follows it.
 * Flags are drawn, not emoji: Windows shows flag emoji as the letters "JP".
 */
export function LanguageSwitcher({
  compact = false,
  direction = 'up',
}: {
  compact?: boolean;
  /** Where the button sits: the menu's foot ('up') or a top bar ('down'). The
   *  list opens wherever there is room. */
  direction?: 'up' | 'down';
}) {
  const lang = useLang();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  // Drawn at the top level: beside the folded menu it was cut off.
  const menuStyle = useFloating(open, rootRef, menuRef, { align: direction === 'down' ? 'end' : 'start' });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      const outside = (node: Node) => !rootRef.current?.contains(node) && !menuRef.current?.contains(node);
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : outside(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const choose = (next: Lang) => {
    setOpen(false);
    if (next === lang) return;
    document.cookie = `${LANG_COOKIE}=${next}; path=${BASE_PATH || '/'}; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  };

  const current = OPTIONS.find((o) => o.lang === lang) ?? OPTIONS[0]!;

  return (
    <div className="menu-root" ref={rootRef}>
      <button
        type="button"
        className={`lang-switch ${compact ? 'lang-switch-compact' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={lang === 'en' ? 'Language' : '表示言語'}
        title={compact ? current.label : undefined}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
      >
        <Flag lang={current.lang} />
        {compact ? null : <span>{current.label}</span>}
        {compact ? null : <ChevronDown size={16} aria-hidden className="text-ink-400" />}
      </button>
      {open ? (
        <FloatingLayer>
          <ul
            ref={menuRef}
            style={menuStyle}
            className="menu lang-menu"
            role="listbox"
            aria-label="Language"
          >
            {OPTIONS.map((o) => (
              <li key={o.lang}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.lang === lang}
                  className="menu-item"
                  onClick={() => choose(o.lang)}
                >
                  <Flag lang={o.lang} />
                  {o.label}
                  {o.lang === lang ? <span className="ml-auto text-brand-500">✓</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </FloatingLayer>
      ) : null}
    </div>
  );
}

function Flag({ lang }: { lang: Lang }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="flag">
      <defs>
        <clipPath id={`flag-${lang}`}>
          <circle cx="10" cy="10" r="10" />
        </clipPath>
      </defs>
      {lang === 'ja' ? (
        <g clipPath={`url(#flag-${lang})`}>
          <rect width="20" height="20" fill="#fff" />
          <circle cx="10" cy="10" r="5" fill="#BC002D" />
        </g>
      ) : (
        <g clipPath={`url(#flag-${lang})`}>
          <rect width="20" height="20" fill="#012169" />
          <path d="M0 0L20 20M20 0L0 20" stroke="#fff" strokeWidth="4" />
          <path d="M0 0L20 20M20 0L0 20" stroke="#C8102E" strokeWidth="1.6" />
          <path d="M10 0V20M0 10H20" stroke="#fff" strokeWidth="6" />
          <path d="M10 0V20M0 10H20" stroke="#C8102E" strokeWidth="3.4" />
        </g>
      )}
      <circle cx="10" cy="10" r="9.5" fill="none" stroke="rgba(0,0,0,0.12)" />
    </svg>
  );
}
