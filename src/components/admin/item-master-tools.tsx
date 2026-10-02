'use client';

import { useEffect, useState, useTransition } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { Select } from '@/components/ui/select';
import {
  createSetAction,
  deleteCategoryAction,
  deleteGroupAction,
  deleteSubcategoryAction,
  saveCategoryAction,
  saveGroupAction,
  saveSubcategoryAction,
  type ActionResult,
} from '@/app/(app)/admin/items/actions';

function Dialog({
  title,
  busy,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  return (
    <div className="dialog-overlay" onClick={busy ? undefined : onClose}>
      <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('閉じる')} disabled={busy}>
            <X size={18} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  const t = useT();
  return error ? <p className="mt-3 border border-accent-500/35 bg-accent-50 px-3 py-2 text-xs text-[#b03a22]">{t(error)}</p> : null;
}

/**
 * Add or rename a category, a subcategory or a group — one small dialog, with
 * delete offered for an existing one (refused by the server when it is in use).
 */
export function NameEditButton({
  kind,
  id,
  parentId,
  nameJa = '',
  nameEn = '',
  maxEntries,
  isRepeating,
  label,
}: {
  kind: 'category' | 'subcategory' | 'group';
  id?: string;
  parentId?: string;
  nameJa?: string;
  nameEn?: string | null;
  maxEntries?: number;
  isRepeating?: boolean;
  label?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ja, setJa] = useState(nameJa);
  const [en, setEn] = useState(nameEn ?? '');
  const [repeat, setRepeat] = useState(Boolean(isRepeating));
  const [entries, setEntries] = useState(String(maxEntries ?? 10));

  const titles = {
    category: id ? 'カテゴリを編集' : 'カテゴリを追加',
    subcategory: id ? 'サブカテゴリを編集' : 'サブカテゴリを追加',
    group: id ? 'グループを編集' : 'グループを追加',
  };

  const finish = (r: ActionResult) => (r.ok ? setOpen(false) : setError(r.message));
  const save = () =>
    startTransition(async () => {
      setError(null);
      if (kind === 'category') finish(await saveCategoryAction({ id, nameJa: ja, nameEn: en }));
      else if (kind === 'group') finish(await saveGroupAction({ id, nameJa: ja, nameEn: en }));
      else
        finish(
          await saveSubcategoryAction({
            id,
            categoryId: parentId,
            nameJa: ja,
            nameEn: en,
            isRepeating: repeat,
            maxEntries: Number(entries) || 10,
          }),
        );
    });
  const remove = () =>
    startTransition(async () => {
      if (!id) return;
      setError(null);
      finish(
        kind === 'category'
          ? await deleteCategoryAction(id)
          : kind === 'group'
            ? await deleteGroupAction(id)
            : await deleteSubcategoryAction(id),
      );
    });

  return (
    <>
      {id ? (
        <button
          type="button"
          className="icon-btn im-inline-icon"
          onClick={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
          title={t(titles[kind])}
          aria-label={t(titles[kind])}
        >
          <Pencil size={13} aria-hidden />
        </button>
      ) : (
        <button type="button" className="im-add" onClick={() => setOpen(true)}>
          <Plus size={14} aria-hidden /> {label ?? t(titles[kind])}
        </button>
      )}
      {open ? (
        <Dialog title={t(titles[kind])} busy={pending} onClose={() => setOpen(false)}>
          <div className="im-form">
            <label>
              <span className="field-label">{t('名前（日本語）')}</span>
              <input className="input" value={ja} onChange={(e) => setJa(e.target.value)} autoFocus />
            </label>
            <label>
              <span className="field-label">{t('名前（英語）')}</span>
              <input className="input" value={en} onChange={(e) => setEn(e.target.value)} />
            </label>
            {kind === 'subcategory' ? (
              <>
                {!id ? (
                  <label className="flex items-center gap-2 text-sm text-ink-700">
                    <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
                    {t('繰り返し（インターン・プロジェクトのように、同じ設問に何件も答える）')}
                  </label>
                ) : null}
                {repeat ? (
                  <label>
                    <span className="field-label">{t('最大件数')}</span>
                    <input className="input w-24" inputMode="numeric" value={entries} onChange={(e) => setEntries(e.target.value)} />
                  </label>
                ) : null}
              </>
            ) : null}
            {kind === 'group' ? (
              <p className="text-xs text-ink-500">{t('グループは候補者の種類です（例：インド新卒、日本人新卒、ミャンマー）。年度は入れず、質問セットの名前に入れてください。')}</p>
            ) : null}
          </div>
          <ErrorLine error={error} />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              {id ? (
                <button type="button" className="btn btn-delete btn-sm" onClick={remove} disabled={pending}>
                  <Trash2 size={14} aria-hidden /> {t('削除')}
                </button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={pending}>
                {t('キャンセル')}
              </button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={pending}>
                {pending ? t('保存中…') : t('保存')}
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

/** A new question set: from a group (its items pre-ticked) or as a copy of a set. */
export function NewSetButton({
  groups,
  sets,
}: {
  groups: Array<{ id: string; name: string }>;
  sets: Array<{ id: string; name: string }>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [groupTypeId, setGroupTypeId] = useState(groups[0]?.id ?? '');
  const [copyFromId, setCopyFromId] = useState('');
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        <Plus size={14} aria-hidden /> {t('新しい質問セット')}
      </button>
      {open ? (
        <Dialog title={t('新しい質問セット')} busy={pending} onClose={() => setOpen(false)}>
          <div className="im-form">
            <label>
              <span className="field-label">{t('名前')}</span>
              <input className="input" placeholder={t('例：2027 インド新卒')} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </label>
            <div>
              <span className="field-label">{t('元にするもの')}</span>
              <Select
                value={copyFromId}
                onChange={setCopyFromId}
                searchFrom={1}
                ariaLabel={t('元にするもの')}
                options={[
                  { value: '', label: t('グループの設問から作る'), hint: t('そのグループの設問をすべて選んだ状態で作ります') },
                  ...sets.map((s) => ({ value: s.id, label: t('「{name}」をコピー', { name: s.name }), hint: t('設問・並び順・必須・表示条件をそのまま引き継ぎます') })),
                ]}
              />
            </div>
            {copyFromId ? null : (
              <div>
                <span className="field-label">{t('グループ')}</span>
                <Select
                  value={groupTypeId}
                  onChange={setGroupTypeId}
                  searchFrom={1}
                  ariaLabel={t('グループ')}
                  options={groups.map((g) => ({ value: g.id, label: g.name }))}
                />
              </div>
            )}
          </div>
          <ErrorLine error={error} />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={pending}>
              {t('キャンセル')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || !name.trim()}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const r = await createSetAction({ name, groupTypeId, copyFromId: copyFromId || null });
                  if (r.ok) setOpen(false);
                  else setError(r.message);
                })
              }
            >
              {pending ? t('作成中…') : t('作成する')}
            </button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
