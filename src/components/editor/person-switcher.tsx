'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, List } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

/**
 * Move to another person straight from the editing screen — the list, the
 * previous or next person, or anyone from the drop-down — instead of going
 * back through the menu each time (Sano-san, 2026-10-13). The open section
 * (?tab=) is kept, so checking the same section for everyone is quick.
 */
export function PersonSwitcher({
  currentId,
  people,
}: {
  currentId: string;
  people: Array<{ id: string; label: string }>;
}) {
  const t = useT();
  const router = useRouter();
  const index = people.findIndex((p) => p.id === currentId);
  const prev = index > 0 ? people[index - 1] : null;
  const next = index >= 0 && index < people.length - 1 ? people[index + 1] : null;

  const go = (id: string) => {
    const tab = new URL(window.location.href).searchParams.get('tab');
    router.push(`/people/${id}${tab ? `?tab=${encodeURIComponent(tab)}` : ''}`);
  };

  return (
    <nav className="person-switcher" aria-label={t('対象者の切り替え')}>
      <Link href="/people" className="btn btn-quiet btn-sm">
        <List size={14} aria-hidden /> {t('対象者一覧')}
      </Link>
      <span className="flex-1" />
      <button
        type="button"
        className="btn btn-quiet btn-sm"
        disabled={!prev}
        onClick={() => prev && go(prev.id)}
        title={prev?.label}
      >
        <ChevronLeft size={14} aria-hidden /> {t('前の人')}
      </button>
      <select
        className="input person-switcher-select"
        aria-label={t('他の人を開く')}
        value={currentId}
        onChange={(e) => go(e.target.value)}
      >
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-quiet btn-sm"
        disabled={!next}
        onClick={() => next && go(next.id)}
        title={next?.label}
      >
        {t('次の人')} <ChevronRight size={14} aria-hidden />
      </button>
    </nav>
  );
}
