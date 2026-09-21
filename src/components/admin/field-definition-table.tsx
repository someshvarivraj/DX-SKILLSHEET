'use client';

import { useState, useTransition } from 'react';
import { Select } from '@/components/ui/select';
import type {
  Editing,
  GlossaryCategory,
  Processing,
  ValueType,
} from '@prisma/client';
import {
  createFieldAction,
  updateFieldAction,
  updateSectionAction,
} from '@/app/(app)/admin/fields/actions';

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

export function FieldDefinitionTable({
  sections,
  questionCodes,
}: {
  sections: SectionRow[];
  questionCodes: string[];
}) {
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <SectionBlock key={section.id} section={section} questionCodes={questionCodes} />
      ))}
    </div>
  );
}

function SectionBlock({
  section,
  questionCodes,
}: {
  section: SectionRow;
  questionCodes: string[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(section);

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 bg-sand-50 px-4 py-2.5">
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-sm font-semibold">
          {open ? '▾' : '▸'} {section.nameJa}
        </button>
        <code className="rounded bg-white px-1.5 py-0.5 text-xs text-ink-500">
          {section.code}
        </code>
        <span className="text-xs text-ink-400">
          表示順 {section.order}・{section.kind === 'REPEATING' ? '繰り返し' : '単一'}
          {section.kind === 'REPEATING' ? `・最大${section.maxDisplayed}件表示` : ''}
        </span>
        {!section.isVisible ? <span className="badge badge-draft">非表示</span> : null}
        {section.hideWhenEmpty ? (
          <span className="badge badge-review">データなしで非表示</span>
        ) : null}
        <span className="flex-1" />
        <button type="button" className="btn btn-secondary" onClick={() => setEditing((v) => !v)}>
          セクション設定
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setAdding((v) => !v)}>
          ＋ 項目を追加
        </button>
      </header>

      {notice ? (
        <p className="bg-final-bg px-4 py-1.5 text-xs text-final-ink">{notice}</p>
      ) : null}

      {editing ? (
        <div className="grid gap-3 border-t border-ink-100 bg-sand-50/60 p-4 md:grid-cols-4">
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
          <Labeled label="表示順">
            <input
              type="number"
              className="input"
              value={draft.order}
              onChange={(e) => setDraft({ ...draft, order: Number(e.target.value) })}
            />
          </Labeled>
          <Labeled label="最大表示件数">
            <input
              type="number"
              className="input"
              value={draft.maxDisplayed}
              onChange={(e) => setDraft({ ...draft, maxDisplayed: Number(e.target.value) })}
            />
          </Labeled>
          <label className="flex items-center gap-2 text-xs text-ink-700">
            <input
              type="checkbox"
              checked={draft.isVisible}
              onChange={(e) => setDraft({ ...draft, isVisible: e.target.checked })}
            />
            スキルシートに出力する
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-700">
            <input
              type="checkbox"
              checked={draft.hideWhenEmpty}
              onChange={(e) => setDraft({ ...draft, hideWhenEmpty: e.target.checked })}
            />
            データが1件もない場合は非表示にする
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
                    order: draft.order,
                    isVisible: draft.isVisible,
                    hideWhenEmpty: draft.hideWhenEmpty,
                    maxDisplayed: draft.maxDisplayed,
                    description: draft.description ?? undefined,
                  });
                  setNotice(result.message);
                  setEditing(false);
                })
              }
            >
              保存
            </button>
          </div>
        </div>
      ) : null}

      {adding ? (
        <AddFieldForm
          sectionId={section.id}
          onDone={(message) => {
            setNotice(message);
            setAdding(false);
          }}
        />
      ) : null}

      {open ? (
        <div className="divide-y divide-ink-100">
          {section.fields.map((field) => (
            <FieldRowEditor key={field.id} field={field} questionCodes={questionCodes} />
          ))}
        </div>
      ) : null}
    </section>
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
}: {
  sectionId: string;
  onDone: (message: string) => void;
}) {
  const [code, setCode] = useState('');
  const [nameJa, setNameJa] = useState('');
  const [processing, setProcessing] = useState<Processing>('COPY');
  const [sources, setSources] = useState('');
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-3 border-t border-ink-100 bg-final-bg/40 p-4 md:grid-cols-5">
      <Labeled label="項目コード（英数字）">
        <input className="input" value={code} onChange={(e) => setCode(e.target.value)} />
      </Labeled>
      <Labeled label="表示名">
        <input className="input" value={nameJa} onChange={(e) => setNameJa(e.target.value)} />
      </Labeled>
      <Labeled label="処理区分">
        <div className="w-56">
          <Select
            ariaLabel="処理方法で絞り込む"
            value={processing}
            onChange={(v) => setProcessing(v as Processing)}
            options={PROCESSING_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
              hint: o.hint,
            }))}
          />
        </div>
      </Labeled>
      <Labeled label="取得元の設問ID（カンマ区切り）">
        <input
          className="input"
          placeholder="A-1-1, A-1-2"
          value={sources}
          onChange={(e) => setSources(e.target.value)}
        />
      </Labeled>
      <div className="flex items-end">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !code || !nameJa}
          onClick={() =>
            startTransition(async () => {
              const result = await createFieldAction({
                sectionId,
                code: code.trim(),
                nameJa: nameJa.trim(),
                processing,
                sourceCodes: sources
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              });
              onDone(result.message);
            })
          }
        >
          追加
        </button>
      </div>
    </div>
  );
}

