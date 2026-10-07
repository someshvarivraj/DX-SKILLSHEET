'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import type { SheetModel } from '@/lib/sheet/model';
import { withBasePath } from '@/lib/base-path';
import {
  finaliseAction,
  submitForReviewAction,
} from '@/app/(app)/people/[personId]/actions';
import { saveEditingPosition } from './scroll-restore';
import { FieldMenu } from './field-editor';
import { MoraBot } from '@/components/morabot';
import { useLang, useT } from '@/lib/i18n/client';
import { pickName } from '@/lib/i18n';

const STATUS_CLASS: Record<string, string> = {
  DRAFT: 'badge-draft',
  AWAITING_REVIEW: 'badge-review',
  FINAL: 'badge-final',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: '下書き',
  AWAITING_REVIEW: '確認待ち',
  FINAL: '確定',
};

/**
 * The pinned bar at the top of the editing screen.
 *
 * Redesigned 2026-09-29: who this is, where the sheet stands (one status and
 * one progress bar — 確認済み X / Y), and the two or three things one does
 * from here. Less common actions (補足資料, the list of empty fields) are in
 * the ⋯ menu.
 */
export function SheetToolbar({
  model,
  canFinalise,
  canExport,
  canSubmit,
  canExportSupplement = false,
}: {
  model: SheetModel;
  canFinalise: boolean;
  canExport: boolean;
  canSubmit: boolean;
  /** 補足資料 is internal, so engineers never get this. */
  canExportSupplement?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const [notice, setNotice] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [confirming, setConfirming] = useState<UnreviewedItem[] | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const isFinal = model.version.status === 'FINAL';

  // What the operator has not ticked 確認 on yet, named with its section so a
  // field name shared by several sections (備考, 果たした役割) is clear.
  const unreviewedNow: UnreviewedItem[] = model.sections.flatMap((s) =>
    (s.kind === 'REPEATING' ? s.records.flatMap((r) => r.fields) : s.fields)
      .filter((f) => f.valueJa && !f.isReviewed)
      .map((f) => ({
        sectionName: s.nameJa,
        sectionNameEn: s.nameEn,
        fieldName: f.nameJa,
        fieldNameEn: f.nameEn,
      })),
  );

  const finalise = (confirmUnreviewed: boolean) =>
    startTransition(async () => {
      const result = await finaliseAction(model.personId, { confirmUnreviewed });
      setConfirming(null);
      // The sheet changed since this screen loaded: ask again with the list
      // the server found, rather than showing a refusal.
      if (result.unreviewed) setConfirming(result.unreviewed);
      else setNotice(result.message ?? null);
    });

  const filled = model.sections
    .flatMap((s) => (s.kind === 'REPEATING' ? s.records.flatMap((r) => r.fields) : s.fields))
    .filter((f) => f.valueJa).length;
  const reviewed = Math.max(0, filled - model.unreviewedCount);
  const percent = filled === 0 ? 0 : Math.round((reviewed / filled) * 100);

  // The preview is opened with the section that is open now, so its
  // 「編集に戻る」 comes back to the same place. See scroll-restore.tsx.
  const previewBase = `/people/${model.personId}/preview`;
  const openPreview = (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    saveEditingPosition(model.personId);
    const current = new URLSearchParams(window.location.search);
    const query = new URLSearchParams();
    for (const key of ['preset', 'tab']) {
      const value = current.get(key);
      if (value) query.set(key, value);
    }
    router.push(query.size > 0 ? `${previewBase}?${query}` : previewBase);
  };

  const menuItems = [
    { label: t('未入力の項目を見る（{n}）', { n: model.emptyFields.length }), onClick: () => setShowEmpty((v) => !v) },
    ...(canExportSupplement
      ? [
          {
            label: t('補足資料（社内用）をダウンロード'),
            onClick: () => {
              window.location.href = withBasePath(`/api/people/${model.personId}/supplement`);
            },
          },
        ]
      : []),
  ];

  return (
    <>
      <div className="card sticky-below-header sheet-toolbar px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-snug text-ink-900">
              {lang === 'en'
                ? model.person.fullNameEnglish
                : (model.person.fullNameKatakana ?? model.person.fullNameEnglish)}
            </h1>
            <p className="sheet-toolbar-sub tabular text-xs text-ink-500">
              {lang === 'en' ? model.person.fullNameKatakana : model.person.fullNameEnglish}
              {model.person.employeeNumber ? ` ・ No.${model.person.employeeNumber}` : ''}
            </p>
          </div>

          <span className={`badge ${STATUS_CLASS[model.version.status]}`}>
            {t(STATUS_LABELS[model.version.status]!)}
          </span>

          <div className="flex items-center gap-2.5" title={t('値が入っている項目のうち、確認済みの数')}>
            <div className="progress" aria-hidden>
              <span style={{ width: `${percent}%` }} />
            </div>
            <span className="tabular text-sm text-ink-700">
              {t('確認済み')} <strong>{reviewed}</strong> / {filled}
            </span>
          </div>

          <span className="flex-1" />

          <Link href={previewBase} className="btn btn-secondary" onClick={openPreview}>
            {t('プレビュー')}
          </Link>

          {canSubmit ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending || isFinal}
              onClick={() =>
                startTransition(async () => {
                  const result = await submitForReviewAction(model.personId);
                  setNotice(result.message ?? null);
                })
              }
            >
              {t('確認を依頼する')}
            </button>
          ) : null}

          {canExport && isFinal ? (
            <a href={withBasePath(`/api/people/${model.personId}/pdf`)} className="btn btn-primary">
              {t('PDFをダウンロード')}
            </a>
          ) : canFinalise ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || isFinal}
              onClick={() => {
                // Unchecked fields: ask first (2026-09-30) instead of refusing.
                if (unreviewedNow.length > 0) {
                  setConfirming(unreviewedNow);
                  return;
                }
                finalise(false);
              }}
            >
              {isFinal ? t('確定済み') : t('確定する')}
            </button>
          ) : null}

          <FieldMenu items={menuItems} />
        </div>

        {/* One short line on what to do next, only when there is something to
            do. */}
        <p className="sheet-toolbar-hint mt-2 flex items-center gap-2 text-sm text-ink-500">
          {isFinal ? <MoraBot mood="sheet" size={32} title="" /> : null}
          {isFinal
            ? t('確定済みです。内容を直すと、新しい下書きが作られます。')
            : model.unreviewedCount > 0
              ? t(
                  '各項目の内容を確認し「確認」にチェックを付けてください（残り{n}項目）。入力内容は自動で保存されます。',
                  { n: model.unreviewedCount },
                )
              : canFinalise
                ? t('すべて確認済みです。「確定する」を押すとPDFを出力できます。')
                : t('編集が終わったら「確認を依頼する」を押してください。')}
        </p>
      </div>

      {notice ? (
        <p className="card border-brand-100 bg-brand-50 px-5 py-2.5 text-sm text-ink-700">{t(notice)}</p>
      ) : null}

      {confirming ? (
        <ConfirmFinaliseDialog
          items={confirming.map((u) => ({
            section: pickName(lang, u.sectionName, u.sectionNameEn),
            name: pickName(lang, u.fieldName, u.fieldNameEn),
          }))}
          pending={pending}
          onCancel={() => setConfirming(null)}
          onConfirm={() => finalise(true)}
        />
      ) : null}

      {showEmpty ? (
        <ListCard
          title={t('未入力の項目（{n}件）', { n: model.emptyFields.length })}
          onClose={() => setShowEmpty(false)}
          items={model.emptyFields.map((f) => ({
            section: pickName(lang, f.sectionName, f.sectionNameEn),
            name: pickName(lang, f.fieldName, f.fieldNameEn),
            strong: f.required,
          }))}
          empty={t('未入力の項目はありません。')}
        />
      ) : null}
    </>
  );
}

