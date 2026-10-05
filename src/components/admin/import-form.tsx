'use client';

import Link from 'next/link';
import { startTransition, useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, UploadCloud, X } from 'lucide-react';
import { useActionState } from 'react';
import {
  previewImportAction,
  runImportAction,
  type ImportActionState,
} from '@/app/(app)/admin/import/actions';
import { buildImportFormData } from '@/lib/import/form-data';
import { refreshGenerationStatus } from '@/components/generation-progress';
import { MoraBot, MoraBotProgress } from '@/components/morabot';
import { useT } from '@/lib/i18n/client';

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
  const t = useT();
  const [previewState, previewAction, previewPending] = useActionState(
    previewImportAction,
    initial,
  );
  const [importState, importAction, importPending] = useActionState(runImportAction, initial);

  const [file, setFile] = useState<File | null>(null);
  const [generate, setGenerate] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // .csv/.xlsx/.xls by extension, since a dragged file's `type` is often empty
  // or inconsistent across OSes (Explorer, Finder, etc. all report it
  // differently, or not at all).
  const isAcceptedFile = (f: File) => /\.(csv|xlsx|xls)$/i.test(f.name);

  const chooseFile = (f: File | null) => {
    if (f && !isAcceptedFile(f)) {
      setDropError(t('CSVまたはXLSXファイルを選択してください。'));
      return;
    }
    setDropError(null);
    setFile(f);
  };

  const preview = previewState.preview;
  const busy = previewPending || importPending;

  // A preview describes one particular file. If a different one is chosen
  // afterwards, what is on screen no longer describes what would be imported.
  const previewIsStale = Boolean(preview && file && preview.fileName !== file.name);

  // After a successful import the same file must not be sent again by accident.
  useEffect(() => {
    if (importState.step === 'done' && !importState.error) {
      chooseFile(null);
      if (inputRef.current) inputRef.current.value = '';
      // Show the background AI work straight away rather than on the next tick.
      if (importState.generationQueued) refreshGenerationStatus();
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
        <div>
          <label className="field-label" htmlFor="file">
            {t('回答ファイル（CSV / XLSX）')}
          </label>
          <div
            className={`dropzone ${dragActive ? 'dropzone-active' : ''}`}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={0}
            aria-describedby="file-hint"
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              chooseFile(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            <input
              id="file"
              ref={inputRef}
              name="file"
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="dropzone-file">
                <FileSpreadsheet size={18} aria-hidden className="text-brand-500" />
                <span>
                  {file.name}（{Math.max(1, Math.round(file.size / 1024))} KB）
                </span>
                <button
                  type="button"
                  className="text-ink-400 hover:text-ink-700"
                  aria-label={t('選択を解除する')}
                  onClick={(e) => {
                    e.stopPropagation();
                    chooseFile(null);
                    if (inputRef.current) inputRef.current.value = '';
                  }}
                >
                  <X size={16} aria-hidden />
                </button>
              </div>
            ) : (
              <>
                <UploadCloud size={28} aria-hidden className="dropzone-icon" />
                <p className="dropzone-title">{t('ファイルをここにドラッグ、またはクリックして選択')}</p>
                <p className="dropzone-hint">{t('CSV または XLSX')}</p>
              </>
            )}
          </div>
          {dropError ? (
            <p className="field-hint text-[#b03a22]">{dropError}</p>
          ) : (
            <p id="file-hint" className="field-hint">
              {file ? null : t('ファイルを選択すると、確認と取り込みができるようになる。')}
            </p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 pb-2 text-xs text-ink-700">
            <input
              type="checkbox"
              checked={generate}
              onChange={(e) => setGenerate(e.target.checked)}
            />
            {t('新規の対象者は取り込み後にすべての項目を生成する')}
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || !file}
            title={t('ファイルの内容を読み取って、取り込まれる対象者と列の対応を表示する。この操作では何も保存されない。')}
            onClick={() => submit(previewAction)}
          >
            {previewPending ? t('確認中…') : t('内容を確認する')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !file}
            title={t('ファイルの内容を取り込んで保存する。')}
            onClick={() => submit(importAction)}
          >
            {importPending ? t('取り込み中…') : t('取り込む')}
          </button>
        </div>

        {previewPending || importPending ? (
          <div className="mt-4">
            <MoraBotProgress
              label={previewPending ? t('ファイルを読み込んでいます…') : t('取り込んでいます…')}
              detail={t('モラボットが作業中です')}
            />
          </div>
        ) : null}

        {[previewState.error, importState.error].filter(Boolean).map((error, i) => (
          <div
            key={i}
            className="mt-3 flex items-center gap-3 border border-accent-500/35 bg-accent-50 px-3 py-2 text-sm text-[#b03a22]"
            role="alert"
          >
            <MoraBot mood="trouble" size={44} title="" />
            <p>{t(error as string)}</p>
          </div>
        ))}
        {importState.message ? (
          <div className="mt-3 flex gap-3 border border-final-line bg-final-bg px-3 py-2.5 text-sm text-final-ink">
            <MoraBot mood="approved" size={56} title="" />
            <div className="min-w-0">
              <p className="font-medium">{t(importState.message)}</p>
              {importState.generationQueued ? (
                <p className="mt-1">
                  {t(
                    '新規の{n}名について、AIによる文章の作成を開始しました（1名あたり数分）。進捗は下と対象者一覧に表示されます。この画面を閉じても作成は続きます。',
                    { n: importState.generationQueued },
                  )}
                </p>
              ) : null}
              {importState.needsReview && importState.needsReview.length > 0 ? (
                <div className="mt-2">
                  <p className="font-medium">{t('すでに内容がある対象者です。差分を確認してください:')}</p>
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
                {t('対象者一覧を開く')}
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      {preview ? (
        <div className="space-y-3">
          <div className="card p-4">
            <h2 className="text-sm font-medium text-ink-900">
              {t('確認結果: {file}（{n}行）', { file: preview.fileName, n: preview.totalRows })}
            </h2>
            <p className="field-hint">
              {t('この確認では何も保存されていない。内容に問題がなければ、下の「この内容で取り込む」を実行すること。')}
            </p>

            {preview.unmapped.length > 0 ? (
              <div className="mt-3 border border-draft-line bg-draft-bg p-3">
                <p className="text-xs font-medium text-draft-ink">
                  {t('未割当の列（{n}件）', { n: preview.unmapped.length })}
                </p>
                <p className="mt-1 text-xs text-draft-ink">
                  {t(
                    'ファイルには存在するが、項目定義のどこにも割り当てられていない列です。必要であれば「項目定義」画面で取得元に設定してください。',
                  )}
                </p>
                <ul className="mt-1.5 space-y-0.5 text-xs text-draft-ink">
                  {preview.unmapped.slice(0, 20).map((h, i) => (
                    <li key={i}>・{h}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-3 border border-final-line bg-final-bg p-3 text-xs text-final-ink">
                {t('すべての列が設問と対応しました。')}
              </p>
            )}

            {preview.missingQuestions.length > 0 ? (
              <p className="mt-3 text-xs text-ink-500">
                {t('ファイルに含まれていない設問: {n}件', { n: preview.missingQuestions.length })}（
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
                    <th>{t('行')}</th>
                    <th>{t('氏名')}</th>
                    <th>{t('メールアドレス')}</th>
                    <th>{t('回答項目数')}</th>
                    <th>{t('扱い')}</th>
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
                          <span className="badge badge-final">{t('新規')}</span>
                        ) : (
                          <span className="badge badge-review">{t('既存・差分確認')}</span>
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
                {t(
                  '選択中のファイル（{a}）は、上の確認結果（{b}）とは別のファイルである。もう一度「内容を確認する」を実行すること。',
                  { a: file?.name ?? '', b: preview.fileName },
                )}
              </p>
            ) : (
              <p className="text-xs text-ink-700">
                {t(
                  '上の{n}行を取り込む。既存の対象者の内容は自動では上書きされず、差分の確認対象になる。',
                  { n: preview.totalRows },
                )}
              </p>
            )}
            <span className="flex-1" />
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !file || previewIsStale}
              onClick={() => submit(importAction)}
            >
              {importPending ? t('取り込み中…') : t('この内容で取り込む')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