function FieldRowEditor({
  field,
  questionCodes,
}: {
  field: FieldRow;
  questionCodes: string[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(field);
  const [sources, setSources] = useState(field.sourceCodes.join(', '));
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const unknownSources = sources
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((code) => !questionCodes.includes(code) && !code.includes('-x-'));

  return (
    <div className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-sm text-ink-900">
          {open ? '▾' : '▸'} {field.nameJa}
        </button>
        <code className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-ink-500">
          {field.code}
        </code>
        <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-ink-500">
          {PROCESSING_OPTIONS.find((o) => o.value === field.processing)?.label}
        </span>
        <span className="text-xs text-ink-400">
          {field.sourceCodes.length > 0 ? field.sourceCodes.join(' + ') : '取得元なし'}
        </span>
        {!field.includeInPdf ? <span className="badge badge-draft">PDF非出力</span> : null}
        {!field.isActive ? <span className="badge badge-warn">無効</span> : null}
      </div>

      {notice ? <p className="mt-1 text-xs text-final-ink">{notice}</p> : null}

      {open ? (
        <div className="mt-3 grid gap-3 rounded-md bg-sand-50 p-3 md:grid-cols-4">
          <Labeled label="表示名">
            <input
              className="input"
              value={draft.nameJa}
              onChange={(e) => setDraft({ ...draft, nameJa: e.target.value })}
            />
          </Labeled>
          <Labeled label="表示順">
            <input
              type="number"
              className="input"
              value={draft.order}
              onChange={(e) => setDraft({ ...draft, order: Number(e.target.value) })}
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

          <Labeled label="値の型">
            <Select
              ariaLabel="値の種類"
              value={draft.valueType}
              onChange={(v) => setDraft({ ...draft, valueType: v as ValueType })}
              options={VALUE_TYPE_OPTIONS}
            />
          </Labeled>
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
          <div className="grid grid-cols-2 gap-2">
            <Labeled label="目安（下限）">
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
            <Labeled label="目安（上限）">
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
            <Labeled label="生成プロンプト（AIへの指示。ここを直せば出力の傾向を変えられる）">
              <textarea
                className="textarea"
                rows={4}
                value={draft.generationPrompt ?? ''}
                onChange={(e) => setDraft({ ...draft, generationPrompt: e.target.value })}
              />
            </Labeled>
          </div>

          <div className="md:col-span-4">
            <Labeled label="担当者向けの補足（編集画面にヒントとして表示される）">
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
                checked={draft.includeInPdf}
                onChange={(e) => setDraft({ ...draft, includeInPdf: e.target.checked })}
              />
              PDFに出力する
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-700">
              <input
                type="checkbox"
                checked={draft.displayToggle}
                onChange={(e) => setDraft({ ...draft, displayToggle: e.target.checked })}
              />
              提出先ごとに表示/非表示を切り替えられるようにする
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
              有効
            </label>
          </div>

          <div className="md:col-span-4">
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await updateFieldAction({
                    ...draft,
                    nameEn: draft.nameEn ?? undefined,
                    generationPrompt: draft.generationPrompt ?? undefined,
                    helpText: draft.helpText ?? undefined,
                    sourceCodes: sources
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  });
                  setNotice(result.message);
                })
              }
            >
              保存
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
