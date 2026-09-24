'use client';

import { useRef, useState, useTransition } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react';
import { Select } from '@/components/ui/select';
import type {
  Editing,
  GlossaryCategory,
  Processing,
  ValueType,
} from '@prisma/client';
import {
  createFieldAction,
  createSectionAction,
  deleteFieldAction,
  deleteSectionAction,
  reorderFieldsAction,
  reorderSectionsAction,
  setFieldPrintedAction,
  setSectionVisibleAction,
  updateFieldAction,
  updateSectionAction,
  type SaveResult,
} from '@/app/(app)/admin/fields/actions';

/**
 * The field-definition screen.
 *
 * Sano-san's review (2026-09-23, item 4): order was set by typing numbers
 * (10, 20, 65, 90 …) that meant nothing to the person using the screen, 0 did
 * not hide anything, and there was no way to tell order from visibility. She
 * pointed at the list screens commonly used in Japan, where nothing is typed:
 *
 *   並べ替え     drag the row by its handle, or press ↑ / ↓
 *   表示・非表示  a switch in the 表示 column
 *   削除         a waste-bin button
 *
 * That is what this screen now does, laid out like her reference screens: a
 * blue heading bar, one row per item, the switch and the bin at the right, and
 * ＞ at the end to open the detailed settings. The stored order values still
 * exist but are an internal detail, renumbered on every move and never shown.
 */

export type FieldRow = {
  id: string;
  code: string;
  nameJa: string;
  nameEn: string | null;
  order: number;
  processing: Processing;
  editing: Editing;
  valueType: ValueType;
  includeInPdf: boolean;
  displayToggle: boolean;
  isRequired: boolean;
  isActive: boolean;
  generationPrompt: string | null;
  targetLengthMin: number | null;
  targetLengthMax: number | null;
  glossaryCategory: GlossaryCategory | null;
  ruleKey: string | null;
  helpText: string | null;
  sourceCodes: string[];
  /** How many people have something entered in this field. */
  filledCount: number;
};

export type SectionRow = {
  id: string;
  code: string;
  nameJa: string;
  nameEn: string | null;
  order: number;
  kind: string;
  isVisible: boolean;
  hideWhenEmpty: boolean;
  maxDisplayed: number;
  description: string | null;
  fields: FieldRow[];
};

const PROCESSING_OPTIONS: Array<{ value: Processing; label: string; hint: string }> = [
  { value: 'COPY', label: '転記', hint: '回答をそのまま転記する。選択式は記号と英語部分を除く' },
  { value: 'GLOSSARY', label: '辞書', hint: '対訳辞書で日本語表記に変換する。AIは使わない' },
  { value: 'ENRICH', label: '補完', hint: '転記したうえで、システム側の情報を加える' },
  { value: 'TRANSLATE', label: '翻訳', hint: '英文を日本語に翻訳する。要約・圧縮はしない' },
  { value: 'GENERATE', label: '生成', hint: '翻訳・要約・平易化を行い日本語の文章を作る' },
  { value: 'RULE_BASED', label: '規則生成', hint: '数値等をもとに規則にしたがって生成する' },
  { value: 'MANUAL', label: '手入力', hint: 'フォームからは取得せず画面で直接入力する' },
];

/** How an operator may change a field's value once it exists. */
const EDITING_OPTIONS = [
  { value: 'MANUAL_ONLY', label: '手修正のみ', hint: '画面で直接書き換える' },
  { value: 'PROMPT_AND_MANUAL', label: 'プロンプト＋手修正', hint: 'AIへの指示と手修正の両方' },
];

/** The shapes a value can take on the sheet. */
const VALUE_TYPE_OPTIONS = [
  { value: 'STRING', label: '1行テキスト' },
  { value: 'TEXT', label: '複数行テキスト' },
  { value: 'STRING_LIST', label: 'リスト' },
  { value: 'GRID', label: 'グリッド', hint: '行ラベルと値の組' },
  { value: 'NUMBER', label: '数値' },
  { value: 'DATE', label: '日付' },
];

