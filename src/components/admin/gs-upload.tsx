'use client';

import { useT } from '@/lib/i18n/client';
import { FileCode2, UploadCloud, X } from 'lucide-react';
import { startTransition, useActionState, useRef, useState } from 'react';
import { importGsAction, previewGsAction, type GsUploadState } from '@/app/(app)/admin/items/actions';

const initial: GsUploadState = { step: 'idle' };

/**
 * Upload a .gs (design, 2026-10-02): the app reads it and builds a question
 * set; no Google Form is created. Nothing is saved until the preview has been
 * checked and confirmed.
 */
export function GsUpload({ groupTypes }: { groupTypes: Array<{ id: string; nameJa: string }> }) {
  const t = useT();
  const [previewState, previewAction, previewPending] = useActionState(previewGsAction, initial);
  const [importState, importAction, importPending] = useActionState(importGsAction, initial);
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [groupTypeId, setGroupTypeId] = useState(groupTypes[0]?.id ?? '__new');
  const [newGroupName, setNewGroupName] = useState('');
  const [setName, setSetName] = useState('');
  const [decisions, setDecisions] = useState<Record<string, 'same' | 'different'>>({});
  const [lastAction, setLastAction] = useState<'preview' | 'import' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = previewPending || importPending;
  const preview = previewState.step === 'preview' ? previewState.preview : undefined;
  const previewIsStale = Boolean(preview && file && previewState.fileName !== file.name);
  const error = lastAction === 'import' ? importState.error : previewState.error;
  const undecided = preview?.needsDecision.filter((c) => !decisions[c.key]).length ?? 0;
  const groupName =
    groupTypeId === '__new' ? newGroupName : (groupTypes.find((g) => g.id === groupTypeId)?.nameJa ?? '');

  const chooseFile = (f: File | null) => {
    setFile(f);
    setDecisions({});
    const year = f?.name.match(/(\d{4})/)?.[1];
    if (f && !setName) setSetName([year, groupName].filter(Boolean).join(' '));
  };

  const submit = (kind: 'preview' | 'import') => {
    if (!file) return;
    setLastAction(kind);
    const data = new FormData();
    data.set('file', file);
    data.set('setName', setName.trim());
    data.set('groupTypeId', groupTypeId);
    data.set('newGroupName', newGroupName.trim());
    for (const [key, value] of Object.entries(decisions)) data.set(`decision:${key}`, value);
    startTransition(() => (kind === 'preview' ? previewAction(data) : importAction(data)));
  };

  if (!open) {
    return (
      <button type="button" className="def-add" onClick={() => setOpen(true)}>
        <FileCode2 size={16} aria-hidden /> {t('Googleフォームのスクリプト（.gs）を取り込む')}
      </button>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-ink-900">{t('Googleフォームのスクリプト（.gs）を取り込む')}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-500">
            {t('.gs を読み込み、新しい質問セットを作ります。設問マスタにない設問は追加し、既にある設問はそのまま使います（削除はしません）。Googleフォームは作成しません。確認画面を見てから取り込みます。')}
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label={t('閉じる')} title={t('閉じる')}>
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(260px,1fr)_auto]">
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
              <UploadCloud size={24} aria-hidden className="dropzone-icon" />
              <p className="dropzone-title">{t('ドラッグ、またはクリックして選択')}</p>
              <p className="dropzone-hint">{t('.gs ファイル')}</p>
            </>
          )}
        </div>

        <div className="grid content-start gap-2 md:w-72">
          <label className="field-label">
            {t('グループ')}
            <select className="input mt-1" value={groupTypeId} onChange={(e) => setGroupTypeId(e.target.value)}>
              {groupTypes.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nameJa}
                </option>
              ))}
              <option value="__new">{t('新しいグループ…')}</option>
            </select>
          </label>
          {groupTypeId === '__new' ? (
            <input
              className="input"
              placeholder={t('例：日本人中途')}
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
          ) : null}
          <label className="field-label">
            {t('質問セットの名前')}
            <input
              className="input mt-1"
              placeholder={t('例：2027 インド新卒')}
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
            />
          </label>
          <button type="button" className="btn btn-secondary" disabled={busy || !file} onClick={() => submit('preview')}>
            {previewPending ? t('確認中…') : t('内容を確認する')}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 border border-accent-500/35 bg-accent-50 px-3 py-2 text-xs text-[#b03a22]">{t(error)}</p>
      ) : null}
      {importState.step === 'done' && importState.message ? (
        <p className="mt-3 border border-final-line bg-final-bg px-3 py-2 text-xs text-final-ink">{t(importState.message)}</p>
      ) : null}

      {preview && importState.step !== 'done' ? (
        <div className="mt-3 space-y-3 border border-draft-line bg-draft-bg p-3 text-xs text-draft-ink">
          <p className="font-medium">
            {t('確認結果: {name}（設問{n}件）。まだ何も保存されていません。', {
              name: preview.title ?? previewState.fileName ?? '',
              n: preview.itemCount,
            })}
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>{t('設問マスタに追加: {n}件', { n: preview.newItems.length })}</li>
            <li>{t('既にある設問をそのまま使う: {n}件', { n: preview.keptCount })}</li>
            {preview.reworded.length > 0 ? (
              <li>{t('うち文言・選択肢が変わった設問: {n}件（同じ設問として扱い、この質問セットでは新しい文言で聞きます）', { n: preview.reworded.length })}</li>
            ) : null}
            <li>{t('この質問セットでは聞かない既存の設問: {n}件（削除はしません）', { n: preview.notAsked.length })}</li>
          </ul>

          {preview.needsDecision.length > 0 ? (
            <div className="border border-warn-ink/30 bg-warn-bg p-2 text-warn-ink">
              <p className="font-medium">
                {t('番号は同じでも、内容がはっきり変わった設問があります。同じ設問か、別の設問かを選んでください。')}
              </p>
              <ul className="mt-2 space-y-2">
                {preview.needsDecision.map((c) => (
                  <li key={c.key} className="bg-white p-2 text-ink-700">
                    <p>
                      {t('これまで')}: {c.oldTitle}
                    </p>
                    <p>
                      {t('今回')}: {c.newTitle}
                    </p>
                    <div className="mt-1 flex gap-4">
                      {(['same', 'different'] as const).map((v) => (
                        <label key={v} className="flex items-center gap-1">
                          <input
                            type="radio"
                            name={`d-${c.key}`}
                            checked={decisions[c.key] === v}
                            onChange={() => setDecisions((d) => ({ ...d, [c.key]: v }))}
                          />
                          {v === 'same' ? t('同じ設問（文言の修正）') : t('別の設問（新しく追加）')}
                        </label>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview.newItems.length > 0 ? (
            <details>
              <summary className="cursor-pointer">{t('追加される設問を見る')}</summary>
              <ul className="mt-1 grid gap-x-6 md:grid-cols-2">
                {preview.newItems.map((i) => (
                  <li key={i.key}>
                    {i.subcategory} › {i.title}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {previewIsStale ? (
            <p className="text-[#b03a22]">
              {t('選択中のファイルは、上の確認結果とは別のファイルです。もう一度「内容を確認する」を押してください。')}
            </p>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || undecided > 0 || !setName.trim()}
              onClick={() => submit('import')}
            >
              {importPending ? t('取り込み中…') : t('この内容で取り込む')}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
