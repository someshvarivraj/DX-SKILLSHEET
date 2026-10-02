'use client';

import { useLang, useT } from '@/lib/i18n/client';
import { pickName } from '@/lib/i18n';
import { SECTION_PALETTE, paletteColour } from '@/lib/sheet/section-colours';
import { useRef, useState, useTransition } from 'react';
import { TemplatePreviewOverlay } from './template-preview-overlay';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Eye,
  EyeOff,
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
  setFieldRequiredAction,
  setSectionFieldsRequiredAction,
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
  /** Candidates with data in this field — named before a delete. */
  filledPeople: string[];
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
  /** The chosen palette key, or null for automatic. */
  colour: string | null;
  /** The colour it actually prints in (automatic resolved). */
  colourKey: string;
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
  const t = useT();
  return (
    <div className="def-move">
      <button
        type="button"
        className="icon-btn"
        disabled={disabled || index === 0}
        onClick={() => onMove(index - 1)}
        aria-label={t('{name}を1つ上へ', { name: label })}
        title={t('1つ上へ')}
      >
        <ArrowUp size={16} aria-hidden />
      </button>
      <button
        type="button"
        className="icon-btn"
        disabled={disabled || index === count - 1}
        onClick={() => onMove(index + 1)}
        aria-label={t('{name}を1つ下へ', { name: label })}
        title={t('1つ下へ')}
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
  const t = useT();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={checked ? t('表示中（押すと非表示）') : t('非表示（押すと表示）')}
      className="switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" aria-hidden />
    </button>
  );
}

