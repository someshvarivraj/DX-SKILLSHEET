'use client';

import { useEffect, useState, useTransition } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { Select } from '@/components/ui/select';
import { GsUpload } from './gs-upload';
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
  wide = false,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
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
      <div className={`dialog ${wide ? 'im-dialog' : ''}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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

/**
 * 「質問セットを作る」 — the one way to start a questionnaire (2026-10-07: three
 * separate controls for the .gs, new sets and groups confused everyone).
 *
 *   1. Who is it for?   an existing group, or type a new one (created here)
 *   2. Start from what? a copy of an earlier set / a .gs script / the group's questions
 *   3. Name             suggested as "<year> <group>"
 */
export function CreateSetButton({
  groups,
  sets,
}: {
  groups: Array<{ id: string; name: string }>;
  sets: Array<{ id: string; name: string; groupTypeId: string }>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '__new');
  const [newGroup, setNewGroup] = useState('');
  const [source, setSource] = useState<'copy' | 'gs' | 'group'>(sets.length > 0 ? 'copy' : 'gs');
  const [copyFrom, setCopyFrom] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [gsStep, setGsStep] = useState(false);

  const groupName = groupId === '__new' ? newGroup.trim() : (groups.find((g) => g.id === groupId)?.name ?? '');
  const year = new Date().getFullYear() + 1;
  const suggested = groupName ? `${year} ${groupName}` : '';
  const finalName = nameTouched ? name : suggested;
  // The group's own sets first: copying last year's Myanmar set is the usual case.
  const copyOptions = [...sets].sort((a, b) => Number(b.groupTypeId === groupId) - Number(a.groupTypeId === groupId));

  const close = () => {
    setOpen(false);
    setGsStep(false);
    setError(null);
  };

  const create = () =>
    startTransition(async () => {
      setError(null);
      const r = await createSetAction({
        name: finalName,
        groupTypeId: groupId === '__new' ? null : groupId,
        newGroupName: groupId === '__new' ? newGroup : null,
        copyFromId: source === 'copy' ? copyFrom || null : null,
      });
      if (r.ok) close();
      else setError(r.message);
    });

  const ready = Boolean(groupName && finalName.trim() && (source !== 'copy' || copyFrom));

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden /> {t('質問セットを作る')}
      </button>
      {open ? (
        <Dialog title={t('質問セットを作る')} busy={pending} onClose={close} wide>
          {gsStep ? (
            <GsUpload
              groupTypes={groups.map((g) => ({ id: g.id, nameJa: g.name }))}
              preset={{
                groupTypeId: groupId,
                newGroupName: groupId === '__new' ? newGroup : '',
                setName: finalName,
                onClose: close,
              }}
            />
          ) : (
            <div className="im-wizard">
              <div className="im-wizard-step">
                <span className="im-wizard-no">1</span>
                <div className="min-w-0 flex-1">
                  <p className="im-wizard-q">{t('誰に聞きますか？（グループ）')}</p>
                  <Select
                    value={groupId}
                    onChange={setGroupId}
                    searchFrom={1}
                    ariaLabel={t('グループ')}
                    options={[
                      ...groups.map((g) => ({ value: g.id, label: g.name })),
                      { value: '__new', label: t('新しいグループ…'), hint: t('一覧にない候補者の種類を追加します') },
                    ]}
                  />
                  {groupId === '__new' ? (
                    <input
                      className="input mt-2"
                      placeholder={t('例：ミャンマー、日本人新卒')}
                      value={newGroup}
                      onChange={(e) => setNewGroup(e.target.value)}
                      autoFocus
                    />
                  ) : null}
                  <p className="im-wizard-hint">{t('グループは「誰に聞くか」です（インド新卒、ミャンマー、日本人新卒など）。年度は入れません。')}</p>
                </div>
              </div>

              <div className="im-wizard-step">
                <span className="im-wizard-no">2</span>
                <div className="min-w-0 flex-1">
                  <p className="im-wizard-q">{t('何から作りますか？')}</p>
                  <div className="grid gap-1.5">
                    {sets.length > 0 ? (
                      <label className="im-choice">
                        <input type="radio" checked={source === 'copy'} onChange={() => setSource('copy')} />
                        <span>
                          {t('前の質問セットをコピーする')}
                          <span className="im-wizard-hint">{t('いちばん簡単です。去年のセットをコピーして、変わった所だけ直します。')}</span>
                        </span>
                      </label>
                    ) : null}
                    {source === 'copy' ? (
                      <div className="ml-6">
                        <Select
                          value={copyFrom}
                          onChange={setCopyFrom}
                          searchFrom={1}
                          placeholder={t('コピーする質問セットを選ぶ')}
                          ariaLabel={t('コピーする質問セット')}
                          options={copyOptions.map((s) => ({ value: s.id, label: s.name }))}
                        />
                      </div>
                    ) : null}
                    <label className="im-choice">
                      <input type="radio" checked={source === 'gs'} onChange={() => setSource('gs')} />
                      <span>
                        {t('Googleフォームのスクリプト（.gs）から')}
                        <span className="im-wizard-hint">{t('AIなどで作った .gs ファイルを読み込みます。')}</span>
                      </span>
                    </label>
                    <label className="im-choice">
                      <input type="radio" checked={source === 'group'} onChange={() => setSource('group')} />
                      <span>
                        {t('このグループの設問をすべて使う')}
                        <span className="im-wizard-hint">{t('設問マスタで、このグループに付いている設問を全部選んだ状態で作ります。')}</span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="im-wizard-step">
                <span className="im-wizard-no">3</span>
                <div className="min-w-0 flex-1">
                  <p className="im-wizard-q">{t('名前')}</p>
                  <input
                    className="input"
                    value={finalName}
                    placeholder={t('例：2027 ミャンマー')}
                    onChange={(e) => {
                      setNameTouched(true);
                      setName(e.target.value);
                    }}
                  />
                </div>
              </div>

              <ErrorLine error={error} />
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={close} disabled={pending}>
                  {t('キャンセル')}
                </button>
                {source === 'gs' ? (
                  <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => setGsStep(true)}>
                    {t('次へ（.gs を選ぶ）')}
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" disabled={pending || !ready} onClick={create}>
                    {pending ? t('作成中…') : t('作成する')}
                  </button>
                )}
              </div>
            </div>
          )}
        </Dialog>
      ) : null}
    </>
  );
}
