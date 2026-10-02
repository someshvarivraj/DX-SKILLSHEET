'use client';

import { Portal } from '@/components/ui/portal';
import type { ItemType } from '@prisma/client';
import { createContext, useContext, useEffect, useState, useTransition } from 'react';
import { EyeOff, Pencil, Plus, Replace, Trash2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { Select } from '@/components/ui/select';
import {
  deleteItemAction,
  replaceItemAction,
  saveItemAction,
  setItemHiddenAction,
} from '@/app/(app)/admin/items/actions';

export type EditableItem = {
  id: string;
  titleJa: string;
  titleEn: string | null;
  helpJa: string | null;
  helpEn: string | null;
  exampleJa: string | null;
  exampleEn: string | null;
  type: ItemType;
  options: string[];
  allowOther: boolean;
  gridRows: string[];
  gridColumns: string[];
  validation: { integer?: boolean; min?: number; max?: number; maxLength?: number } | null;
  groupTypeIds: string[];
  status: 'ACTIVE' | 'HIDDEN' | 'REPLACED';
  answerCount: number;
};

export const TYPE_OPTIONS: Array<{ value: ItemType; label: string }> = [
  { value: 'TEXT', label: '短文' },
  { value: 'PARAGRAPH', label: '長文' },
  { value: 'RADIO', label: '単一選択' },
  { value: 'LIST', label: 'プルダウン' },
  { value: 'CHECKBOX', label: '複数選択' },
  { value: 'DATE', label: '日付' },
  { value: 'GRID', label: '表形式' },
  { value: 'NUMBER', label: '数値' },
];

const CHOICE_TYPES: ItemType[] = ['RADIO', 'LIST', 'CHECKBOX'];

function useEscape(open: boolean, close: () => void, busy: boolean) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close, busy]);
}

type MasterContext = {
  groups: Array<{ id: string; name: string }>;
  /** Every active item, for "replace with" — sent once for the whole page. */
  items: Array<{ id: string; label: string }>;
};

const Ctx = createContext<MasterContext>({ groups: [], items: [] });

