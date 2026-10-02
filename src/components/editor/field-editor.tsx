'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import { Portal } from '@/components/ui/portal';
import type { FieldView } from '@/lib/sheet/model';
import { fieldActions } from '@/lib/sheet/field-actions';
import { composeGridText, gridRowsOf } from '@/lib/sheet/grid';
import { MoraBot } from '@/components/morabot';
import { useLang, useT } from '@/lib/i18n/client';
import { pickName } from '@/lib/i18n';
import {
  generateFieldAction,
  loadHistoryAction,
  revertFieldAction,
  saveFieldAction,
  setFieldFlagsAction,
} from '@/app/(app)/people/[personId]/actions';

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

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * One field on the editing screen.
 *
 * Redesigned 2026-09-29 (Sano-san: "too complicated"). What an operator needs
 * on every field is the label, the value and one 確認 tick; that is all that
 * is shown. The value saves itself when the operator leaves the box — there
 * is no per-field 保存 button. Everything else (regenerate, the original
 * answer, history, lock, PDF on/off) sits in the ⋯ menu, and the technical
 * detail (question codes, processing type) is only in the ? help.
 *
 * Saving on blur rather than on every keystroke is deliberate: each save
 * writes one history entry, so one edit becomes one entry, not dozens.
 */
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
  const t = useT();
  const lang = useLang();
  const [value, setValue] = useState(field.valueJa);
  // What the server last told us this field holds. When a server action changes
  // it — a regeneration, a revert, or the save-time Japanese normalisation —
  // the box has to follow, or it keeps showing the old text and the next blur
  // writes the stale text back over the new value. Edits typed since the last
  // server value are kept.
  const [serverValue, setServerValue] = useState(field.valueJa);
  // A GRID (e.g. JLPT 各スコア) is edited one labelled box per row
  // (2026-10-01: Sano-san asked for a box per score). The rows are kept
  // separately so a label stays on screen even while its value is cleared.
  const [gridRows, setGridRows] = useState(() => gridRowsOf(field.valueJson, field.valueJa));
  if (serverValue !== field.valueJa) {
    setServerValue(field.valueJa);
    if (value === serverValue) {
      setValue(field.valueJa);
      setGridRows(gridRowsOf(field.valueJson, field.valueJa));
    }
  }
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [panel, setPanel] = useState<null | 'prompt' | 'source' | 'history' | 'help'>(null);
  const [prompt, setPrompt] = useState('');
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [aiBusy, setAiBusy] = useState(false);

  const disabled = Boolean(readOnly) || field.isLocked || pending;
  const actions = fieldActions(field.processing, field.valueType);

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

  // An AI call takes a while (Gemini Pro ~20 s): MoraBot shows it is working.
  // Set before the transition starts: an update made inside a transition only
  // shows once the transition ends, which would be after the AI has finished.
  const runAi = (fn: () => Promise<{ message?: string; warnings?: string[] }>) => {
    setAiBusy(true);
    run(async () => {
      try {
        return await fn();
      } finally {
        setAiBusy(false);
      }
    });
  };

  const save = () => {
    if (readOnly || field.isLocked || value === field.valueJa) return;
    setSaveState('saving');
    startTransition(async () => {
      try {
        const result = await saveFieldAction(personId, {
          fieldId: field.id,
          recordId,
          sectionCode,
          valueJa: value,
        });
        setSaveState(result.ok === false ? 'error' : 'saved');
        if (result.ok === false && result.message) setNotice(result.message);
      } catch (error) {
        setSaveState('error');
        setNotice((error as Error).message);
      }
    });
  };

  // "保存しました" fades back to nothing after a moment.
  useEffect(() => {
    if (saveState !== 'saved') return;
    const t = setTimeout(() => setSaveState('idle'), 2500);
    return () => clearTimeout(t);
  }, [saveState]);

  // Leaving the page with an edit still in the box: the browser asks first.
  const dirty = value !== field.valueJa;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const togglePanel = (next: NonNullable<typeof panel>) =>
    setPanel((current) => (current === next ? null : next));

  const openHistory = () => {
    if (panel === 'history') {
      setPanel(null);
      return;
    }
    setPanel('history');
    startTransition(async () => {
      setHistory(await loadHistoryAction(personId, field.valueId!));
    });
  };

  // GRID also renders as a textarea: its value is several "ラベル：値" lines
  // (see processCopy), which a single-line <input> would collapse into one
  // unreadable run.
  const isLongText = field.valueType === 'TEXT' || field.valueType === 'GRID';
  const length = [...value].length;
  const overLimit = field.targetLengthMax !== null && length > field.targetLengthMax;
  const hasTarget = field.targetLengthMin !== null || field.targetLengthMax !== null;

  const canReview = Boolean(field.valueId) && !readOnly;
  const needsReview = Boolean(field.valueJa) && !field.isReviewed;

  const menuItems: MenuEntry[] = [];
  if (!readOnly && actions.regenerate) {
    menuItems.push({
      label: t('AIで作り直す'),
      disabled,
      onClick: () =>
        runAi(() => generateFieldAction(personId, { fieldId: field.id, recordId, sectionCode })),
    });
  }
  if (!readOnly && actions.regenerateWithInstructions) {
    menuItems.push({
      label: t('指示してAIで作り直す'),
      disabled,
      onClick: () => togglePanel('prompt'),
    });
  }
  if (actions.showOriginal && field.sourceText) {
    menuItems.push({
      label: panel === 'source' ? t('回答の原文を隠す') : t('回答の原文を見る'),
      onClick: () => togglePanel('source'),
    });
  }
  if (field.valueId) {
    menuItems.push({
      label: t('変更履歴') + (field.historyCount > 0 ? `（${field.historyCount}）` : ''),
      onClick: openHistory,
    });
  }
  if (field.valueId && !readOnly) {
    menuItems.push({ separator: true });
    menuItems.push({
      label: field.isLocked ? t('ロックを解除する') : t('ロックする（AIで上書きさせない）'),
      disabled: pending,
      onClick: () =>
        run(async () =>
          setFieldFlagsAction(personId, {
            valueId: field.valueId!,
            sectionCode,
            isLocked: !field.isLocked,
          }),
        ),
    });
    if (field.displayToggle) {
      menuItems.push({
        label: field.isDisplayed ? t('PDFに載せない') : t('PDFに載せる'),
        disabled: pending,
        onClick: () =>
          run(async () =>
            setFieldFlagsAction(personId, {
              valueId: field.valueId!,
              sectionCode,
              isDisplayed: !field.isDisplayed,
            }),
          ),
      });
    }
  }

  return (
    <div
      // Lets the editing screen return to this field after the preview
      // (see scroll-restore.tsx).
      id={`field-${field.id}${recordId ? `-${recordId}` : ''}`}
      data-field-anchor=""
      className={`field-block ${field.isLocked ? 'bg-sand-50' : ''}`}
    >
      <div className="field-label-row">
        <label className="field-name" htmlFor={`input-${field.id}${recordId ?? ''}`}>
          {pickName(lang, field.nameJa, field.nameEn)}
        </label>
        <button
          type="button"
          className="field-help-btn"
          aria-label={t('この項目について')}
          aria-expanded={panel === 'help'}
          onClick={() => togglePanel('help')}
        >
          ?
        </button>
        {field.isLocked ? <span className="tag">{t('ロック中')}</span> : null}
        {field.displayToggle && !field.isDisplayed ? (
          <span className="tag">{t('PDFに載せない')}</span>
        ) : null}

        <span className="flex-1" />

        <SaveIndicator state={saveState} />
        {hasTarget ? (
          <span className={`field-count ${overLimit ? 'field-count-over' : ''}`}>
            {t('{n}字', { n: length })}
            {field.targetLengthMax ? t(' / 目安{n}字', { n: field.targetLengthMax }) : ''}
          </span>
        ) : null}

        {canReview ? (
          <label
            className={`review-check ${
              field.isReviewed ? 'review-check-on' : needsReview ? 'review-check-todo' : ''
            }`}
          >
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
            {field.isReviewed ? t('確認済み') : t('確認')}
          </label>
        ) : null}

        {menuItems.length > 0 ? <FieldMenu items={menuItems} /> : null}
      </div>

      {panel === 'help' ? (
        <div className="field-help">
          {field.helpText ? <p>{field.helpText}</p> : null}
          <p className="text-xs text-ink-500">
            {field.includeInPdf
              ? t('スキルシート（PDF）に載る項目です。')
              : t('スキルシート（PDF）には載りません。')}
            {field.sourceCodes.length > 0
              ? t(' 元になる設問：{codes}', { codes: field.sourceCodes.join('、') })
              : t(' 手で入力する項目です。')}
          </p>
        </div>
      ) : null}

      {field.valueType === 'GRID' && gridRows.length > 0 ? (
        <div className="grid-inputs">
          {gridRows.map((r, i) => (
            <label key={i} className="grid-input-row">
              <span className="grid-input-label">{r.row}</span>
              <input
                className="input"
                value={r.value}
                disabled={disabled}
                onChange={(e) => {
                  const next = gridRows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x));
                  setGridRows(next);
                  setValue(composeGridText(next));
                }}
                onBlur={save}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
                }}
              />
            </label>
          ))}
        </div>
      ) : isLongText ? (
        <textarea
          id={`input-${field.id}${recordId ?? ''}`}
          className="textarea"
          // Enough rows for every line of a multi-line value (each JLPT score
          // is its own line), or for a long paragraph's wrapped length.
          rows={Math.min(10, Math.max(3, value.split('\n').length, Math.ceil(length / 48) + 1))}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
        />
      ) : (
        <input
          id={`input-${field.id}${recordId ?? ''}`}
          className="input"
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
          }}
        />
      )}

      {aiBusy ? (
        <p className="field-msg flex items-center gap-2 !text-brand-500">
          <MoraBot mood="think" size={28} animate title="" />
          {t('モラボットが文章を作成中です…')}
        </p>
      ) : null}
      {[...field.styleIssues.map((i) => i.message), ...warnings].map((message, i) => (
        <p key={i} className="field-msg">
          ⚠ {t(message)}
        </p>
      ))}
      {notice ? <p className="field-msg text-ink-700">{t(notice)}</p> : null}

      {panel === 'prompt' ? (
        <div className="field-extra">
          <textarea
            className="textarea"
            rows={2}
            placeholder={t('例：もう少し短くまとめてください／専門用語を減らしてください')}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || prompt.trim() === ''}
              onClick={() =>
                runAi(async () => {
                  const result = await generateFieldAction(personId, {
                    fieldId: field.id,
                    recordId,
                    sectionCode,
                    operatorPrompt: prompt,
                  });
                  setPrompt('');
                  setPanel(null);
                  return result;
                })
              }
            >
              {t('この指示で作り直す')}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setPanel(null)}>
              {t('やめる')}
            </button>
          </div>
        </div>
      ) : null}

      {panel === 'source' ? (
        <pre className="field-extra max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-ink-700">
          {field.sourceText}
        </pre>
      ) : null}

      {panel === 'history' ? (
        <div className="field-extra space-y-2">
          {history === null ? (
            <p className="text-xs text-ink-400">{t('読み込み中…')}</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-ink-400">{t('履歴はまだありません。')}</p>
          ) : (
            history.map((entry) => (
              <div key={entry.id} className="border-b border-ink-100 pb-2 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                  <span className="font-medium text-ink-700">
                    {t(CHANGE_LABELS[entry.changeType] ?? entry.changeType)}
                  </span>
                  <span>{new Date(entry.createdAt).toLocaleString(t('ja-JP'))}</span>
                  {entry.changedBy ? <span>{entry.changedBy}</span> : null}
                  <span className="flex-1" />
                  {!readOnly ? (
                    <button
                      type="button"
                      className="font-medium text-brand-500 hover:underline"
                      onClick={() =>
                        run(async () =>
                          revertFieldAction(personId, { historyId: entry.id, sectionCode }),
                        )
                      }
                    >
                      {t('この内容に戻す')}
                    </button>
                  ) : null}
                </div>
                {entry.prompt ? <p className="text-xs text-ink-500">{t('指示')}: {entry.prompt}</p> : null}
                <p className="whitespace-pre-wrap text-sm text-ink-700">
                  {entry.valueJa || t('（空欄）')}
                </p>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const t = useT();
  if (state === 'saving') return <span className="save-state">{t('保存中…')}</span>;
  if (state === 'saved') return <span className="save-state save-state-ok">✓ {t('保存しました')}</span>;
  if (state === 'error')
    return <span className="save-state save-state-error">{t('保存できませんでした')}</span>;
  return null;
}

type MenuEntry =
  | { separator: true }
  | { separator?: false; label: string; onClick: () => void; disabled?: boolean };

/**
 * The ⋯ button and its drop-down of less common actions.
 *
 * The list is drawn at the top level of the page (a portal) and placed under
 * the button with fixed coordinates: drawn inside the field's card it was cut
 * off by the card's edge, hiding every item below the first. It opens upwards
 * when there is no room below.
 */
export function FieldMenu({
  items,
  label,
}: {
  items: MenuEntry[];
  label?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const position = useCallback(() => {
    const button = rootRef.current?.getBoundingClientRect();
    if (!button) return;
    const right = Math.max(8, window.innerWidth - button.right);
    const height = menuRef.current?.offsetHeight ?? 200;
    const roomBelow = window.innerHeight - button.bottom;
    setPlace(
      roomBelow < height + 12 && button.top > roomBelow
        ? { bottom: window.innerHeight - button.top + 4, right }
        : { top: button.bottom + 4, right },
    );
  }, []);

  useLayoutEffect(() => {
    if (open) position();
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') setOpen(false);
        return;
      }
      const target = e.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    // The menu stays with its button while the page scrolls or resizes.
    const follow = () => position();
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
  }, [open, position]);

  return (
    <div className="menu-root" ref={rootRef}>
      <button
        type="button"
        className="icon-btn"
        aria-label={label ?? t('その他の操作')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open ? (
        <Portal>
          <div
            ref={menuRef}
            className="menu menu-floating"
            role="menu"
            style={{ ...place, visibility: place ? 'visible' : 'hidden' }}
          >
            {items.map((item, i) =>
              item.separator ? (
                <div key={i} className="menu-sep" role="separator" />
              ) : (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                >
                  {item.label}
                </button>
              ),
            )}
          </div>
        </Portal>
      ) : null}
    </div>
  );
}
