'use client';

import { useTransition, useState } from 'react';
import type { RecordKind } from '@prisma/client';
import type { SectionView } from '@/lib/sheet/model';
import { FieldEditor, FieldMenu } from './field-editor';
import { MoraBot, MoraBotProgress } from '@/components/morabot';
import { useLang, useT } from '@/lib/i18n/client';
import { pickName } from '@/lib/i18n';
import {
  addRecordAction,
  deleteRecordAction,
  generateSectionAction,
  setDisplayedRecordsAction,
} from '@/app/(app)/people/[personId]/actions';

/**
 * Repeating sections an operator may add a row to.
 *
 * 日本での業務経験 is the one an engineer fills in themselves after joining.
 * 学歴 is not here: it comes from the form and is not hand-extended.
 */
const ADDABLE_RECORD_KINDS: string[] = ['INTERNSHIP', 'PROJECT', 'WORK_EXPERIENCE'];

export function SectionPanel({
  personId,
  section,
  presetId,
  readOnly,
  editableSectionCodes,
  canSelectRecords = true,
  replacements = {},
}: {
  personId: string;
  section: SectionView;
  presetId: string | null;
  readOnly: boolean;
  editableSectionCodes: string[] | null;
  /** Whether this user may choose which records print. Engineers may not. */
  canSelectRecords?: boolean;
  /**
   * Content shown in place of a field, keyed by field code — the photo
   * uploader takes the place of the プロフィール写真 definition.
   */
  replacements?: Record<string, React.ReactNode>;
}) {
  const t = useT();
  const lang = useLang();
  const sectionName = pickName(lang, section.nameJa, section.nameEn);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);

  const sectionReadOnly =
    readOnly || (editableSectionCodes !== null && !editableSectionCodes.includes(section.code));

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
    const ids = next ? [...current, recordId] : current.filter((id) => id !== recordId);
    run(async () =>
      setDisplayedRecordsAction(personId, {
        presetId,
        kind: section.recordKind as RecordKind,
        recordIds: ids,
      }),
    );
  };

  const canAdd =
    !sectionReadOnly &&
    section.kind === 'REPEATING' &&
    ADDABLE_RECORD_KINDS.includes(section.recordKind ?? '');

  return (
    <section className="card overflow-hidden" id={`section-${section.code}`}>
      <header className="panel-head">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="panel-title">{sectionName}</h2>
            {section.document === 'SUPPLEMENT' ? (
              // Without this an operator could reasonably assume everything on
              // this screen reaches the skill sheet. These sections never do.
              <span
                className="tag"
                title={t('スキルシートには載らず、社内用の補足資料にだけ載ります。')}
              >
                {t('社内用（シートに載りません）')}
              </span>
            ) : null}
            {!section.isVisible ? <span className="tag">{t('非表示')}</span> : null}
          </div>
          {section.kind === 'REPEATING' ? (
            <p className="panel-head-meta">
              {t('{n}件のうち{shown}件をシートに掲載（最大{max}件）', {
                n: section.records.length,
                shown: displayedCount,
                max: section.maxDisplayed,
              })}
            </p>
          ) : section.description && lang === 'ja' ? (
            <p className="panel-head-meta">{section.description}</p>
          ) : null}
        </div>

        <span className="flex-1" />

        {canAdd ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() =>
              run(async () => addRecordAction(personId, section.recordKind as RecordKind))
            }
          >
            ＋ {t('追加')}
          </button>
        ) : null}
        {!sectionReadOnly ? (
          <FieldMenu
            label={t('このセクションの操作')}
            items={[
              {
                label: pending ? t('作成中…') : t('このセクションをAIでまとめて作成'),
                disabled: pending,
                onClick: () => {
                  // Before the transition, so the progress shows at once.
                  setGenerating(true);
                  run(async () => {
                    try {
                      return await generateSectionAction(personId, {
                        sectionId: section.id,
                        sectionCode: section.code,
                      });
                    } finally {
                      setGenerating(false);
                    }
                  });
                },
              },
            ]}
          />
        ) : null}
      </header>

      {generating ? (
        <div className="border-b border-ink-100 px-5 py-4">
          <MoraBotProgress
            label={t('モラボットがこのセクションの文章を作成中です…')}
            detail={t('項目の数によって1〜2分かかります')}
          />
        </div>
      ) : null}
      {notice ? (
        <p className="border-b border-ink-100 bg-final-bg px-5 py-2 text-sm text-final-ink">
          {t(notice)}
        </p>
      ) : null}
      {warnings.map((w, i) => (
        <p key={i} className="border-b border-ink-100 bg-warn-bg px-5 py-2 text-sm text-warn-ink">
          ⚠ {t(w)}
        </p>
      ))}

      {section.kind === 'REPEATING' ? (
        section.records.length === 0 ? (
          <div className="flex items-center justify-center gap-3 px-5 py-10 text-sm text-ink-500">
            <MoraBot mood="explain" size={52} title="" />
            {t('まだ登録がありません。')}
            {canAdd ? t('「＋ 追加」から登録できます。') : ''}
          </div>
        ) : (
          section.records.map((record, index) => (
            <div key={record.id} className="border-b border-ink-100 last:border-0">
              <div className="flex flex-wrap items-center gap-3 bg-sand-50 px-5 py-2.5">
                <span className="text-sm font-semibold text-ink-900">
                  {index + 1}. {record.label || sectionName}
                </span>
                <span className="flex-1" />
                {/* Offered only to someone the server will actually let do
                    it; an engineer sees the state instead. */}
                {presetId && !sectionReadOnly && canSelectRecords ? (
                  <label className="review-check">
                    <input
                      type="checkbox"
                      checked={record.isDisplayed}
                      disabled={pending}
                      onChange={(e) => toggleDisplayed(record.id, e.target.checked)}
                    />
                    {t('シートに載せる')}
                  </label>
                ) : presetId ? (
                  <span className="tag">{record.isDisplayed ? t('シートに掲載') : t('未掲載')}</span>
                ) : null}
                {!sectionReadOnly ? (
                  <button
                    type="button"
                    className="btn btn-quiet !text-[#b03a22]"
                    disabled={pending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          t('「{name}」を削除します。よろしいですか？', {
                            name: record.label || `${sectionName}${index + 1}`,
                          }),
                        )
                      )
                        return;
                      run(async () =>
                        deleteRecordAction(personId, {
                          recordId: record.id,
                          sectionCode: section.code,
                        }),
                      );
                    }}
                  >
                    {t('削除')}
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
        )
      ) : (
        section.fields.map((field) =>
          field.code in replacements ? (
            <div key={field.id} className="field-block">
              {replacements[field.code]}
            </div>
          ) : (
            <FieldEditor
              key={field.id}
              personId={personId}
              sectionCode={section.code}
              field={field}
              readOnly={sectionReadOnly}
            />
          ),
        )
      )}
    </section>
  );
}
