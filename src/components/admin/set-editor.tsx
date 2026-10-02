'use client';

import { Portal } from '@/components/ui/portal';
import type { QuestionSetStatus } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, GitBranch, Trash2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { Select } from '@/components/ui/select';
import {
  deleteSetAction,
  moveSetItemAction,
  setItemAskedAction,
  setItemConditionAction,
  setItemRequiredAction,
  updateSetAction,
  type ActionResult,
} from '@/app/(app)/admin/items/actions';

const STATUS: Array<{ value: QuestionSetStatus; label: string; hint: string }> = [
  { value: 'DRAFT', label: '準備中', hint: '候補者はまだ回答できません' },
  { value: 'OPEN', label: '受付中', hint: '候補者が個人リンクから回答できます' },
  { value: 'CLOSED', label: '締め切り', hint: '回答の受付を終了しました' },
];

function Notice({ result }: { result: ActionResult | null }) {
  const t = useT();
  if (!result) return null;
  return (
    <p className={`mt-2 text-xs ${result.ok ? 'text-final-ink' : 'text-[#b03a22]'}`} role="status">
      {t(result.message)}
    </p>
  );
}

export function SetSettings({
  set,
  groups,
}: {
  set: {
    id: string;
    name: string;
    groupTypeId: string;
    status: QuestionSetStatus;
    deadline: string | null;
    canDelete: boolean;
  };
  groups: Array<{ id: string; name: string }>;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [form, setForm] = useState({
    name: set.name,
    groupTypeId: set.groupTypeId,
    status: set.status,
    deadline: set.deadline ?? '',
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="card p-4">
      <div className="im-form-row im-form-row-4 !mt-0">
        <label>
          <span className="field-label">{t('名前')}</span>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <div>
          <span className="field-label">{t('グループ')}</span>
          <Select
            value={form.groupTypeId}
            onChange={(v) => setForm({ ...form, groupTypeId: v })}
            options={groups.map((g) => ({ value: g.id, label: g.name }))}
            searchFrom={1}
            ariaLabel={t('グループ')}
          />
        </div>
        <div>
          <span className="field-label">{t('受付の状態')}</span>
          <Select
            value={form.status}
            onChange={(v) => setForm({ ...form, status: v as QuestionSetStatus })}
            options={STATUS.map((s) => ({ value: s.value, label: t(s.label), hint: t(s.hint) }))}
            ariaLabel={t('受付の状態')}
          />
        </div>
        <label>
          <span className="field-label">{t('回答の締め切り')}</span>
          <input
            className="input"
            type="date"
            value={form.deadline}
            onChange={(e) => setForm({ ...form, deadline: e.target.value })}
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          {set.canDelete ? (
            confirmDelete ? (
              <span className="flex items-center gap-2 text-sm text-[#b03a22]">
                {t('この質問セットを削除しますか？')}
                <button
                  type="button"
                  className="btn btn-delete btn-sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await deleteSetAction(set.id);
                      if (r.ok) router.push('/admin/items');
                      else setResult(r);
                    })
                  }
                >
                  {t('削除する')}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete(false)}>
                  {t('キャンセル')}
                </button>
              </span>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} aria-hidden /> {t('質問セットを削除')}
              </button>
            )
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            startTransition(async () =>
              setResult(await updateSetAction(set.id, { ...form, deadline: form.deadline || null })),
            )
          }
        >
          {pending ? t('保存中…') : t('保存')}
        </button>
      </div>
      <Notice result={result} />
    </div>
  );
}

export type ConditionSource = { key: string; title: string; options: string[] };