export function ItemMasterProvider({ value, children }: { value: MasterContext; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Edit an item, or add one to a subcategory (`item` omitted). */
export function ItemEditButton({ item, subcategoryId }: { item?: EditableItem; subcategoryId?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { groups, items } = useContext(Ctx);
  const replaceTargets = item ? items.filter((i) => i.id !== item.id) : [];
  return (
    <>
      {item ? (
        <button
          type="button"
          className="icon-btn"
          onClick={() => setOpen(true)}
          title={t('編集')}
          aria-label={t('編集')}
        >
          <Pencil size={15} aria-hidden />
        </button>
      ) : (
        <button type="button" className="im-add" onClick={() => setOpen(true)}>
          <Plus size={14} aria-hidden /> {t('設問を追加')}
        </button>
      )}
      {open ? (
        <ItemDialog
          item={item}
          subcategoryId={subcategoryId}
          groups={groups}
          replaceTargets={replaceTargets}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ItemDialog({
  item,
  subcategoryId,
  groups,
  replaceTargets,
  onClose,
}: {
  item?: EditableItem;
  subcategoryId?: string;
  groups: Array<{ id: string; name: string }>;
  replaceTargets: Array<{ id: string; label: string }>;
  onClose: () => void;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'replace' | 'delete'>('edit');
  const [replaceWith, setReplaceWith] = useState('');
  const [form, setForm] = useState({
    titleJa: item?.titleJa ?? '',
    titleEn: item?.titleEn ?? '',
    helpJa: item?.helpJa ?? '',
    helpEn: item?.helpEn ?? '',
    exampleJa: item?.exampleJa ?? '',
    exampleEn: item?.exampleEn ?? '',
    type: (item?.type ?? 'TEXT') as ItemType,
    options: (item?.options ?? []).join('\n'),
    allowOther: item?.allowOther ?? false,
    gridRows: (item?.gridRows ?? []).join('\n'),
    gridColumns: (item?.gridColumns ?? []).join('\n'),
    integer: item?.validation?.integer ?? false,
    min: item?.validation?.min?.toString() ?? '',
    max: item?.validation?.max?.toString() ?? '',
    maxLength: item?.validation?.maxLength?.toString() ?? '',
    groupTypeIds: item?.groupTypeIds ?? groups.map((g) => g.id).slice(0, 1),
  });
  useEscape(true, onClose, pending);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const num = (s: string) => (s.trim() === '' ? null : Number(s));

  const done = (r: { ok: boolean; message: string }) => {
    if (r.ok) onClose();
    else setError(r.message);
  };

  const save = () =>
    startTransition(async () => {
      setError(null);
      done(
        await saveItemAction({
          itemId: item?.id,
          subcategoryId,
          data: {
            titleJa: form.titleJa,
            titleEn: form.titleEn,
            helpJa: form.helpJa,
            helpEn: form.helpEn,
            exampleJa: form.exampleJa,
            exampleEn: form.exampleEn,
            type: form.type,
            options: form.options.split('\n'),
            allowOther: form.allowOther,
            gridRows: form.gridRows.split('\n'),
            gridColumns: form.gridColumns.split('\n'),
            validation: {
              integer: form.integer,
              min: num(form.min),
              max: num(form.max),
              maxLength: num(form.maxLength),
            },
            groupTypeIds: form.groupTypeIds,
          },
        }),
      );
    });

  const isChoice = CHOICE_TYPES.includes(form.type);
  const isText = form.type === 'TEXT' || form.type === 'PARAGRAPH';
  const isNumber = form.type === 'NUMBER' || form.type === 'TEXT';

  return (
    <Portal>
      <div className="dialog-overlay" onClick={pending ? undefined : onClose}>
        <div className="dialog im-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink-900">{item ? t('設問を編集') : t('設問を追加')}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label={t('閉じる')} disabled={pending}>
              <X size={18} aria-hidden />
            </button>
          </div>
          {item && item.answerCount > 0 ? (
            <p className="mt-1 text-xs text-ink-500">
              {t('この設問には回答が{n}件あります。文言を直しても、保存されている回答は変わりません。', {
                n: item.answerCount,
              })}
            </p>
          ) : null}

          {mode === 'edit' ? (
            <div className="im-form">
              <div className="im-form-row">
                <label>
                  <span className="field-label">{t('設問（日本語）')}</span>
                  <input className="input" value={form.titleJa} onChange={(e) => set('titleJa', e.target.value)} />
                </label>
                <label>
                  <span className="field-label">{t('設問（英語）')}</span>
                  <input className="input" value={form.titleEn} onChange={(e) => set('titleEn', e.target.value)} />
                </label>
              </div>
              <div>
                <span className="field-label">{t('回答の種類')}</span>
                <Select
                  value={form.type}
                  onChange={(v) => set('type', v as ItemType)}
                  options={TYPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
                  ariaLabel={t('回答の種類')}
                />
              </div>
              {isChoice ? (
                <div>
                  <span className="field-label">
                    {t('選択肢（1行に1つ。「日本語／English」の形で書くと両方表示します）')}
                  </span>
                  <textarea
                    className="input im-textarea"
                    rows={6}
                    value={form.options}
                    onChange={(e) => set('options', e.target.value)}
                  />
                  <label className="mt-1 flex items-center gap-2 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      checked={form.allowOther}
                      onChange={(e) => set('allowOther', e.target.checked)}
                    />
                    {t('「その他」の自由記入を付ける')}
                  </label>
                </div>
              ) : null}
              {form.type === 'GRID' ? (
                <div className="im-form-row">
                  <label>
                    <span className="field-label">{t('行（1行に1つ）')}</span>
                    <textarea
                      className="input im-textarea"
                      rows={5}
                      value={form.gridRows}
                      onChange={(e) => set('gridRows', e.target.value)}
                    />
                  </label>
                  <label>
                    <span className="field-label">{t('列（1行に1つ）')}</span>
                    <textarea
                      className="input im-textarea"
                      rows={5}
                      value={form.gridColumns}
                      onChange={(e) => set('gridColumns', e.target.value)}
                    />
                  </label>
                </div>
              ) : null}
              {isNumber || isText ? (
                <div className="im-form-row im-form-row-4">
                  {isNumber ? (
                    <>
                      <label className="flex items-center gap-2 text-sm text-ink-700">
                        <input
                          type="checkbox"
                          checked={form.integer}
                          onChange={(e) => set('integer', e.target.checked)}
                        />
                        {t('整数のみ')}
                      </label>
                      <label>
                        <span className="field-label">{t('最小値')}</span>
                        <input
                          className="input"
                          inputMode="numeric"
                          value={form.min}
                          onChange={(e) => set('min', e.target.value)}
                        />
                      </label>
                      <label>
                        <span className="field-label">{t('最大値')}</span>
                        <input
                          className="input"
                          inputMode="numeric"
                          value={form.max}
                          onChange={(e) => set('max', e.target.value)}
                        />
                      </label>
                    </>
                  ) : null}
                  {isText ? (
                    <label>
                      <span className="field-label">{t('最大文字数')}</span>
                      <input
                        className="input"
                        inputMode="numeric"
                        value={form.maxLength}
                        onChange={(e) => set('maxLength', e.target.value)}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
              <div className="im-form-row">
                <label>
                  <span className="field-label">{t('説明（日本語）')}</span>
                  <textarea
                    className="input im-textarea"
                    rows={3}
                    value={form.helpJa}
                    onChange={(e) => set('helpJa', e.target.value)}
                  />
                </label>
                <label>
                  <span className="field-label">{t('説明（英語）')}</span>
                  <textarea
                    className="input im-textarea"
                    rows={3}
                    value={form.helpEn}
                    onChange={(e) => set('helpEn', e.target.value)}
                  />
                </label>
              </div>
              <div className="im-form-row">
                <label>
                  <span className="field-label">{t('記入例（日本語）')}</span>
                  <textarea
                    className="input im-textarea"
                    rows={3}
                    value={form.exampleJa}
                    onChange={(e) => set('exampleJa', e.target.value)}
                  />
                </label>
                <label>
                  <span className="field-label">{t('記入例（英語）')}</span>
                  <textarea
                    className="input im-textarea"
                    rows={3}
                    value={form.exampleEn}
                    onChange={(e) => set('exampleEn', e.target.value)}
                  />
                </label>
              </div>
              <div>
                <span className="field-label">{t('この設問を使うグループ（複数選べます）')}</span>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {groups.map((g) => (
                    <label key={g.id} className="flex items-center gap-1.5 text-sm text-ink-700">
                      <input
                        type="checkbox"
                        checked={form.groupTypeIds.includes(g.id)}
                        onChange={(e) =>
                          set(
                            'groupTypeIds',
                            e.target.checked
                              ? [...form.groupTypeIds, g.id]
                              : form.groupTypeIds.filter((x) => x !== g.id),
                          )
                        }
                      />
                      {g.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {mode === 'replace' && item ? (
            <div className="im-form">
              <p className="text-sm text-ink-700">
                {t(
                  'この設問の回答（{n}件）を、選んだ設問に移します。この設問は「置き換え済み」になり、質問セットとスキルシートの項目も新しい設問を使うようになります。',
                  { n: item.answerCount },
                )}
              </p>
              <Select
                value={replaceWith}
                onChange={setReplaceWith}
                options={replaceTargets.map((r) => ({ value: r.id, label: r.label }))}
                placeholder={t('置き換え先の設問を選ぶ')}
                searchFrom={1}
                ariaLabel={t('置き換え先の設問')}
              />
            </div>
          ) : null}

          {mode === 'delete' && item ? (
            <p className="im-form text-sm text-ink-700">
              {t('この設問を削除します。回答のない設問なので、過去のスキルシートには影響しません。元には戻せません。')}
            </p>
          ) : null}

          {error ? (
            <p className="mt-3 border border-accent-500/35 bg-accent-50 px-3 py-2 text-xs text-[#b03a22]">{t(error)}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {item && mode === 'edit' ? (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => done(await setItemHiddenAction(item.id, item.status === 'ACTIVE')))
                    }
                  >
                    <EyeOff size={14} aria-hidden /> {item.status === 'ACTIVE' ? t('非表示にする') : t('表示に戻す')}
                  </button>
                  {item.answerCount > 0 ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={pending}
                      onClick={() => setMode('replace')}
                    >
                      <Replace size={14} aria-hidden /> {t('別の設問に置き換える')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-delete btn-sm"
                      disabled={pending}
                      onClick={() => setMode('delete')}
                    >
                      <Trash2 size={14} aria-hidden /> {t('削除')}
                    </button>
                  )}
                </>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={pending}
                onClick={mode === 'edit' ? onClose : () => setMode('edit')}
              >
                {mode === 'edit' ? t('キャンセル') : t('戻る')}
              </button>
              {mode === 'edit' ? (
                <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>
                  {pending ? t('保存中…') : t('保存')}
                </button>
              ) : mode === 'replace' && item ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={pending || !replaceWith}
                  onClick={() => startTransition(async () => done(await replaceItemAction(item.id, replaceWith)))}
                >
                  {t('置き換える')}
                </button>
              ) : item ? (
                <button
                  type="button"
                  className="btn btn-delete"
                  disabled={pending}
                  onClick={() => startTransition(async () => done(await deleteItemAction(item.id)))}
                >
                  {t('削除する')}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
