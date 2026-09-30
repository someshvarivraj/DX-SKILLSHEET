'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { SheetModel } from '@/lib/sheet/model';
import { withBasePath } from '@/lib/base-path';
import {
  finaliseAction,
  submitForReviewAction,
} from '@/app/(app)/people/[personId]/actions';
import { saveEditingPosition } from './scroll-restore';
import { FieldMenu } from './field-editor';

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
  const [notice, setNotice] = useState<string | null>(null);
  const [unreviewed, setUnreviewed] = useState<Array<{ sectionName: string; fieldName: string }>>([]);
  const [showEmpty, setShowEmpty] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const isFinal = model.version.status === 'FINAL';

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
    { label: `未入力の項目を見る（${model.emptyFields.length}）`, onClick: () => setShowEmpty((v) => !v) },
    ...(canExportSupplement
      ? [
          {
            label: '補足資料（社内用）をダウンロード',
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
            <h1 className="text-lg font-bold leading-snug text-ink-900">
              {model.person.fullNameKatakana ?? model.person.fullNameEnglish}
            </h1>
            <p className="sheet-toolbar-sub tabular text-xs text-ink-500">
              {model.person.fullNameEnglish}
              {model.person.employeeNumber ? ` ・ No.${model.person.employeeNumber}` : ''}
            </p>
          </div>

          <span className={`badge ${STATUS_CLASS[model.version.status]}`}>
            {STATUS_LABELS[model.version.status]}
          </span>

          <div className="flex items-center gap-2.5" title="値が入っている項目のうち、確認済みの数">
            <div className="progress" aria-hidden>
              <span style={{ width: `${percent}%` }} />
            </div>
            <span className="tabular text-sm text-ink-700">
              確認済み <strong>{reviewed}</strong> / {filled}
            </span>
          </div>

          <span className="flex-1" />

          <Link href={previewBase} className="btn btn-secondary" onClick={openPreview}>
            プレビュー
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
              確認を依頼する
            </button>
          ) : null}

          {canExport && isFinal ? (
            <a href={withBasePath(`/api/people/${model.personId}/pdf`)} className="btn btn-primary">
              PDFをダウンロード
            </a>
          ) : canFinalise ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || isFinal}
              title={model.unreviewedCount > 0 ? 'すべての項目に「確認」を付けると確定できます' : undefined}
              onClick={() =>
                startTransition(async () => {
                  setUnreviewed([]);
                  const result = await finaliseAction(model.personId);
                  setNotice(result.message ?? null);
                  if (result.unreviewed) setUnreviewed(result.unreviewed);
                })
              }
            >
              {isFinal ? '確定済み' : '確定する'}
            </button>
          ) : null}

          <FieldMenu items={menuItems} />
        </div>

        {/* One short line on what to do next, only when there is something to
            do. */}
        <p className="sheet-toolbar-hint mt-2 text-sm text-ink-500">
          {isFinal
            ? '確定済みです。内容を直すと、新しい下書きが作られます。'
            : model.unreviewedCount > 0
              ? `各項目の内容を確認し「確認」にチェックを付けてください（残り${model.unreviewedCount}項目）。入力内容は自動で保存されます。`
              : canFinalise
                ? 'すべて確認済みです。「確定する」を押すとPDFを出力できます。'
                : '編集が終わったら「確認を依頼する」を押してください。'}
        </p>
      </div>

      {notice ? (
        <p className="card border-brand-100 bg-brand-50 px-5 py-2.5 text-sm text-ink-700">{notice}</p>
      ) : null}

      {unreviewed.length > 0 ? (
        <ListCard
          title={`まだ確認していない項目（${unreviewed.length}件）`}
          onClose={() => setUnreviewed([])}
          items={unreviewed.map((u) => ({ section: u.sectionName, name: u.fieldName }))}
        />
      ) : null}

      {showEmpty ? (
        <ListCard
          title={`未入力の項目（${model.emptyFields.length}件）`}
          onClose={() => setShowEmpty(false)}
          items={model.emptyFields.map((f) => ({
            section: f.sectionName,
            name: f.fieldName,
            strong: f.required,
          }))}
          empty="未入力の項目はありません。"
        />
      ) : null}
    </>
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
  return (
    <div className="card px-5 py-3.5 text-sm text-ink-700">
      <div className="flex items-center gap-2">
        <p className="font-bold text-ink-900">{title}</p>
        <span className="flex-1" />
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          閉じる
        </button>
      </div>
      {items.length === 0 ? (
        <p className="mt-1">{empty}</p>
      ) : (
        <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <li key={i} className={item.strong ? 'font-bold text-[#b03a22]' : ''}>
              <span className="text-ink-500">{item.section}／</span>
              {item.name}
              {item.strong ? '（必須）' : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