type UnreviewedItem = {
  sectionName: string;
  fieldName: string;
  sectionNameEn?: string | null;
  fieldNameEn?: string | null;
};

/**
 * "Some fields are still unchecked — finalise anyway?" They stay unchecked;
 * the list shows exactly which ones go out without a check.
 */
function ConfirmFinaliseDialog({
  items,
  pending,
  onCancel,
  onConfirm,
}: {
  items: Array<{ section: string; name: string }>;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, pending]);

  return (
    <div className="dialog-overlay" onClick={pending ? undefined : onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="finalise-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <MoraBot mood="checking" size={80} title="" />
          <div className="min-w-0">
            <h2 id="finalise-title" className="text-lg font-semibold text-ink-900">
              {t('未確認の項目が{n}件あります', { n: items.length })}
            </h2>
            <p className="mt-1 text-sm text-ink-700">
              {t(
                'これらの項目は未確認のまま確定し、この内容でPDFを出力できるようになります。本当に確定しますか？',
              )}
            </p>
          </div>
        </div>
        <ul className="dialog-list">
          {items.map((item, i) => (
            <li key={i}>
              <span className="text-ink-500">{item.section}／</span>
              {item.name}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={pending}>
            {t('キャンセル')}
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={pending} autoFocus>
            {pending ? t('確定中…') : t('このまま確定する')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A dismissible list of fields, each named with its section. */
function ListCard({
  title,
  items,
  onClose,
  empty,
}: {
  title: string;
  items: Array<{ section: string; name: string; strong?: boolean }>;
  onClose: () => void;
  empty?: string;
}) {
  const t = useT();
  return (
    <div className="card px-5 py-3.5 text-sm text-ink-700">
      <div className="flex items-center gap-2">
        <p className="font-semibold text-ink-900">{title}</p>
        <span className="flex-1" />
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          {t('閉じる')}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="mt-1">{empty}</p>
      ) : (
        <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <li key={i} className={item.strong ? 'font-semibold text-[#b03a22]' : ''}>
              <span className="text-ink-500">{item.section}／</span>
              {item.name}
              {item.strong ? t('（必須）') : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
