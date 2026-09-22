'use client';

import { useState, useTransition } from 'react';
import type { RecordKind } from '@prisma/client';
import type { SectionView } from '@/lib/sheet/model';
import { SECTION_COLOURS } from '@/components/sheet-document';
import { FieldEditor } from './field-editor';
import {
  addRecordAction,
  deleteRecordAction,
  generateSectionAction,
  setDisplayedRecordsAction,
} from '@/app/(app)/people/[personId]/actions';

/**
 * Repeating sections an operator may add a row to.
 *
 * 日本での業務経験 is the one an engineer fills in themselves after joining —
 * the server side was wired for it all along, but the button was never shown,
 * so the section could never receive a record and, being hideWhenEmpty, never
 * printed. 学歴 is not here: it comes from the form and is not hand-extended.
 */
const ADDABLE_RECORD_KINDS: string[] = ['INTERNSHIP', 'PROJECT', 'WORK_EXPERIENCE'];

export function SectionPanel({
  personId,
  section,
  presetId,
  readOnly,
  editableSectionCodes,
  canSelectRecords = true,
}: {
  personId: string;
  section: SectionView;
  presetId: string | null;
  readOnly: boolean;
  editableSectionCodes: string[] | null;
  /** Whether this user may choose which records print. Engineers may not. */
  canSelectRecords?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const sectionReadOnly =
    readOnly ||
    (editableSectionCodes !== null && !editableSectionCodes.includes(section.code));

  const displayedCount = section.records.filter((r) => r.isDisplayed).length;

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

  const toggleDisplayed = (recordId: string, next: boolean) => {
    if (!presetId) return;
    const current = section.records.filter((r) => r.isDisplayed).map((r) => r.id);
    const ids = next
      ? [...current, recordId]
      : current.filter((id) => id !== recordId);
    run(async () =>
      setDisplayedRecordsAction(personId, {
        presetId,
        kind: section.recordKind as RecordKind,
        recordIds: ids,
      }),
    );
  };

  // The same accent this section is printed in, so the editor and the PDF are
  // recognisably the same section rather than two unrelated lists.
  const colour = SECTION_COLOURS[section.code] ?? { accent: '#044BA7', tint: '#EEF4FD' };

  return (
    <section className="card overflow-hidden" id={`section-${section.code}`}>
      <header
        className="panel-head"
        style={
          {
            '--accent': colour.accent,
            '--accent-tint': colour.tint,
          } as React.CSSProperties
        }
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="panel-title inline-flex items-center gap-1.5"
          aria-expanded={open}
        >
          <span aria-hidden className="text-xs opacity-70">
            {open ? '▾' : '▸'}
          </span>
          {section.nameJa}
        </button>
        {section.nameEn ? (
          <span className="panel-title-en">{section.nameEn}</span>
        ) : null}
        {section.document === 'SUPPLEMENT' ? (
          // Without this an operator could reasonably assume everything on this
          // screen reaches the skill sheet. These sections never do.
          <span className="badge badge-warn" title="この区分はスキルシートには出力されず、補足資料にのみ出力される。">
            補足資料のみ
          </span>
        ) : null}
        {!section.isVisible ? (
          <span className="badge badge-draft">非表示設定</span>
        ) : null}
        {section.hideWhenEmpty && section.isEmpty ? (
          <span className="badge badge-draft">データなしのため出力されない</span>
        ) : null}
        {section.kind === 'REPEATING' ? (
          <span className="panel-head-meta text-xs">
            {section.records.length}件登録／表示{displayedCount}件（上限{section.maxDisplayed}件）
          </span>
        ) : null}

        <span className="flex-1" />

        {!sectionReadOnly ? (
          <>
            {section.kind === 'REPEATING' &&
            ADDABLE_RECORD_KINDS.includes(section.recordKind ?? '') ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={pending}
                onClick={() =>
                  run(async () => addRecordAction(personId, section.recordKind as RecordKind))
                }
              >
                ＋ 追加
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
              onClick={() =>
                run(async () =>
                  generateSectionAction(personId, {
                    sectionId: section.id,
                    sectionCode: section.code,
                  }),
                )
              }
              title="ロック済みの項目は上書きしない"
            >
              {pending ? '生成中…' : 'セクション一括生成'}
            </button>
          </>
        ) : null}
      </header>

      {section.description ? (
        <p className="border-t border-ink-100 bg-sand-50/60 px-4 py-1.5 text-xs text-ink-500">
          {section.description}
        </p>
      ) : null}

      {notice ? (
        <p className="border-t border-ink-100 bg-final-bg px-4 py-1.5 text-xs text-final-ink">
          {notice}
        </p>
      ) : null}
      {warnings.map((w, i) => (
        <p
          key={i}
          className="border-t border-ink-100 bg-draft-bg px-4 py-1.5 text-xs text-draft-ink"
        >
          ⚠ {w}
        </p>
      ))}

      {open ? (
        section.kind === 'REPEATING' ? (
          <div>
            {section.records.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-400">
                レコードがありません。
              </p>
            ) : (
              section.records.map((record, index) => (
                <div key={record.id} className="border-t border-ink-100">
                  <div className="flex flex-wrap items-center gap-2 bg-white px-4 py-2">
                    <span className="text-xs font-semibold text-ink-700">
                      {section.nameJa}
                      {index + 1}
                    </span>
                    <span className="text-xs text-ink-500">{record.label}</span>
                    {record.origin === 'MANUAL' ? (
                      <span className="badge badge-review">画面から追加</span>
                    ) : (
                      <span className="text-xs text-ink-400">
                        {record.sourcePrefix}
                      </span>
                    )}
                    <span className="flex-1" />
                    {/* Offered only to someone the server will actually let
                        do it. An engineer could tick this and watch it snap
                        back with 「権限がない」, with nothing telling them who
                        to ask. */}
                    {presetId && !sectionReadOnly && canSelectRecords ? (
                      <label className="flex items-center gap-1 text-xs text-ink-700">
                        <input
                          type="checkbox"
                          checked={record.isDisplayed}
                          disabled={pending}
                          onChange={(e) => toggleDisplayed(record.id, e.target.checked)}
                        />
                        スキルシートに表示
                      </label>
                    ) : presetId && !sectionReadOnly ? (
                      <span
                        className="text-xs text-ink-400"
                        title="スキルシートに載せる項目は営業・管理者が選びます。"
                      >
                        {record.isDisplayed ? 'シートに掲載' : '未掲載'}
                      </span>
                    ) : null}
                    {!sectionReadOnly ? (
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={pending}
                        onClick={() =>
                          run(async () =>
                            deleteRecordAction(personId, {
                              recordId: record.id,
                              sectionCode: section.code,
                            }),
                          )
                        }
                      >
                        削除
                      </button>
                    ) : null}
                  </div>
                  {record.fields.map((field) => (
                    <FieldEditor
                      key={field.id}
                      personId={personId}
                      sectionCode={section.code}
                      field={field}
                      recordId={record.id}
                      readOnly={sectionReadOnly}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        ) : (
          <div>
            {section.fields.map((field) => (
              <FieldEditor
                key={field.id}
                personId={personId}
                sectionCode={section.code}
                field={field}
                readOnly={sectionReadOnly}
              />
            ))}
          </div>
        )
      ) : null}
    </section>
  );
}
