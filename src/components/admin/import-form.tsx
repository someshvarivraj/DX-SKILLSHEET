'use client';

import Link from 'next/link';
import { startTransition, useEffect, useRef, useState } from 'react';
import { useActionState } from 'react';
import {
  previewImportAction,
  runImportAction,
  type ImportActionState,
} from '@/app/(app)/admin/import/actions';
import { buildImportFormData } from '@/lib/import/form-data';

const initial: ImportActionState = { step: 'idle' };

/**
 * Import screen: choose a file, check it, then import it.
 *
 * The file is held in React state rather than read off the form at submit time.
 * A server action resets the form that submitted it, which clears an
 * `<input type="file">` — so after checking a file the operator was being asked
 * to choose it again before importing. Keeping the File here means it is chosen
 * once and survives the check.
 */
export function ImportForm() {
  const [previewState, previewAction, previewPending] = useActionState(
    previewImportAction,
    initial,
  );
  const [importState, importAction, importPending] = useActionState(
    runImportAction,
    initial,
  );

  const [file, setFile] = useState<File | null>(null);
  const [generate, setGenerate] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const preview = previewState.preview;
  const busy = previewPending || importPending;

  // A preview describes one particular file. If a different one is chosen
  // afterwards, what is on screen no longer describes what would be imported.
  const previewIsStale = Boolean(preview && file && preview.fileName !== file.name);

  // After a successful import the same file must not be sent again by accident.
  useEffect(() => {
    if (importState.step === 'done' && !importState.error) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [importState]);

  const submit = (action: (formData: FormData) => void) => {
    if (!file) return;
    // A useActionState dispatch has to be called inside a transition. Submitting
    // through a <form action> puts it in one automatically; dispatching by hand
    // from a click handler does not, and React warns that the action ran outside
    // an action context.
    startTransition(() => {
      action(buildImportFormData(file, generate));
    });
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="field-label" htmlFor="file">
              回答ファイル（CSV / XLSX）
            </label>
            <input
              id="file"
              ref={inputRef}
              name="file"
              type="file"
              accept=".csv,.xlsx,.xls"
              className="input w-auto"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-xs text-ink-700">
            <input
              type="checkbox"
              checked={generate}
              onChange={(e) => setGenerate(e.target.checked)}
            />
            新規の対象者は取り込み後にすべての項目を生成する
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || !file}
            title="ファイルの内容を読み取って、取り込まれる対象者と列の対応を表示する。この操作では何も保存されない。"
            onClick={() => submit(previewAction)}
          >
            {previewPending ? '確認中…' : '内容を確認する'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !file}
            title="ファイルの内容を取り込んで保存する。"
            onClick={() => submit(importAction)}
          >
            {importPending ? '取り込み中…' : '取り込む'}
          </button>
        </div>

        {/* The chosen file, named here rather than only inside the file control,
            because the control is cleared each time an action runs. */}
        <p className="field-hint mt-2">
          {file
            ? `選択中: ${file.name}（${Math.max(1, Math.round(file.size / 1024))} KB）`
            : 'ファイルを選択すると、確認と取り込みができるようになる。'}
        </p>

        {previewState.error ? (
          <p className="mt-3 rounded-lg border border-accent-500/35 bg-accent-50 px-3 py-2 text-xs text-[#b03a22]">
            {previewState.error}
          </p>
        ) : null}
        {importState.error ? (
          <p className="mt-3 rounded-lg border border-accent-500/35 bg-accent-50 px-3 py-2 text-xs text-[#b03a22]">
            {importState.error}
          </p>
        ) : null}
        {importState.message ? (
          <div className="mt-3 rounded-lg border border-final-line bg-final-bg px-3 py-2 text-xs text-final-ink">
            <p className="font-semibold">{importState.message}</p>
            {importState.needsReview && importState.needsReview.length > 0 ? (
              <div className="mt-2">
                <p className="font-medium">
                  すでに内容がある対象者です。差分を確認してください:
                </p>
                <ul className="mt-1 list-inside list-disc">
                  {importState.needsReview.map((p) => (
                    <li key={p.personId}>
                      <Link href={`/people/${p.personId}`} className="underline">
                        {p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Link href="/people" className="btn btn-secondary mt-2.5">
              対象者一覧を開く
            </Link>
          </div>
        ) : null}
      </div>

      {preview ? (
        <div className="space-y-3">
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-ink-900">
              確認結果: {preview.fileName}（{preview.totalRows}行）
            </h2>
            <p className="field-hint">
              この確認では何も保存されていない。内容に問題がなければ、下の「この内容で取り込む」を実行すること。
            </p>

            {preview.unmapped.length > 0 ? (
              <div className="mt-3 rounded-lg border border-draft-line bg-draft-bg p-3">
                <p className="text-xs font-medium text-draft-ink">
                  未割当の列（{preview.unmapped.length}件）
                </p>
                <p className="mt-1 text-xs text-draft-ink">
                  ファイルには存在するが、項目定義のどこにも割り当てられていない列です。
                  必要であれば「項目定義」画面で取得元に設定してください。
                </p>
                <ul className="mt-1.5 space-y-0.5 text-xs text-draft-ink">
                  {preview.unmapped.slice(0, 20).map((h, i) => (
                    <li key={i}>・{h}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-3 rounded-lg border border-final-line bg-final-bg p-3 text-xs text-final-ink">
                すべての列が設問と対応しました。
              </p>
            )}

            {preview.missingQuestions.length > 0 ? (
              <p className="mt-3 text-xs text-ink-500">
                ファイルに含まれていない設問: {preview.missingQuestions.length}件（
                {preview.missingQuestions.slice(0, 12).join('、')}
                {preview.missingQuestions.length > 12 ? ' …' : ''}）
              </p>
            ) : null}
          </div>

          <div className="card overflow-hidden">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>行</th>
                    <th>氏名</th>
                    <th>メールアドレス</th>
                    <th>回答項目数</th>
                    <th>扱い</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.index}>
                      <td className="tabular text-ink-500">{row.index + 1}</td>
                      <td>
                        {row.nameKatakana ?? row.nameEnglish ?? '—'}
                        {row.nameEnglish && row.nameKatakana ? (
                          <span className="ml-1 text-xs text-ink-400">{row.nameEnglish}</span>
                        ) : null}
                      </td>
                      <td className="text-ink-700">{row.email ?? '—'}</td>
                      <td className="tabular text-ink-700">{row.answerCount}</td>
                      <td>
                        {row.isNewPerson ? (
                          <span className="badge badge-final">新規</span>
                        ) : (
                          <span className="badge badge-review">既存・差分確認</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* The next step, at the end of what the operator has just read,
              rather than only back at the top of the screen. */}
          <div className="card flex flex-wrap items-center gap-3 p-4">
            {previewIsStale ? (
              <p className="text-xs text-[#b03a22]">
                選択中のファイル（{file?.name}）は、上の確認結果（{preview.fileName}）とは別のファイルである。もう一度「内容を確認する」を実行すること。
              </p>
            ) : (
              <p className="text-xs text-ink-700">
                上の{preview.totalRows}行を取り込む。既存の対象者の内容は自動では上書きされず、差分の確認対象になる。
              </p>
            )}
            <span className="flex-1" />
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !file || previewIsStale}
              onClick={() => submit(importAction)}
            >
              {importPending ? '取り込み中…' : 'この内容で取り込む'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
