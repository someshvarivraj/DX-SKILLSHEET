'use client';

import { useMemo, useState, useTransition } from 'react';
import type { GlossaryCategory } from '@prisma/client';
import {
  deleteGlossaryEntryAction,
  saveGlossaryEntryAction,
} from '@/app/(app)/admin/glossary/actions';
import { Select } from '@/components/ui/select';

export type GlossaryRow = {
  id: string;
  category: GlossaryCategory;
  english: string;
  aliases: string[];
  japanese: string;
  gloss: string | null;
  region: string | null;
  note: string | null;
};

const CATEGORIES: Array<{ value: GlossaryCategory; label: string }> = [
  { value: 'UNIVERSITY' as GlossaryCategory, label: '大学名' },
  { value: 'MAJOR' as GlossaryCategory, label: '専攻名' },
  { value: 'DEGREE' as GlossaryCategory, label: '学位' },
  { value: 'STATE' as GlossaryCategory, label: '州・地域区分' },
  { value: 'TECH_TERM' as GlossaryCategory, label: '技術用語' },
  { value: 'HIGH_SCHOOL' as GlossaryCategory, label: '高校名' },
  { value: 'OTHER' as GlossaryCategory, label: 'その他' },
];

export function GlossaryManager({ entries }: { entries: GlossaryRow[] }) {
  const [category, setCategory] = useState<GlossaryCategory>(
    'UNIVERSITY' as GlossaryCategory,
  );
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<GlossaryRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => e.category === category)
      .filter(
        (e) =>
          !q ||
          e.english.toLowerCase().includes(q) ||
          e.japanese.includes(q) ||
          e.aliases.some((a) => a.toLowerCase().includes(q)),
      );
  }, [entries, category, query]);

  const blank: GlossaryRow = {
    id: '',
    category,
    english: '',
    aliases: [],
    japanese: '',
    gloss: null,
    region: null,
    note: null,
  };

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <div className="w-56">
          <Select
            ariaLabel="分類で絞り込む"
            value={category}
            onChange={(v) => setCategory(v as GlossaryCategory)}
            options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
          />
        </div>
        <input
          className="input w-64"
          placeholder="検索（英語・日本語・別表記）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="text-xs text-ink-500">{filtered.length}件</span>
        <span className="flex-1" />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setEditing({ ...blank })}
        >
          ＋ 用語を追加
        </button>
      </div>

      {notice ? (
        <p className="rounded-md bg-final-bg px-3 py-1.5 text-xs text-final-ink">{notice}</p>
      ) : null}

      {editing ? (
        <div className="card space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="英語表記（正規）">
              <input
                className="input"
                value={editing.english}
                onChange={(e) => setEditing({ ...editing, english: e.target.value })}
              />
            </Field>
            <Field label="日本語表記">
              <input
                className="input"
                value={editing.japanese}
                onChange={(e) => setEditing({ ...editing, japanese: e.target.value })}
              />
            </Field>
            <Field label="分類">
              <Select
                ariaLabel="分類"
                value={editing.category}
                onChange={(v) =>
                  setEditing({ ...editing, category: v as GlossaryCategory })
                }
                options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
              />
            </Field>
            <Field label="別表記（; 区切り）">
              <input
                className="input"
                value={editing.aliases.join('; ')}
                onChange={(e) =>
                  setEditing({ ...editing, aliases: e.target.value.split(';').map((s) => s.trim()) })
                }
              />
            </Field>
            <Field label="初出時の補足説明">
              <input
                className="input"
                value={editing.gloss ?? ''}
                onChange={(e) => setEditing({ ...editing, gloss: e.target.value })}
              />
            </Field>
            <Field label="地域区分（州のみ）">
              <input
                className="input"
                value={editing.region ?? ''}
                onChange={(e) => setEditing({ ...editing, region: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await saveGlossaryEntryAction({
                    id: editing.id || undefined,
                    category: editing.category,
                    english: editing.english,
                    aliases: editing.aliases.join(';'),
                    japanese: editing.japanese,
                    gloss: editing.gloss ?? undefined,
                    region: editing.region ?? undefined,
                    note: editing.note ?? undefined,
                  });
                  setNotice(result.message ?? null);
                  if (result.ok) setEditing(null);
                })
              }
            >
              保存
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
              閉じる
            </button>
          </div>
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-sand-50 text-xs text-ink-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">英語表記</th>
              <th className="px-4 py-2 text-left font-medium">別表記</th>
              <th className="px-4 py-2 text-left font-medium">日本語表記</th>
              <th className="px-4 py-2 text-left font-medium">補足／地域</th>
              <th className="px-4 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {filtered.map((entry) => (
              <tr key={entry.id} className="hover:bg-sand-50">
                <td className="px-4 py-1.5">{entry.english}</td>
                <td className="px-4 py-1.5 text-xs text-ink-500">
                  {entry.aliases.join('; ')}
                </td>
                <td className="px-4 py-1.5">{entry.japanese}</td>
                <td className="px-4 py-1.5 text-xs text-ink-500">
                  {entry.gloss ?? entry.region ?? ''}
                </td>
                <td className="px-4 py-1.5 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setEditing(entry)}
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await deleteGlossaryEntryAction(entry.id);
                          setNotice(result.message ?? null);
                        })
                      }
                    >
                      無効化
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-700">{label}</label>
      {children}
    </div>
  );
}
