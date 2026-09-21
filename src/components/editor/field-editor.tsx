'use client';

import { useState, useTransition } from 'react';
import type { FieldView } from '@/lib/sheet/model';
import {
  generateFieldAction,
  loadHistoryAction,
  revertFieldAction,
  saveFieldAction,
  setFieldFlagsAction,
} from '@/app/(app)/people/[personId]/actions';

const PROCESSING_LABELS: Record<string, string> = {
  COPY: '転記',
  GLOSSARY: '辞書',
  ENRICH: '補完',
  TRANSLATE: '翻訳',
  GENERATE: '生成',
  RULE_BASED: '規則生成',
  MANUAL: '手入力',
};

type HistoryEntry = Awaited<ReturnType<typeof loadHistoryAction>>[number];

const CHANGE_LABELS: Record<string, string> = {
  IMPORT: '取り込み',
  AI_GENERATE: 'AI生成',
  RULE_GENERATE: '規則生成',
  MANUAL_EDIT: '手修正',
  REVERT: '復元',
  LOCK: 'ロック',
  UNLOCK: 'ロック解除',
  REVIEW: '確認',
};

export function FieldEditor({
  personId,
  sectionCode,
  field,
  recordId,
  readOnly,
}: {
  personId: string;
  sectionCode: string;
  field: FieldView;
  recordId?: string | null;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(field.valueJa);
  // What the server last told us this field holds. When a server action changes
  // it — a regeneration, a revert, or the save-time Japanese normalisation —
  // the box has to follow, or it keeps showing the old text, reports itself as
  // unsaved, and one click writes the stale text back over the new value.
  // Edits typed since the last server value are kept.
  const [serverValue, setServerValue] = useState(field.valueJa);
  if (serverValue !== field.valueJa) {
    setServerValue(field.valueJa);
    if (value === serverValue) setValue(field.valueJa);
  }
  const [prompt, setPrompt] = useState('');
  const [showSource, setShowSource] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const dirty = value !== field.valueJa;
  const disabled = Boolean(readOnly) || field.isLocked || pending;
  const canRegenerate =
    field.processing === 'GENERATE' ||
    field.processing === 'TRANSLATE' ||
    field.processing === 'RULE_BASED' ||
    field.processing === 'COPY' ||
    field.processing === 'GLOSSARY' ||
    field.processing === 'ENRICH';

  const run = (fn: () => Promise<{ message?: string; warnings?: string[] }>) =>
    startTransition(async () => {
      setNotice(null);
      setWarnings([]);
      try {
        const result = await fn();
        if (result.message) setNotice(result.message);
        if (result.warnings?.length) setWarnings(result.warnings);
      } catch (error) {
        setNotice((error as Error).message);
      }
    });

  const isLongText = field.valueType === 'TEXT';
  const overLimit =
    field.targetLengthMax !== null && [...value].length > field.targetLengthMax;

  return (
    <div
      className={`border-t border-ink-100 px-4 py-3 ${
        field.isLocked ? 'bg-sand-50/70' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink-900">{field.nameJa}</span>
        <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-ink-500">
          {PROCESSING_LABELS[field.processing] ?? field.processing}
        </span>
        {field.sourceCodes.length > 0 ? (
          <span className="text-xs text-ink-400">{field.sourceCodes.join(' + ')}</span>
        ) : null}
        {!field.includeInPdf ? (
          <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-ink-500">
            PDF非出力
          </span>
        ) : null}
        {field.valueJa && !field.isReviewed ? (
          <span className="badge badge-warn">未確認</span>
        ) : null}
        {field.isLocked ? <span className="badge badge-review">ロック中</span> : null}

        <span className="flex-1" />

        <span
          className={`text-xs ${overLimit ? 'font-semibold text-[#b03a22]' : 'text-ink-400'}`}
        >
          {[...value].length}字
          {field.targetLengthMin || field.targetLengthMax
            ? `（目安 ${field.targetLengthMin ?? ''}〜${field.targetLengthMax ?? ''}）`
            : ''}
        </span>
      </div>

      {field.helpText ? (
        <p className="mt-1 text-xs leading-relaxed text-ink-500">{field.helpText}</p>
      ) : null}

      <div className="mt-2">
        {isLongText ? (
          <textarea
            className="textarea"
            rows={Math.min(10, Math.max(3, Math.ceil([...value].length / 48) + 1))}
            value={value}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
          />
        ) : (
          <input
            className="input"
            value={value}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
      </div>

      {field.styleIssues.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {field.styleIssues.map((issue, i) => (
            <li key={i} className="text-xs text-draft-ink">
              ⚠ {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      {warnings.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {warnings.map((w, i) => (
            <li key={i} className="text-xs text-draft-ink">
              ⚠ {w}
            </li>
          ))}
        </ul>
      ) : null}

      {notice ? <p className="mt-1.5 text-xs text-final-ink">{notice}</p> : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={disabled || !dirty}
          onClick={() =>
            run(async () =>
              saveFieldAction(personId, {
                fieldId: field.id,
                recordId,
                sectionCode,
                valueJa: value,
              }),
            )
          }
        >
          保存
        </button>

        {canRegenerate && !readOnly ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={disabled}
            onClick={() =>
              run(async () =>
                generateFieldAction(personId, {
                  fieldId: field.id,
                  recordId,
                  sectionCode,
                }),
              )
            }
          >
            再生成
          </button>
        ) : null}

        {field.editing === 'PROMPT_AND_MANUAL' && !readOnly ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowPrompt((v) => !v)}
          >
            指示して再生成
          </button>
        ) : null}

        {field.sourceText ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowSource((v) => !v)}
          >
            {showSource ? '原文を隠す' : '原文を表示'}
          </button>
        ) : null}

        {field.valueId ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              startTransition(async () => {
                if (history) {
                  setHistory(null);
                  return;
                }
                setHistory(await loadHistoryAction(personId, field.valueId!));
              })
            }
          >
            履歴{field.historyCount > 0 ? `（${field.historyCount}）` : ''}
          </button>
        ) : null}

        <span className="flex-1" />

        {field.valueId && !readOnly ? (
          <>
            <label className="flex items-center gap-1 text-xs text-ink-700">
              <input
                type="checkbox"
                checked={field.isReviewed}
                disabled={pending}
                onChange={(e) =>
                  run(async () =>
                    setFieldFlagsAction(personId, {
                      valueId: field.valueId!,
                      sectionCode,
                      isReviewed: e.target.checked,
                    }),
                  )
                }
              />
              確認済み
            </label>
            <label className="flex items-center gap-1 text-xs text-ink-700">
              <input
                type="checkbox"
                checked={field.isLocked}
                disabled={pending}
                onChange={(e) =>
                  run(async () =>
                    setFieldFlagsAction(personId, {
                      valueId: field.valueId!,
                      sectionCode,
                      isLocked: e.target.checked,
                    }),
                  )
                }
              />
              ロック
            </label>
            {field.displayToggle ? (
              <label className="flex items-center gap-1 text-xs text-ink-700">
                <input
                  type="checkbox"
                  checked={field.isDisplayed}
                  disabled={pending}
                  onChange={(e) =>
                    run(async () =>
                      setFieldFlagsAction(personId, {
                        valueId: field.valueId!,
                        sectionCode,
                        isDisplayed: e.target.checked,
                      }),
                    )
                  }
                />
                PDFに出力
              </label>
            ) : null}
          </>
        ) : null}
      </div>

      {showPrompt ? (
        <div className="mt-2 rounded-md border border-final-line bg-final-bg/60 p-2">
          <textarea
            className="textarea"
            rows={2}
            placeholder="例：もう少し短くまとめてください／専門用語を減らしてください／使用したツール名を必ず本文に含めてください"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary mt-2"
            disabled={pending || prompt.trim() === ''}
            onClick={() =>
              run(async () => {
                const result = await generateFieldAction(personId, {
                  fieldId: field.id,
                  recordId,
                  sectionCode,
                  operatorPrompt: prompt,
                });
                setPrompt('');
                return result;
              })
            }
          >
            この指示で再生成
          </button>
        </div>
      ) : null}

      {showSource ? (
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-ink-100 bg-sand-50 p-2 text-xs leading-relaxed text-ink-700">
          {field.sourceText}
        </pre>
      ) : null}

      {history ? (
        <div className="mt-2 space-y-1.5 rounded-md border border-ink-100 bg-white p-2">
          {history.length === 0 ? (
            <p className="text-xs text-ink-400">履歴はまだない。</p>
          ) : (
            history.map((entry) => (
              <div key={entry.id} className="border-b border-ink-100 pb-1.5 last:border-0">
                <div className="flex items-center gap-2 text-xs text-ink-500">
                  <span className="font-medium text-ink-700">
                    {CHANGE_LABELS[entry.changeType] ?? entry.changeType}
                  </span>
                  <span>{new Date(entry.createdAt).toLocaleString('ja-JP')}</span>
                  {entry.changedBy ? <span>{entry.changedBy}</span> : null}
                  <span className="flex-1" />
                  {!readOnly ? (
                    <button
                      type="button"
                      className="text-brand-500 underline"
                      onClick={() =>
                        run(async () =>
                          revertFieldAction(personId, {
                            historyId: entry.id,
                            sectionCode,
                          }),
                        )
                      }
                    >
                      この内容に戻す
                    </button>
                  ) : null}
                </div>
                {entry.prompt ? (
                  <p className="text-xs text-final-ink">指示: {entry.prompt}</p>
                ) : null}
                <p className="whitespace-pre-wrap text-xs text-ink-700">
                  {entry.valueJa || '（空欄）'}
                </p>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