const RULE_OPTIONS = [
  { value: '', label: '（なし）' },
  { value: 'full_name_combined', label: '氏名（カタカナ＋英語）' },
  { value: 'age_from_dob', label: '年齢（生年月日から算出）' },
  { value: 'hometown_with_region', label: '出身地（州・地域区分を付記）' },
  { value: 'jlpt_qualification', label: 'JLPT取得資格と時期' },
  { value: 'jlpt_description', label: 'JLPT日本語力の説明' },
];

const GLOSSARY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '（なし）' },
  { value: 'UNIVERSITY', label: '大学名' },
  { value: 'MAJOR', label: '専攻名' },
  { value: 'DEGREE', label: '学位' },
  { value: 'STATE', label: '州・地域' },
  { value: 'TECH_TERM', label: '技術用語' },
  { value: 'HIGH_SCHOOL', label: '高校名' },
];

type Notice = { ok: boolean; text: string } | null;

// ===========================================================================
// Reordering: drag by the handle, or ↑ / ↓.
// ===========================================================================

function useReorder<T extends { id: string }>(
  items: T[],
  save: (ids: string[]) => Promise<SaveResult>,
  onNotice: (n: Notice) => void,
) {
  const [ids, setIds] = useState(() => items.map((i) => i.id));
  // When the server sends a fresh list (after any save), start from it again.
  const [source, setSource] = useState(items);
  if (source !== items) {
    setSource(items);
    setIds(items.map((i) => i.id));
  }
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = ids.map((id) => byId.get(id)).filter((i): i is T => Boolean(i));

  const commit = (next: string[]) => {
    const previous = ids;
    setIds(next);
    startTransition(async () => {
      const result = await save(next);
      onNotice({ ok: result.ok, text: result.message });
      if (!result.ok) setIds(previous);
    });
  };

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= ids.length) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commit(next);
  };

  /** Props for the grip handle of the row with this id. */
  const handleProps = (id: string, row: React.RefObject<HTMLElement | null>) => ({
    draggable: !pending,
    onDragStart: (e: React.DragEvent) => {
      setDragId(id);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      // Drag the whole row, not just the small handle.
      if (row.current) e.dataTransfer.setDragImage(row.current, 24, 20);
    },
    onDragEnd: () => {
      setDragId(null);
      setOverId(null);
    },
  });

  /** Props for the row itself, which accepts a drop. */
  const dropProps = (id: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragId || dragId === id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (overId !== id) setOverId(id);
    },
    onDragLeave: () => {
      if (overId === id) setOverId(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragId && dragId !== id) move(ids.indexOf(dragId), ids.indexOf(id));
      setDragId(null);
      setOverId(null);
    },
  });

  return { ordered, move, handleProps, dropProps, dragId, overId, pending };
}

function MoveButtons({
  index,
  count,
  disabled,
  onMove,
  label,
}: {
  index: number;
  count: number;
  disabled: boolean;
  onMove: (to: number) => void;
  label: string;
}) {
  return (
    <div className="def-move">
      <button
        type="button"
        className="icon-btn"
        disabled={disabled || index === 0}
        onClick={() => onMove(index - 1)}
        aria-label={`${label}を1つ上へ`}
        title="1つ上へ"
      >
        <ArrowUp size={16} aria-hidden />
      </button>
      <button
        type="button"
        className="icon-btn"
        disabled={disabled || index === count - 1}
        onClick={() => onMove(index + 1)}
        aria-label={`${label}を1つ下へ`}
        title="1つ下へ"
      >
        <ArrowDown size={16} aria-hidden />
      </button>
    </div>
  );
}

// ===========================================================================
// Switch and delete confirmation
// ===========================================================================

function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={checked ? '表示中（押すと非表示）' : '非表示（押すと表示）'}
      className="switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" aria-hidden />
    </button>
  );
}

/** A switch that saves itself, and goes back if the save fails. */
function SavingSwitch({
  initial,
  save,
  label,
  onNotice,
}: {
  initial: boolean;
  save: (next: boolean) => Promise<SaveResult>;
  label: string;
  onNotice: (n: Notice) => void;
}) {
  const [value, setValue] = useState(initial);
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setValue(initial);
  }
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={value}
      disabled={pending}
      label={label}
      onChange={(next) => {
        setValue(next);
        startTransition(async () => {
          const result = await save(next);
          onNotice({ ok: result.ok, text: result.message });
          if (!result.ok) setValue(!next);
        });
      }}
    />
  );
}