/** A checkbox that saves itself, and goes back if the save fails. */
function SavingCheckbox({
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
  const t = useT();
  const [value, setValue] = useState(initial);
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setValue(initial);
  }
  const [pending, startTransition] = useTransition();
  return (
    <input
      type="checkbox"
      className="def-required-checkbox"
      checked={value}
      disabled={pending}
      aria-label={label}
      title={
        value
          ? t('必須：空欄でもシートに表示する（押すと任意に）')
          : t('任意：入力があるときだけシートに表示する（押すと必須に）')
      }
      onChange={(e) => {
        const next = e.target.checked;
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

/**
 * The section header's 必須 checkbox. It has no state of its own — it
 * reflects the fields inside the section (all / some / none required) and,
 * when clicked, bulk-sets every field in one step. `indeterminate` can only be
 * set imperatively on the DOM node, not as a JSX prop.
 */
function SectionRequiredCheckbox({
  section,
  onNotice,
}: {
  section: SectionRow;
  onNotice: (n: Notice) => void;
}) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const activeFields = section.fields.filter((f) => f.isActive);
  const requiredCount = activeFields.filter((f) => f.isRequired).length;
  const allRequired = activeFields.length > 0 && requiredCount === activeFields.length;
  const someRequired = requiredCount > 0 && !allRequired;

  if (ref.current) ref.current.indeterminate = someRequired;

  return (
    <input
      ref={ref}
      type="checkbox"
      className="def-required-checkbox"
      checked={allRequired}
      disabled={pending || activeFields.length === 0}
      aria-label={t('{name}の項目をすべて必須にする', { name: section.nameJa })}
      title={
        activeFields.length === 0
          ? t('項目がありません')
          : allRequired
            ? t('すべて必須：空欄でもシートに表示する（押すとすべて任意に）')
            : t('押すとこのセクションの項目をすべて必須（空欄でもシートに表示）にする')
      }
      onChange={(e) => {
        const next = e.target.checked;
        startTransition(async () => {
          const result = await setSectionFieldsRequiredAction(section.id, next);
          onNotice({ ok: result.ok, text: result.message });
        });
      }}
    />
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
  const t = useT();
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
  confirmLabel,
  confirmKind = 'delete',
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
  /** Overrides 「削除する」; null hides the button (nothing to confirm). */
  confirmLabel?: string | null;
  confirmKind?: 'delete' | 'primary';
}) {
  const t = useT();
  return (
    <div className="def-confirm" role="alertdialog" aria-live="assertive">
      <AlertTriangle size={16} aria-hidden className="flex-none" />
      <p className="flex-1">{message}</p>
      <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={pending}>
        {t('キャンセル')}
      </button>
      {confirmLabel === null ? null : (
        <button
          type="button"
          className={`btn ${confirmKind === 'primary' ? 'btn-primary' : 'btn-delete'}`}
          onClick={onConfirm}
          disabled={pending}
        >
          {confirmLabel ?? (pending ? t('削除中…') : t('削除する'))}
        </button>
      )}
    </div>
  );
}

/**
 * Deleting a field that holds candidates' data. Hiding it (「不要にする」) is the
 * first choice offered — the data stays and can be shown again — and deleting
 * anyway needs an explicit tick, after the screen has said whose data goes.
 */
function FieldDeleteDialog({
  field,
  pending,
  onHide,
  onDelete,
  onCancel,
}: {
  field: FieldRow;
  pending: boolean;
  onHide: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [understood, setUnderstood] = useState(false);
  const people = field.filledPeople;
  const shown = people.slice(0, 12);
  return (
    <div className="def-confirm def-confirm-stack" role="alertdialog" aria-live="assertive">
      <p className="def-confirm-title">
        <AlertTriangle size={16} aria-hidden className="flex-none" />
        {t('「{name}」には、次の候補者{n}人のデータがあります。', { name: field.nameJa, n: people.length })}
      </p>
      <ul className="def-confirm-people">
        {shown.map((name) => (
          <li key={name}>{name}</li>
        ))}
        {people.length > shown.length ? (
          <li>{t('ほか{n}人', { n: people.length - shown.length })}</li>
        ) : null}
      </ul>
      <p>
        {t('削除すると、これらのデータも消え、元に戻せません。')}
        {field.includeInPdf
          ? t('スキルシートに出したくないだけなら「不要にする」を使ってください。データは残り、シートには表示されません。後から元に戻せます。')
          : t('この項目はすでに「不要」（シートに表示しない）になっています。データを残すなら、削除せずにこのままにしてください。')}
      </p>
      <label className="def-confirm-check">
        <input
          type="checkbox"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          disabled={pending}
        />
        {t('データが消えることを理解したうえで削除する')}
      </label>
      <div className="def-confirm-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={pending}>
          {t('キャンセル')}
        </button>
        <button
          type="button"
          className="btn btn-delete"
          onClick={onDelete}
          disabled={pending || !understood}
        >
          {pending ? t('削除中…') : t('それでも削除する')}
        </button>
        {field.includeInPdf ? (
          <button type="button" className="btn btn-primary" onClick={onHide} disabled={pending}>
            <EyeOff size={16} aria-hidden />
            {t('不要にする')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  const t = useT();
  if (!notice) return null;
  return (
    <p className={`def-notice ${notice.ok ? 'def-notice-ok' : 'def-notice-error'}`} role="status">
      {t(notice.text)}
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
  const t = useT();
  const [notice, setNotice] = useState<Notice>(null);
  const reorder = useReorder(sections, reorderSectionsAction, setNotice);
  const colourUsage = new Map<string, SectionRow>();
  for (const s of sections) if (!colourUsage.has(s.colourKey)) colourUsage.set(s.colourKey, s);
  // Sano-san's review (2026-09-29): two full-width dashed buttons (one above
  // the list, one below) read as confusing, and the bottom one required
  // scrolling past every section to reach anyway. One compact button in the
  // header bar replaces both — new sections always go to the top, where they
  // are immediately visible, and can be moved anywhere with drag/↑↓.
  const [adding, setAdding] = useState(false);

  return (
    <div className="def-table">
      <div className="def-bar">
        <h2 className="def-bar-title">{t('セクション一覧')}</h2>
        <span className="def-bar-meta">{t('{n}件', { n: sections.length })}</span>
        <span className="flex-1" />
        <button type="button" className="def-bar-add" onClick={() => setAdding((v) => !v)}>
          <Plus size={14} aria-hidden /> {t('セクションを追加')}
        </button>
      </div>

      <NoticeLine notice={notice} />

      {adding ? (
        <AddSectionForm
          position="first"
          onDone={(result) => {
            setNotice({ ok: result.ok, text: result.message });
            if (result.ok) setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      <div className="def-row def-head" aria-hidden>
        <span>{t('並び替え')}</span>
        <span>{t('セクション名')}</span>
        <span className="def-col-meta">{t('内容')}</span>
        <span className="text-center">{t('表示')}</span>
        <span className="text-center">{t('必須')}</span>
        <span className="text-center">{t('削除')}</span>
        <span className="text-center">{t('詳細')}</span>
      </div>

      {reorder.ordered.map((section, index) => (
        <SectionItem
          key={section.id}
          section={section}
          colourUsage={colourUsage}
          index={index}
          count={reorder.ordered.length}
          reorder={reorder}
          questionCodes={questionCodes}
          onNotice={setNotice}
        />
      ))}
    </div>
  );
}

function SectionItem({
  section,
  colourUsage,
  index,
  count,
  reorder,
  questionCodes,
  onNotice,
}: {
  section: SectionRow;
  /** Which section prints in each colour, to steer away from duplicates. */
  colourUsage: Map<string, SectionRow>;
  index: number;
  count: number;
  reorder: ReturnType<typeof useReorder<SectionRow>>;
  questionCodes: string[];
  onNotice: (n: Notice) => void;
}) {
  const t = useT();
  const lang = useLang();
  const rowRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
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
          title={t('ドラッグして並べ替え')}
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
        <div className="def-name-cell">
          <button type="button" className="def-name" onClick={() => setOpen((v) => !v)}>
            <span className="def-name-ja">
              <span
                className="colour-dot"
                style={{ background: paletteColour(section.colourKey)?.accent }}
                title={t('シートの色')}
                aria-hidden
              />
              {pickName(lang, section.nameJa, section.nameEn)}
            </span>
            <span className="def-name-sub">
              {lang === 'en' ? section.nameJa : (section.nameEn ?? section.code)}
            </span>
          </button>
          <button
            type="button"
            className={`icon-btn flex-none ${previewOpen ? 'icon-btn-active' : ''}`}
            onClick={() => setPreviewOpen((v) => !v)}
            aria-expanded={previewOpen}
            aria-label={t('「{name}」だけをプレビューする', { name: section.nameJa })}
            title={previewOpen ? t('プレビューを閉じる') : t('このセクションだけをプレビュー')}
          >
            <Eye size={16} aria-hidden />
          </button>
        </div>
        <span className="def-col-meta def-meta">
          {section.kind === 'REPEATING'
            ? t('繰り返し・最大{n}件', { n: section.maxDisplayed })
            : t('単一')}
          {t('・項目{n}件', { n: section.fields.length })}
        </span>
        <span className="grid place-items-center">
          <SavingSwitch
            initial={section.isVisible}
            label={t('{name}をシートに表示する', { name: section.nameJa })}
            save={(next) => setSectionVisibleAction(section.id, next)}
            onNotice={onNotice}
          />
        </span>
        <span className="grid place-items-center">
          <SectionRequiredCheckbox section={section} onNotice={onNotice} />
        </span>
        <span className="grid place-items-center">
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            onClick={() => setConfirming(true)}
            aria-label={t('{name}を削除', { name: section.nameJa })}
            title={t('削除')}
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
            aria-label={t(open ? '{name}の項目と設定を閉じる' : '{name}の項目と設定を開く', { name: section.nameJa })}
            title={open ? t('閉じる') : t('項目と設定を開く')}
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
              ? t(
                  '「{name}」には項目が{n}件あり、候補者のデータが入っている可能性があるため、このままでは削除できません。スキルシートに出したくないだけなら「不要にする」を使ってください。データは残り、後から元に戻せます。',
                  { name: section.nameJa, n: section.fields.length },
                )
              : t('「{name}」を削除します。元には戻せません。', { name: section.nameJa })
          }
          onCancel={() => setConfirming(false)}
          confirmLabel={section.fields.length > 0 ? (section.isVisible ? t('不要にする') : null) : undefined}
          confirmKind={section.fields.length > 0 ? 'primary' : 'delete'}
          onConfirm={() =>
            section.fields.length > 0
              ? startTransition(async () => {
                  const result = await setSectionVisibleAction(section.id, false);
                  onNotice({
                    ok: result.ok,
                    text: result.ok
                      ? t('「{name}」を不要にしました（データは残っています）', { name: section.nameJa })
                      : result.message,
                  });
                  setConfirming(false);
                })
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
          <SectionSettings section={section} colourUsage={colourUsage} onNotice={onNotice} />
          <FieldList section={section} questionCodes={questionCodes} onNotice={onNotice} />
        </div>
      ) : null}

      {previewOpen ? (
        <TemplatePreviewOverlay
          sectionCode={section.code}
          title={t('セクションのプレビュー: {name}', { name: pickName(lang, section.nameJa, section.nameEn) })}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </div>
  );
}

function SectionSettings({
  section,
  colourUsage,
  onNotice,
}: {
  section: SectionRow;
  colourUsage: Map<string, SectionRow>;
  onNotice: (n: Notice) => void;
}) {
  const t = useT();
  const lang = useLang();
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
        {t('セクションの設定（名前・表示件数など）')}
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
          <div className="md:col-span-4">
            <Labeled label="シートの色">
              <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t('シートの色')}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={draft.colour === null}
                  className={`colour-auto ${draft.colour === null ? 'colour-selected' : ''}`}
                  onClick={() => setDraft({ ...draft, colour: null })}
                  title={t('他のセクションと重ならない色を自動で選びます')}
                >
                  {t('自動')}
                </button>
                {SECTION_PALETTE.map((c) => {
                  const other = colourUsage.get(c.key);
                  const takenByOther = other && other.id !== section.id;
                  const selected = draft.colour === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={lang === 'en' ? c.nameEn : c.nameJa}
                      title={
                        takenByOther
                          ? t('{colour}（「{name}」で使用中）', {
                              colour: lang === 'en' ? c.nameEn : c.nameJa,
                              name: pickName(lang, other.nameJa, other.nameEn),
                            })
                          : lang === 'en'
                            ? c.nameEn
                            : c.nameJa
                      }
                      className={`colour-swatch ${selected ? 'colour-selected' : ''} ${takenByOther ? 'colour-taken' : ''}`}
                      style={{ background: c.accent }}
                      onClick={() => setDraft({ ...draft, colour: c.key })}
                    />
                  );
                })}
              </div>
              <p className="field-hint">
                {t('斜線の色は他のセクションで使われています。同じ色にすると、シート上で区別しにくくなります。')}
              </p>
            </Labeled>
          </div>
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
                    colour: draft.colour,
                  });
                  onNotice({ ok: result.ok, text: result.message });
                })
              }
            >
              {t('設定を保存')}
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
  const t = useT();
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
      <div className="flex items-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={pending}>
          {t('キャンセル')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !nameJa.trim()}
          onClick={() =>
            startTransition(async () => {
              onDone(await createSectionAction({ nameJa, nameEn, position }));
            })
          }
        >
          {t('追加する')}
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
  const t = useT();
  const lang = useLang();
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
        <span>{t('並び替え')}</span>
        <span>{t('項目名')}</span>
        <span className="def-col-meta">{t('処理・取得元')}</span>
        <span className="text-center">{t('表示')}</span>
        <span className="text-center">{t('必須')}</span>
        <span className="text-center">{t('削除')}</span>
        <span className="text-center">{t('詳細')}</span>
      </div>
      {reorder.ordered.length === 0 ? (
        <p className="px-4 py-4 text-center text-xs text-ink-500">{t('項目はまだありません。')}</p>
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
          <Plus size={16} aria-hidden />{' '}
          {t('「{name}」に項目を追加する', { name: pickName(lang, section.nameJa, section.nameEn) })}
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
  const t = useT();
  const lang = useLang();
  const rowRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const processingLabel = PROCESSING_OPTIONS.find((o) => o.value === field.processing)?.label;
  const processing = processingLabel ? t(processingLabel) : undefined;

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
          title={t('ドラッグして並べ替え')}
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
            {pickName(lang, field.nameJa, field.nameEn)}
            {field.isRequired ? <span className="def-required">{t('必須')}</span> : null}
            {!field.isActive ? <span className="def-tag">{t('無効')}</span> : null}
          </span>
          <span className="def-name-sub">{field.code}</span>
        </button>
        <span className="def-col-meta def-meta">
          <span className="def-tag def-tag-blue">{processing}</span>
          {field.sourceCodes.length > 0 ? field.sourceCodes.join(' + ') : t('取得元なし')}
        </span>
        <span className="grid place-items-center">
          <SavingSwitch
            initial={field.includeInPdf}
            label={t('{name}をシートに表示する', { name: field.nameJa })}
            save={(next) => setFieldPrintedAction(field.id, next)}
            onNotice={onNotice}
          />
        </span>
        <span className="grid place-items-center">
          <SavingCheckbox
            initial={field.isRequired}
            label={t('{name}を必須にする', { name: field.nameJa })}
            save={(next) => setFieldRequiredAction(field.id, next)}
            onNotice={onNotice}
          />
        </span>
        <span className="grid place-items-center">
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            onClick={() => setConfirming(true)}
            aria-label={t('{name}を削除', { name: field.nameJa })}
            title={t('削除')}
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
            aria-label={t(open ? '{name}の詳しい設定を閉じる' : '{name}の詳しい設定を開く', { name: field.nameJa })}
            title={open ? t('閉じる') : t('詳しい設定を開く')}
          >
            <ChevronRight size={20} aria-hidden className={`def-chevron ${open ? 'rotate-90' : ''}`} />
          </button>
        </span>
      </div>

      {confirming && field.filledPeople.length > 0 ? (
        <FieldDeleteDialog
          field={field}
          pending={pending}
          onCancel={() => setConfirming(false)}
          onHide={() =>
            startTransition(async () => {
              const result = await setFieldPrintedAction(field.id, false);
              onNotice({
                ok: result.ok,
                text: result.ok ? t('「{name}」を不要にしました（データは残っています）', { name: field.nameJa }) : result.message,
              });
              setConfirming(false);
            })
          }
          onDelete={() =>
            startTransition(async () => {
              const result = await deleteFieldAction(field.id, { confirmDataLoss: true });
              onNotice({ ok: result.ok, text: result.message });
              setConfirming(false);
            })
          }
        />
      ) : confirming ? (
        <DeleteConfirm
          pending={pending}
          message={t('「{name}」を削除します。元には戻せません。', { name: field.nameJa })}
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
  const t = useT();
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-700">{t(label)}</label>
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
  const t = useT();
  const [nameJa, setNameJa] = useState('');
  const [processing, setProcessing] = useState<Processing>('COPY');
  const [sources, setSources] = useState('');
  const [pending, startTransition] = useTransition();

  return (
    <div className="def-add-form">
      <Labeled label="表示名">
        <input className="input" value={nameJa} onChange={(e) => setNameJa(e.target.value)} />
      </Labeled>
      <Labeled label="処理区分">
        <Select
          ariaLabel={t('処理区分')}
          value={processing}
          onChange={(v) => setProcessing(v as Processing)}
          options={PROCESSING_OPTIONS.map((o) => ({
            value: o.value,
            label: t(o.label),
            hint: t(o.hint),
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
          {t('キャンセル')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !nameJa.trim()}
          onClick={() =>
            startTransition(async () => {
              onDone(
                await createFieldAction({
                  sectionId,
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
          {t('追加する')}
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
  const t = useT();
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
          ariaLabel={t('処理方法')}
          value={draft.processing}
          onChange={(v) => setDraft({ ...draft, processing: v as Processing })}
          options={PROCESSING_OPTIONS.map((o) => ({
            value: o.value,
            label: t(o.label),
            hint: t(o.hint),
          }))}
        />
        <p className="mt-1 text-xs text-ink-500">
          {t(PROCESSING_OPTIONS.find((o) => o.value === draft.processing)?.hint ?? '')}
        </p>
      </Labeled>
      <Labeled label="編集方法">
        <Select
          ariaLabel={t('編集方法')}
          value={draft.editing}
          onChange={(v) => setDraft({ ...draft, editing: v as Editing })}
          options={EDITING_OPTIONS.map((o) => ({ ...o, label: t(o.label), hint: t(o.hint) }))}
        />
      </Labeled>
      <Labeled label="値の型">
        <Select
          ariaLabel={t('値の種類')}
          value={draft.valueType}
          onChange={(v) => setDraft({ ...draft, valueType: v as ValueType })}
          options={VALUE_TYPE_OPTIONS.map((o) => ({ ...o, label: t(o.label), hint: o.hint ? t(o.hint) : undefined }))}
        />
      </Labeled>

      <div className="md:col-span-4">
        <Labeled label="取得元の設問ID（カンマ区切り。繰り返し項目は E-x-6 のように x を使う）">
          <input className="input" value={sources} onChange={(e) => setSources(e.target.value)} />
        </Labeled>
        {unknownSources.length > 0 ? (
          <p className="mt-1 text-xs text-draft-ink">
            ⚠ {t('現在のフォームに存在しない設問ID')}: {unknownSources.join('、')}
          </p>
        ) : null}
      </div>

      <Labeled label="辞書の分類">
        <Select
          ariaLabel={t('辞書の分類')}
          value={draft.glossaryCategory ?? ''}
          onChange={(v) =>
            setDraft({ ...draft, glossaryCategory: (v || null) as GlossaryCategory | null })
          }
          options={GLOSSARY_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
        />
      </Labeled>
      <Labeled label="規則キー">
        <Select
          ariaLabel={t('規則キー')}
          value={draft.ruleKey ?? ''}
          onChange={(v) => setDraft({ ...draft, ruleKey: v || null })}
          options={RULE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
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
          {t('提出先ごとに表示・非表示を切り替えられるようにする')}
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-700">
          <input
            type="checkbox"
            checked={draft.isRequired}
            onChange={(e) => setDraft({ ...draft, isRequired: e.target.checked })}
          />
          {t('必須')}
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-700">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
          />
          {t('有効（外すと編集画面にも出なくなります）')}
        </label>
      </div>

      <div className="md:col-span-4">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const { order: _order, filledPeople: _filled, ...rest } = draft;
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
          {t('設定を保存')}
        </button>
      </div>
    </div>
  );
}
