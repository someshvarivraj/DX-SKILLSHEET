'use client';

import { FileCode2, UploadCloud, X } from 'lucide-react';
import { startTransition, useRef, useState } from 'react';
import { useActionState } from 'react';
import {
  importFormScriptAction,
  previewFormScriptAction,
  type FormImportState,
} from '@/app/(app)/admin/fields/form-import-actions';

const initial: FormImportState = { step: 'idle' };

/**
 * Loads a Google Apps Script form definition (create_iit_form_YYYY.gs)
 * straight into the database, in place of `npm run form:parse` +
 * `npm run db:seed` (docs/QUESTION-CODES.md §"How the yearly form change is
 * absorbed"). Sano-san's review (2026-09-29): a new form year should not need
 * someone who can run a command — this only asks for the file.
 *
 * Deliberately stops at the question catalogue. Mapping a question onto a
 * section and field is still a manual, reviewed step on this same screen —
 * newly imported questions with nothing assigned appear in the existing
 * 「未割当の設問」panel, exactly as they do today.
 */
export function FormScriptImport() {
  const [previewState, previewAction, previewPending] = useActionState(
    previewFormScriptAction,
    initial,
  );
  const [importState, importAction, importPending] = useActionState(
    importFormScriptAction,
    initial,
  );
  const [file, setFile] = useState<File | null>(null);
  const [revisionCode, setRevisionCode] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [open, setOpen] = useState(false);
  // Which action last ran, so an error is shown from the right one — both
  // actions share the same {step:'idle', error} shape on failure, so state
  // alone cannot tell them apart.
  const [lastAction, setLastAction] = useState<'preview' | 'import' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = previewPending || importPending;
  const preview = previewState.step === 'preview' ? previewState : null;
  const error = lastAction === 'import' ? importState.error : previewState.error;
  // A preview describes one particular file; picking a different one after
  // checking it invalidates what is on screen, same reasoning as the CSV
  // importer above.
  const previewIsStale = Boolean(preview && file && preview.catalogue?.sourceFile !== file.name);

  const chooseFile = (f: File | null) => {
    setFile(f);
  };

  const submit = (kind: 'preview' | 'import', action: (formData: FormData) => void) => {
    if (!file) return;
    setLastAction(kind);
    const data = new FormData();
    data.set('file', file);
    data.set('revisionCode', revisionCode.trim());
    startTransition(() => action(data));
  };

  if (!open) {
    return (
      <button type="button" className="def-add" onClick={() => setOpen(true)}>
        <FileCode2 size={16} aria-hidden /> Googleフォームのスクリプトを取り込む
      </button>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">
            Googleフォームのスクリプトを取り込む
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-500">
            来年フォームが変わったときの、開発者を介さない取り込み方。
            <code className="mx-1">create_iit_form_2027.gs</code>
            のような、そのフォームを組み立てるApps Scriptファイルを選択する
            （回答をエクスポートしたファイルではない）。設問の一覧だけが取り込まれ、
            どのセクション・項目に割り当てるかはこれまでどおり項目定義から行う。
          </p>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setOpen(false)}
          aria-label="閉じる"
          title="閉じる"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1">
          <label className="field-label" htmlFor="gs-file">
            フォームのスクリプト（.gs）
          </label>
          <div
            className={`dropzone ${dragActive ? 'dropzone-active' : ''}`}
            style={{ minHeight: 88 }}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={0}
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
              id="gs-file"
              ref={inputRef}
              type="file"
              accept=".gs,text/plain"
              className="sr-only"
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="dropzone-file">
                <FileCode2 size={18} aria-hidden className="text-brand-500" />
                <span>{file.name}</span>
                <button
                  type="button"
                  className="text-ink-400 hover:text-ink-700"
                  aria-label="選択を解除する"
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
                <UploadCloud size={24} aria-hidden className="dropzone-icon" />
                <p className="dropzone-title">ドラッグ、またはクリックして選択</p>
                <p className="dropzone-hint">.gs ファイル</p>
              </>
            )}
          </div>
        </div>
        <div className="w-32">
          <label className="field-label" htmlFor="revision-code">
            年度（任意）
          </label>
          <input
            id="revision-code"
            className="input"
            placeholder="例：2027"
            value={revisionCode}
            onChange={(e) => setRevisionCode(e.target.value)}
          />
          <p className="field-hint">空欄ならファイル名から自動判定する。</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !file}
          onClick={() => submit('preview', previewAction)}
        >
          {previewPending ? '確認中…' : '内容を確認する'}
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-accent-500/35 bg-accent-50 px-3 py-2 text-xs text-[#b03a22]">
          {error}
        </p>
      ) : null}

      {importState.step === 'done' && importState.message ? (
        <p className="mt-3 rounded-lg border border-final-line bg-final-bg px-3 py-2 text-xs text-final-ink">
          {importState.message}
        </p>
      ) : null}

      {preview?.catalogue ? (
        <div className="mt-3 rounded-lg border border-draft-line bg-draft-bg p-3">
          <p className="text-xs font-medium text-draft-ink">
            確認結果: {preview.catalogue.title ?? preview.catalogue.sourceFile}
            （設問{preview.catalogue.questions.length}件）
          </p>
          <p className="mt-1 text-xs text-draft-ink">
            この確認では何も保存されていない。新規{preview.newCodes?.length ?? 0}件、
            既存の更新{preview.knownCodeCount ?? 0}件。
            内容に問題がなければ、下の「この内容で取り込む」を実行すること。
          </p>
          {previewIsStale ? (
            <p className="mt-2 text-xs text-[#b03a22]">
              選択中のファイルは、上の確認結果とは別のファイルである。もう一度「内容を確認する」を実行すること。
            </p>
          ) : (
            <button
              type="button"
              className="btn btn-primary mt-2"
              disabled={busy || previewIsStale}
              onClick={() => submit('import', importAction)}
            >
              {importPending ? '取り込み中…' : 'この内容で取り込む'}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