function DeleteConfirm({
  message,
  onConfirm,
  onCancel,
  pending,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="def-confirm" role="alertdialog" aria-live="assertive">
      <Trash2 size={16} aria-hidden className="flex-none text-[#b03a22]" />
      <p className="flex-1">{message}</p>
      <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={pending}>
        やめる
      </button>
      <button type="button" className="btn btn-delete" onClick={onConfirm} disabled={pending}>
        {pending ? '削除中…' : '削除する'}
      </button>
    </div>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p className={`def-notice ${notice.ok ? 'def-notice-ok' : 'def-notice-error'}`} role="status">
      {notice.text}
    </p>
  );
}

// ===========================================================================
// Sections
// ===========================================================================

export function FieldDefinitionTable({
  sections,
  questionCodes,
}: {
  sections: SectionRow[];
  questionCodes: string[];
}) {
  const [notice, setNotice] = useState<Notice>(null);
  const reorder = useReorder(sections, reorderSectionsAction, setNotice);
  // Which add button is open. There is one above the list and one below it:
  // with many sections the bottom one is off screen, and a new section goes
  // where the button that was pressed is.
  const [adding, setAdding] = useState<'first' | 'last' | null>(null);

  const addControl = (position: 'first' | 'last') =>
    adding === position ? (
      <AddSectionForm
        position={position}
        onDone={(result) => {
          setNotice({ ok: result.ok, text: result.message });
          if (result.ok) setAdding(null);
        }}
        onCancel={() => setAdding(null)}
      />
    ) : (
      <button type="button" className="def-add" onClick={() => setAdding(position)}>
        <Plus size={16} aria-hidden />
        {position === 'first' ? '先頭にセクションを追加する' : '末尾にセクションを追加する'}
      </button>
    );

  return (
    <div className="def-table">
      <div className="def-bar">
        <h2 className="def-bar-title">セクション一覧</h2>
        <span className="def-bar-meta">{sections.length}件</span>
      </div>

      <NoticeLine notice={notice} />

      {addControl('first')}

      <div className="def-row def-head" aria-hidden>
        <span>並び替え</span>
        <span>セクション名</span>
        <span className="def-col-meta">内容</span>
        <span className="text-center">表示</span>
        <span className="text-center">削除</span>
        <span className="text-center">詳細</span>
      </div>

      {reorder.ordered.map((section, index) => (
        <SectionItem
          key={section.id}
          section={section}
          index={index}
          count={reorder.ordered.length}
          reorder={reorder}
          questionCodes={questionCodes}
          onNotice={setNotice}
        />
      ))}

      {addControl('last')}
    </div>
  );
}

