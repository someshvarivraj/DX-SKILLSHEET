'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { FloatingLayer, useFloating } from '@/components/ui/floating';
import { useT } from '@/lib/i18n/client';

/** A question a skill sheet field can be built from. */
export type PickableItem = {
  key: string;
  title: string;
  titleEn: string | null;
  category: string;
  groups: string[];
};

const Ctx = createContext<PickableItem[]>([]);

export function PickableItemsProvider({ items, children }: { items: PickableItem[]; children: React.ReactNode }) {
  return <Ctx.Provider value={items}>{children}</Ctx.Provider>;
}

export function usePickableItems() {
  return useContext(Ctx);
}

/** The questions a field reads, by name ("Full Name (English) + Katakana"). */
export function SourceNames({ codes }: { codes: string[] }) {
  const t = useT();
  const items = usePickableItems();
  if (codes.length === 0) return <>{t('取得元なし')}</>;
  return (
    <>
      {codes
        .map((code) => items.find((i) => i.key === code)?.title ?? t('（不明な設問）'))
        .join(' + ')}
    </>
  );
}

/**
 * Choose the questions a skill sheet field is built from — by name, searchable,
 * with the groups each question belongs to. A field may list several: each
 * candidate's sheet uses whichever their question set asked (e.g. 氏名 from the
 * English name for India and the kanji name for Japan).
 */
export function ItemPicker({ value, onChange }: { value: string[]; onChange: (codes: string[]) => void }) {
  const t = useT();
  const items = usePickableItems();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // Drawn at the top level: inside the definition table it was cut off.
  const popStyle = useFloating(open, addRef, popRef);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!rootRef.current?.contains(target) && !popRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => !value.includes(i.key))
      .filter(
        (i) =>
          !q ||
          i.title.toLowerCase().includes(q) ||
          (i.titleEn ?? '').toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          i.groups.some((g) => g.toLowerCase().includes(q)),
      )
      .slice(0, 60);
  }, [items, query, value]);

  return (
    <div className="ip" ref={rootRef}>
      <div className="ip-chips">
        {value.map((code) => {
          const item = items.find((i) => i.key === code);
          return (
            <span key={code} className="ip-chip">
              <span>
                {item ? item.title : t('（不明な設問）')}
                {item?.groups.length ? <span className="ip-chip-groups">{item.groups.join('・')}</span> : null}
              </span>
              <button
                type="button"
                className="ip-chip-x"
                aria-label={t('{name}を外す', { name: item?.title ?? code })}
                onClick={() => onChange(value.filter((c) => c !== code))}
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          );
        })}
        <button ref={addRef} type="button" className="im-add !mt-0" onClick={() => setOpen((o) => !o)}>
          <Plus size={14} aria-hidden /> {t('設問を選ぶ')}
        </button>
      </div>
      {open ? (
        <FloatingLayer>
          <div ref={popRef} className="ip-pop" style={popStyle}>
            <div className="ip-search">
              <Search size={14} aria-hidden />
              <input
                autoFocus
                className="ip-search-input"
                placeholder={t('設問名・カテゴリ・グループで検索')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <ul className="ip-list" role="listbox">
              {matches.length === 0 ? <li className="ip-empty">{t('該当する設問がありません')}</li> : null}
              {matches.map((i) => (
                <li key={i.key}>
                  <button
                    type="button"
                    className="ip-option"
                    onClick={() => {
                      onChange([...value, i.key]);
                      setQuery('');
                    }}
                  >
                    <span className="ip-option-title">{i.title}</span>
                    <span className="ip-option-sub">
                      {i.category}
                      {i.titleEn ? ` · ${i.titleEn}` : ''}
                      {i.groups.length ? ` · ${i.groups.join('・')}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </FloatingLayer>
      ) : null}
    </div>
  );
}