export function SetItemRow({
  setId,
  item,
  conditionSources,
}: {
  setId: string;
  item: {
    id: string;
    key: string;
    title: string;
    titleEn: string | null;
    typeLabel: string;
    asked: boolean;
    required: boolean;
    showIf: { itemKey: string; anyOf: string[] } | null;
    ownWording: boolean;
    status: string;
  };
  conditionSources: ConditionSource[];
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const act = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const r = await fn();
      setError(r.ok ? null : r.message);
    });
  const condSource = item.showIf ? conditionSources.find((c) => c.key === item.showIf!.itemKey) : null;

  return (
    <li className={`im-item ${item.asked ? '' : 'im-item-off'}`}>
      <label className="im-ask">
        <input
          type="checkbox"
          checked={item.asked}
          disabled={pending || (item.status !== 'ACTIVE' && !item.asked)}
          onChange={(e) => act(() => setItemAskedAction(setId, item.id, e.target.checked))}
          aria-label={t('この設問を聞く')}
        />
      </label>
      <div className="im-item-title">
        <span>{item.title}</span>
        {item.titleEn ? <span className="im-item-en">{item.titleEn}</span> : null}
        {item.asked && item.showIf ? (
          <span className="im-cond">
            <GitBranch size={12} aria-hidden />
            {t('表示条件: {q} が {v} のとき', {
              q: condSource?.title ?? t('（削除された設問）'),
              v: item.showIf.anyOf.map((a) => a.split('／')[0]).join('・'),
            })}
          </span>
        ) : null}
        {error ? <span className="block text-xs text-[#b03a22]">{t(error)}</span> : null}
      </div>
      <div className="im-item-meta">
        <span className="im-type">{t(item.typeLabel)}</span>
        {item.ownWording ? <span className="im-type">{t('このセット独自の文言')}</span> : null}
        {item.asked ? (
          <>
            <label className="flex items-center gap-1 text-xs text-ink-700">
              <input
                type="checkbox"
                checked={item.required}
                disabled={pending}
                onChange={(e) => act(() => setItemRequiredAction(setId, item.id, e.target.checked))}
              />
              {t('必須')}
            </label>
            <button
              type="button"
              className="icon-btn im-inline-icon"
              title={t('表示条件')}
              aria-label={t('表示条件')}
              onClick={() => setEditing(true)}
            >
              <GitBranch size={14} aria-hidden />
            </button>
            <button
              type="button"
              className="icon-btn im-inline-icon"
              title={t('上へ')}
              aria-label={t('上へ')}
              disabled={pending}
              onClick={() => act(() => moveSetItemAction(setId, item.id, -1))}
            >
              <ArrowUp size={14} aria-hidden />
            </button>
            <button
              type="button"
              className="icon-btn im-inline-icon"
              title={t('下へ')}
              aria-label={t('下へ')}
              disabled={pending}
              onClick={() => act(() => moveSetItemAction(setId, item.id, 1))}
            >
              <ArrowDown size={14} aria-hidden />
            </button>
          </>
        ) : null}
      </div>
      {editing ? (
        <ConditionDialog
          sources={conditionSources.filter((c) => c.key !== item.key)}
          current={item.showIf}
          title={item.title}
          onClose={() => setEditing(false)}
          onSave={(showIf) =>
            startTransition(async () => {
              const r = await setItemConditionAction(setId, item.id, showIf);
              if (r.ok) setEditing(false);
              setError(r.ok ? null : r.message);
            })
          }
          pending={pending}
        />
      ) : null}
    </li>
  );
}

function ConditionDialog({
  sources,
  current,
  title,
  onClose,
  onSave,
  pending,
}: {
  sources: ConditionSource[];
  current: { itemKey: string; anyOf: string[] } | null;
  title: string;
  onClose: () => void;
  onSave: (showIf: { itemKey: string; anyOf: string[] } | null) => void;
  pending: boolean;
}) {
  const t = useT();
  const [key, setKey] = useState(current?.itemKey ?? '');
  const [anyOf, setAnyOf] = useState<string[]>(current?.anyOf ?? []);
  const source = sources.find((s) => s.key === key);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, pending]);
  return (
    <Portal>
      <div className="dialog-overlay" onClick={pending ? undefined : onClose}>
        <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink-900">{t('表示条件')}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label={t('閉じる')}>
              <X size={18} aria-hidden />
            </button>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {t('「{title}」を、次の回答のときだけ表示します。条件がなければ、いつも表示します。', { title })}
          </p>
          <div className="im-form">
            <div>
              <span className="field-label">{t('どの設問の回答で決めるか')}</span>
              <Select
                value={key}
                onChange={(v) => {
                  setKey(v);
                  setAnyOf([]);
                }}
                searchFrom={1}
                placeholder={t('設問を選ぶ（選択式の設問）')}
                options={sources.map((s) => ({ value: s.key, label: s.title }))}
                ariaLabel={t('どの設問の回答で決めるか')}
              />
            </div>
            {source ? (
              <div>
                <span className="field-label">{t('表示する回答（複数選べます）')}</span>
                <div className="grid gap-1">
                  {source.options.map((o) => (
                    <label key={o} className="flex items-center gap-2 text-sm text-ink-700">
                      <input
                        type="checkbox"
                        checked={anyOf.includes(o)}
                        onChange={(e) => setAnyOf(e.target.checked ? [...anyOf, o] : anyOf.filter((x) => x !== o))}
                      />
                      {o}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap justify-between gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={pending || !current}
              onClick={() => onSave(null)}
            >
              {t('条件をなくす')}
            </button>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
                {t('キャンセル')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || !key || anyOf.length === 0}
                onClick={() => onSave({ itemKey: key, anyOf })}
              >
                {t('保存')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