function SectionItem({
  section,
  index,
  count,
  reorder,
  questionCodes,
  onNotice,
}: {
  section: SectionRow;
  index: number;
  count: number;
  reorder: ReturnType<typeof useReorder<SectionRow>>;
  questionCodes: string[];
  onNotice: (n: Notice) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const isDragging = reorder.dragId === section.id;
  const isOver = reorder.overId === section.id;

  return (
    <div className={`def-item ${open ? 'def-item-open' : ''}`}>
      <div
        ref={rowRef}
        className={`def-row ${isDragging ? 'def-row-dragging' : ''} ${isOver ? 'def-row-over' : ''}`}
        {...reorder.dropProps(section.id)}
      >
        <span
          className="def-grip"
          {...reorder.handleProps(section.id, rowRef)}
          title="ドラッグして並べ替え"
          aria-hidden
        >
          <GripVertical size={18} />
        </span>
        <MoveButtons
          index={index}
          count={count}
          disabled={reorder.pending}
          onMove={(to) => reorder.move(index, to)}
          label={section.nameJa}
        />
        <button type="button" className="def-name" onClick={() => setOpen((v) => !v)}>
          <span className="def-name-ja">{section.nameJa}</span>
          <span className="def-name-sub">{section.nameEn ?? section.code}</span>
        </button>
        <span className="def-col-meta def-meta">
          {section.kind === 'REPEATING'
            ? `繰り返し・最大${section.maxDisplayed}件`
            : '単一'}
          ・項目{section.fields.length}件
          {section.hideWhenEmpty ? <span className="def-tag">データなしで非表示</span> : null}
        </span>
        <span className="grid place-items-center">
          <SavingSwitch
            initial={section.isVisible}
            label={`${section.nameJa}をシートに表示する`}
            save={(next) => setSectionVisibleAction(section.id, next)}
            onNotice={onNotice}
          />
        </span>
        <span className="grid place-items-center">
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            onClick={() => setConfirming(true)}
            aria-label={`${section.nameJa}を削除`}
            title="削除"
          >
            <Trash2 size={18} aria-hidden />
          </button>
        </span>
        <span className="grid place-items-center">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={`${section.nameJa}の項目と設定を${open ? '閉じる' : '開く'}`}
            title={open ? '閉じる' : '項目と設定を開く'}
          >
            <ChevronRight size={20} aria-hidden className={`def-chevron ${open ? 'rotate-90' : ''}`} />
          </button>
        </span>
      </div>

      {confirming ? (
        <DeleteConfirm
          pending={pending}
          message={
            section.fields.length > 0
              ? `「${section.nameJa}」には項目が${section.fields.length}件あります。セクションを削除するには、先に中の項目を削除してください。一時的に出さないだけなら「表示」のスイッチを切ってください。`
              : `「${section.nameJa}」を削除します。元には戻せません。`
          }
          onCancel={() => setConfirming(false)}
          onConfirm={() =>
            section.fields.length > 0
              ? setConfirming(false)
              : startTransition(async () => {
                  const result = await deleteSectionAction(section.id);
                  onNotice({ ok: result.ok, text: result.message });
                  setConfirming(false);
                })
          }
        />
      ) : null}

      {open ? (
        <div className="def-children">
          <SectionSettings section={section} onNotice={onNotice} />
          <FieldList section={section} questionCodes={questionCodes} onNotice={onNotice} />
        </div>
      ) : null}
    </div>
  );
}

function SectionSettings({
  section,
  onNotice,
}: {
  section: SectionRow;
  onNotice: (n: Notice) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(section);
  const [pending, startTransition] = useTransition();

  return (
    <div className="def-settings">
      <button
        type="button"
        className="def-settings-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronRight size={16} aria-hidden className={`def-chevron ${open ? 'rotate-90' : ''}`} />
        セクションの設定（名前・表示件数など）
      </button>
      {open ? (
        <div className="grid gap-3 pt-3 md:grid-cols-4">
          <Labeled label="表示名（日本語）">
            <input
              className="input"
              value={draft.nameJa}
              onChange={(e) => setDraft({ ...draft, nameJa: e.target.value })}
            />
          </Labeled>
          <Labeled label="表示名（英語）">
            <input
              className="input"
              value={draft.nameEn ?? ''}
              onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })}
            />
          </Labeled>
          {section.kind === 'REPEATING' ? (
            <Labeled label="シートに載せる最大件数">
              <input
                type="number"
                min={1}
                className="input"
                value={draft.maxDisplayed}
                onChange={(e) => setDraft({ ...draft, maxDisplayed: Number(e.target.value) })}
              />
            </Labeled>
          ) : null}
          <label className="flex items-center gap-2 self-end pb-2 text-xs text-ink-700">
            <input
              type="checkbox"
              checked={draft.hideWhenEmpty}
              onChange={(e) => setDraft({ ...draft, hideWhenEmpty: e.target.checked })}
            />
            データが1件もない場合はシートに出さない
          </label>
          <div className="md:col-span-4">
            <Labeled label="説明（担当者向けのメモ）">
              <textarea
                className="textarea"
                rows={2}
                value={draft.description ?? ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Labeled>
          </div>
          <div className="md:col-span-4">
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await updateSectionAction({
                    id: draft.id,
                    nameJa: draft.nameJa,
                    nameEn: draft.nameEn ?? undefined,
                    isVisible: section.isVisible,
                    hideWhenEmpty: draft.hideWhenEmpty,
                    maxDisplayed: draft.maxDisplayed,
                    description: draft.description ?? undefined,
                  });
                  onNotice({ ok: result.ok, text: result.message });
                })
              }
            >
              設定を保存
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AddSectionForm({
  position,
  onDone,
  onCancel,
}: {
  position: 'first' | 'last';
  onDone: (result: SaveResult) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [nameJa, setNameJa] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [pending, startTransition] = useTransition();
  return (
    <div className="def-add-form">
      <Labeled label="表示名（日本語）">
        <input className="input" value={nameJa} onChange={(e) => setNameJa(e.target.value)} />
      </Labeled>
      <Labeled label="表示名（英語）">
        <input className="input" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
      </Labeled>
      <Labeled label="セクションコード（英小文字）">
        <input
          className="input"
          placeholder="例：certifications"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </Labeled>
      <div className="flex items-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={pending}>
          やめる
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !code.trim() || !nameJa.trim()}
          onClick={() =>
            startTransition(async () => {
              onDone(await createSectionAction({ code, nameJa, nameEn, position }));
            })
          }
        >
          追加する
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// Fields within a section
// ===========================================================================

function FieldList({
  section,
  questionCodes,
  onNotice,
}: {
  section: SectionRow;
  questionCodes: string[];
  onNotice: (n: Notice) => void;
}) {
  const [notice, setNotice] = useState<Notice>(null);
  const reorder = useReorder(
    section.fields,
    (ids) => reorderFieldsAction(section.id, ids),
    setNotice,
  );
  const [adding, setAdding] = useState(false);
  // Messages about this section's fields appear here, next to the fields,
  // rather than at the top of a long page.
  const report = (n: Notice) => {
    setNotice(n);
    onNotice(null);
  };

  return (
    <div className="def-fields">
      <NoticeLine notice={notice} />
      <div className="def-row def-head def-head-sub" aria-hidden>
        <span>並び替え</span>
        <span>項目名</span>
        <span className="def-col-meta">処理・取得元</span>
        <span className="text-center">表示</span>
        <span className="text-center">削除</span>
        <span className="text-center">詳細</span>
      </div>
      {reorder.ordered.length === 0 ? (
        <p className="px-4 py-4 text-center text-xs text-ink-500">項目はまだありません。</p>
      ) : (
        reorder.ordered.map((field, index) => (
          <FieldItem
            key={field.id}
            field={field}
            index={index}
            count={reorder.ordered.length}
            reorder={reorder}
            questionCodes={questionCodes}
            onNotice={report}
          />
        ))
      )}
      {adding ? (
        <AddFieldForm
          sectionId={section.id}
          onDone={(result) => {
            report({ ok: result.ok, text: result.message });
            if (result.ok) setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="def-add" onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden /> 「{section.nameJa}」に項目を追加する
        </button>
      )}
    </div>
  );
}

function FieldItem({
  field,
  index,
  count,
  reorder,
  questionCodes,
  onNotice,
}: {
  field: FieldRow;
  index: number;
  count: number;
  reorder: ReturnType<typeof useReorder<FieldRow>>;
  questionCodes: string[];
  onNotice: (n: Notice) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const processing = PROCESSING_OPTIONS.find((o) => o.value === field.processing)?.label;

  return (
    <div className={`def-item ${open ? 'def-item-open' : ''}`}>
      <div
        ref={rowRef}
        className={`def-row ${reorder.dragId === field.id ? 'def-row-dragging' : ''} ${
          reorder.overId === field.id ? 'def-row-over' : ''
        }`}
        {...reorder.dropProps(field.id)}
      >
        <span
          className="def-grip"
          {...reorder.handleProps(field.id, rowRef)}
          title="ドラッグして並べ替え"
          aria-hidden
        >
          <GripVertical size={18} />
        </span>
        <MoveButtons
          index={index}
          count={count}
          disabled={reorder.pending}
          onMove={(to) => reorder.move(index, to)}
          label={field.nameJa}
        />
        <button type="button" className="def-name" onClick={() => setOpen((v) => !v)}>
          <span className="def-name-ja">
            {field.nameJa}
            {field.isRequired ? <span className="def-required">必須</span> : null}
            {!field.isActive ? <span className="def-tag">無効</span> : null}
          </span>
          <span className="def-name-sub">{field.code}</span>
        </button>
        <span className="def-col-meta def-meta">
          <span className="def-tag def-tag-blue">{processing}</span>
          {field.sourceCodes.length > 0 ? field.sourceCodes.join(' + ') : '取得元なし'}
        </span>
        <span className="grid place-items-center">
          <SavingSwitch
            initial={field.includeInPdf}
            label={`${field.nameJa}をシートに表示する`}
            save={(next) => setFieldPrintedAction(field.id, next)}
            onNotice={onNotice}
          />
        </span>
        <span className="grid place-items-center">
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            onClick={() => setConfirming(true)}
            aria-label={`${field.nameJa}を削除`}
            title="削除"
          >
            <Trash2 size={18} aria-hidden />
          </button>
        </span>
        <span className="grid place-items-center">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={`${field.nameJa}の詳しい設定を${open ? '閉じる' : '開く'}`}
            title={open ? '閉じる' : '詳しい設定を開く'}
          >
            <ChevronRight size={20} aria-hidden className={`def-chevron ${open ? 'rotate-90' : ''}`} />
          </button>
        </span>
      </div>

      {confirming ? (
        <DeleteConfirm
          pending={pending}
          message={
            field.filledCount > 0
              ? `「${field.nameJa}」を削除すると、${field.filledCount}人分の入力内容も一緒に削除され、元に戻せません。一時的に出さないだけなら「表示」のスイッチを切ってください。`
              : `「${field.nameJa}」を削除します。元には戻せません。`
          }
          onCancel={() => setConfirming(false)}
          onConfirm={() =>
            startTransition(async () => {
              const result = await deleteFieldAction(field.id);
              onNotice({ ok: result.ok, text: result.message });
              setConfirming(false);
            })
          }
        />
      ) : null}

      {open ? <FieldDetail field={field} questionCodes={questionCodes} onNotice={onNotice} /> : null}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-700">{label}</label>
      {children}
    </div>
  );
}

function AddFieldForm({
  sectionId,
  onDone,
  onCancel,
}: {
  sectionId: string;
  onDone: (result: SaveResult) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [nameJa, setNameJa] = useState('');
  const [processing, setProcessing] = useState<Processing>('COPY');
  const [sources, setSources] = useState('');
  const [pending, startTransition] = useTransition();

  return (
    <div className="def-add-form">
      <Labeled label="表示名">
        <input className="input" value={nameJa} onChange={(e) => setNameJa(e.target.value)} />
      </Labeled>
      <Labeled label="項目コード（英小文字）">
        <input
          className="input"
          placeholder="例：hobby"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </Labeled>
      <Labeled label="処理区分">
        <Select
          ariaLabel="処理区分"
          value={processing}
          onChange={(v) => setProcessing(v as Processing)}
          options={PROCESSING_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
            hint: o.hint,
          }))}
        />
      </Labeled>
      <Labeled label="取得元の設問ID（カンマ区切り）">
        <input
          className="input"
          placeholder="A-1-1, A-1-2"
          value={sources}
          onChange={(e) => setSources(e.target.value)}
        />
      </Labeled>
      <div className="flex items-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={pending}>
          やめる
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !code.trim() || !nameJa.trim()}
          onClick={() =>
            startTransition(async () => {
              onDone(
                await createFieldAction({
                  sectionId,
                  code: code.trim(),
                  nameJa: nameJa.trim(),
                  processing,
                  sourceCodes: sources
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                }),
              );
            })
          }
        >
          追加する
        </button>
      </div>
    </div>
  );
}

function FieldDetail({
  field,
  questionCodes,
  onNotice,
}: {
  field: FieldRow;
  questionCodes: string[];
  onNotice: (n: Notice) => void;
}) {
  const [draft, setDraft] = useState(field);
  const [sources, setSources] = useState(field.sourceCodes.join(', '));
  const [pending, startTransition] = useTransition();

  const unknownSources = sources
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((code) => !questionCodes.includes(code) && !code.includes('-x-'));

  return (
    <div className="def-detail grid gap-3 md:grid-cols-4">
      <Labeled label="表示名">
        <input
          className="input"
          value={draft.nameJa}
          onChange={(e) => setDraft({ ...draft, nameJa: e.target.value })}
        />
      </Labeled>
      <Labeled label="処理区分">
        <Select
          ariaLabel="処理方法"
          value={draft.processing}
          onChange={(v) => setDraft({ ...draft, processing: v as Processing })}
          options={PROCESSING_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
            hint: o.hint,
          }))}
        />
        <p className="mt-1 text-xs text-ink-500">
          {PROCESSING_OPTIONS.find((o) => o.value === draft.processing)?.hint}
        </p>
      </Labeled>
      <Labeled label="編集方法">
        <Select
          ariaLabel="編集方法"
          value={draft.editing}
          onChange={(v) => setDraft({ ...draft, editing: v as Editing })}
          options={EDITING_OPTIONS}
        />
      </Labeled>
      <Labeled label="値の型">
        <Select
          ariaLabel="値の種類"
          value={draft.valueType}
          onChange={(v) => setDraft({ ...draft, valueType: v as ValueType })}
          options={VALUE_TYPE_OPTIONS}
        />
      </Labeled>

      <div className="md:col-span-4">
        <Labeled label="取得元の設問ID（カンマ区切り。繰り返し項目は E-x-6 のように x を使う）">
          <input className="input" value={sources} onChange={(e) => setSources(e.target.value)} />
        </Labeled>
        {unknownSources.length > 0 ? (
          <p className="mt-1 text-xs text-draft-ink">
            ⚠ 現在のフォームに存在しない設問ID: {unknownSources.join('、')}
          </p>
        ) : null}
      </div>

      <Labeled label="辞書の分類">
        <Select
          ariaLabel="辞書の分類"
          value={draft.glossaryCategory ?? ''}
          onChange={(v) =>
            setDraft({ ...draft, glossaryCategory: (v || null) as GlossaryCategory | null })
          }
          options={GLOSSARY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
      </Labeled>
      <Labeled label="規則キー">
        <Select
          ariaLabel="規則キー"
          value={draft.ruleKey ?? ''}
          onChange={(v) => setDraft({ ...draft, ruleKey: v || null })}
          options={RULE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
      </Labeled>
      <div className="grid grid-cols-2 gap-2 md:col-span-2">
        <Labeled label="文字数の目安（下限）">
          <input
            type="number"
            className="input"
            value={draft.targetLengthMin ?? ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                targetLengthMin: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </Labeled>
        <Labeled label="文字数の目安（上限）">
          <input
            type="number"
            className="input"
            value={draft.targetLengthMax ?? ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                targetLengthMax: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </Labeled>
      </div>

      <div className="md:col-span-4">
        <Labeled label="生成プロンプト（AIへの指示。ここを直せば出力の傾向を変えられます）">
          <textarea
            className="textarea"
            rows={4}
            value={draft.generationPrompt ?? ''}
            onChange={(e) => setDraft({ ...draft, generationPrompt: e.target.value })}
          />
        </Labeled>
      </div>

      <div className="md:col-span-4">
        <Labeled label="担当者向けの補足（編集画面にヒントとして表示されます）">
          <textarea
            className="textarea"
            rows={2}
            value={draft.helpText ?? ''}
            onChange={(e) => setDraft({ ...draft, helpText: e.target.value })}
          />
        </Labeled>
      </div>

      <div className="flex flex-wrap gap-4 md:col-span-4">
        <label className="flex items-center gap-2 text-xs text-ink-700">
          <input
            type="checkbox"
            checked={draft.displayToggle}
            onChange={(e) => setDraft({ ...draft, displayToggle: e.target.checked })}
          />
          提出先ごとに表示・非表示を切り替えられるようにする
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-700">
          <input
            type="checkbox"
            checked={draft.isRequired}
            onChange={(e) => setDraft({ ...draft, isRequired: e.target.checked })}
          />
          必須
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-700">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
          />
          有効（外すと編集画面にも出なくなります）
        </label>
      </div>

      <div className="md:col-span-4">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const { order: _order, filledCount: _filled, ...rest } = draft;
              const result = await updateFieldAction({
                ...rest,
                // The 表示 switch in the row saves itself; keep what it holds
                // now rather than what this panel was opened with.
                includeInPdf: field.includeInPdf,
                nameEn: draft.nameEn ?? undefined,
                generationPrompt: draft.generationPrompt ?? undefined,
                helpText: draft.helpText ?? undefined,
                sourceCodes: sources
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              });
              onNotice({ ok: result.ok, text: result.message });
            })
          }
        >
          設定を保存
        </button>
      </div>
    </div>
  );
}
