'use client';

import { useState, useTransition } from 'react';
import { addMemoAction } from '@/app/(app)/people/[personId]/actions';

export type MemoRow = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
};

/**
 * Notes about a person, for the supplementary document.
 *
 * The date is not a field on this form. Sano-san asked for it to be stamped
 * automatically when a memo is added, so it comes from the row's own createdAt
 * and there is nothing here to type, mistype or backdate. Notes are
 * append-only: a correction is a new note, which keeps the record of what was
 * known and when.
 */
export function MemoPanel({
  personId,
  memos,
}: {
  personId: string;
  memos: MemoRow[];
}) {
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!body.trim()) return;
    startTransition(async () => {
      const result = await addMemoAction(personId, body);
      setNotice(result.message ?? null);
      if (result.ok) setBody('');
    });
  };

  return (
    <div className="card px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-ink-900">営業メモ</h2>
        <span className="badge badge-warn" title="スキルシートには出力されない。">
          補足資料のみ
        </span>
        <span className="text-xs text-ink-500">
          日付は追加した時点で自動的に記録される。入力後の編集はできないため、訂正は新しいメモとして追加すること。
        </span>
      </div>

      <div className="mt-3">
        <label className="field-label" htmlFor="memo-body">
          メモを追加
        </label>
        <textarea
          id="memo-body"
          className="textarea"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="面談での様子、配属に関する検討事項など。スキルシートには出力されない。"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !body.trim()}
            onClick={submit}
            title="メモを追加する。追加した日付が自動的に記録される。"
          >
            メモを追加
          </button>
          {notice ? <span className="text-xs text-ink-700">{notice}</span> : null}
        </div>
      </div>

      {memos.length > 0 ? (
        <ul className="mt-4 space-y-2 border-t border-ink-100 pt-3">
          {memos.map((memo) => (
            <li key={memo.id} className="flex gap-3">
              <span className="tabular w-32 shrink-0 text-xs text-ink-500">
                {new Date(memo.createdAt).toLocaleDateString('ja-JP')}
                {memo.authorName ? (
                  <span className="block text-ink-400">{memo.authorName}</span>
                ) : null}
              </span>
              <span className="whitespace-pre-wrap text-sm text-ink-900">{memo.body}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-ink-500">
          メモはまだ登録されていない。
        </p>
      )}
    </div>
  );
}
