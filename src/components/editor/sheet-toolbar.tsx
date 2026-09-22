'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import type { SheetModel } from '@/lib/sheet/model';
import {
  finaliseAction,
  submitForReviewAction,
} from '@/app/(app)/people/[personId]/actions';
import { previewScrollKey } from './scroll-restore';

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
  const [unreviewed, setUnreviewed] = useState<
    Array<{ sectionName: string; fieldName: string }>
  >([]);
  const [showEmpty, setShowEmpty] = useState(false);
  const [pending, startTransition] = useTransition();

  const isFinal = model.version.status === 'FINAL';

  // Say plainly what this sheet needs next, so an operator does not have to
  // infer it from the badges. Sano-san's review (2026-09-22, item 4): she
  // could not tell what this notice was for, and its stiff である style did
  // not match the rest of the screen. Reworded in the plain ですます style
  // used everywhere else, as a direct instruction rather than a statement of
  // state — kept, not removed, since the state it reports has real value.
  const nextStep = isFinal
    ? 'この版は確定済みです。PDFを出力できます。内容を直す場合は、編集すると新しい下書きが作られます。'
    : model.unreviewedCount > 0
      ? `生成された文章のうち${model.unreviewedCount}項目がまだ未確認です。内容を確認し、「確認済み」にチェックを入れてください。全項目が確認済みになると確定できます。`
      : canFinalise
        ? '全項目の確認が済みました。「確定する」を押すとPDFを出力できます。'
        : '編集が終わったら「確認を依頼する」を押してください。確定は管理者が行います。';

  return (
    <>
      <div className="card sticky-below-header px-4 py-3 shadow-lift">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="page-title text-base">
            {model.person.fullNameKatakana ?? model.person.fullNameEnglish}
          </h1>
          <p className="tabular pl-[calc(4px+0.6rem)] text-xs text-ink-400">
            {model.person.fullNameEnglish}
            {model.person.employeeNumber ? ` ・ No.${model.person.employeeNumber}` : ''}
          </p>
        </div>

        <span className={`badge ${STATUS_CLASS[model.version.status]}`}>
          {STATUS_LABELS[model.version.status]} 第{model.version.versionNo}版
        </span>

        {model.unreviewedCount > 0 ? (
          <span className="badge badge-warn">未確認 {model.unreviewedCount}項目</span>
        ) : (
          <span className="badge badge-final">未確認なし</span>
        )}

        <button
          type="button"
          className="btn btn-secondary"
          title="値が入っていない項目を一覧で表示する。必須項目は赤で示す。"
          onClick={() => setShowEmpty((v) => !v)}
        >
          未入力の一覧（{model.emptyFields.length}）
        </button>

        <span className="flex-1" />

        <span className="tabular text-xs text-ink-400">
          最終保存 {new Date(model.version.updatedAt).toLocaleString('ja-JP')}
        </span>

        <Link
          href={`/people/${model.personId}/preview`}
          className="btn btn-secondary"
          title="印刷される状態のスキルシートを画面で確認する。PDFと同じ見た目である。"
          onClick={() => {
            // So that closing the preview can return to this position instead
            // of the top of the page — see ScrollRestore, read on the editing
            // screen's next load. Sano-san's review (2026-09-22, item 7).
            try {
              sessionStorage.setItem(
                previewScrollKey(model.personId),
                String(window.scrollY),
              );
            } catch {
              // Private browsing / storage disabled: preview still works, it
              // just reopens the editing screen at the top.
            }
          }}
        >
          プレビュー
        </Link>

        {canSubmit ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending || isFinal}
            title="編集内容を管理者に確認してもらう。依頼後も確定までは編集できる。"
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

        {canFinalise ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || isFinal}
            title={
              isFinal
                ? 'この版は確定済みである。'
                : 'この版を確定する。全項目の確認が済んでいる必要がある。確定するとPDFを出力できる。'
            }
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

        {canExport ? (
          isFinal ? (
            <a
              href={`/api/people/${model.personId}/pdf`}
              className="btn btn-primary"
              title="確定版のスキルシートをA4のPDFとして出力する。"
            >
              PDFをダウンロード
            </a>
          ) : (
            // Disabled rather than a link that would fail: the endpoint refuses
            // anything that is not a finalised version (§11.1), and an error
            // page is a worse explanation than a greyed-out button.
            <button
              type="button"
              className="btn btn-secondary"
              disabled
              title="PDFは確定版のみ出力できる。先に「確定する」を実行すること。"
            >
              PDFをダウンロード
            </button>
          )
        ) : null}
        {canExportSupplement ? (
          <a
            href={`/api/people/${model.personId}/supplement`}
            className="btn btn-secondary"
            title="配属検討用の情報・備考・営業メモをまとめた社内用の資料。スキルシートには出力されない内容である。確定前でも出力できる。"
          >
            補足資料をダウンロード
          </a>
        ) : null}
      </div>

        <p className="section-note mt-3">{nextStep}</p>
      </div>

      {/* Everything below is reference material, not controls. It stays out of
          the pinned bar: an 80-item list inside a sticky block makes the block
          taller than the window, and a sticky block taller than the window has
          to be scrolled past before the page moves — which reads as the page
          being stuck. */}
      {notice ? (
        <p className="card border-brand-100 bg-brand-50 px-4 py-2 text-xs text-ink-700">
          {notice}
        </p>
      ) : null}

      {unreviewed.length > 0 ? (
        <div className="card border-accent-500/35 bg-accent-50 px-4 py-3 text-xs text-[#b03a22]">
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="font-semibold">確認が済んでいない項目（{unreviewed.length}件）</p>
            <p className="text-ink-500">
              各項目の「確認済み」にチェックを入れると確定できる。
            </p>
            <span className="flex-1" />
            <button type="button" className="btn-quiet btn" onClick={() => setUnreviewed([])}>
              閉じる
            </button>
          </div>
          {/* Several sections carry a field of the same name — 備考, 果たした役割,
              チーム規模 — so the section is named too; a column of bare repeated
              names cannot be acted on. */}
          <ul className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
            {unreviewed.map((u, i) => (
              <li key={i}>
                <span className="text-ink-500">{u.sectionName}／</span>
                {u.fieldName}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {showEmpty ? (
        <div className="card px-4 py-3 text-xs text-ink-700">
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="font-semibold text-ink-900">
              未入力の項目（{model.emptyFields.length}件）
            </p>
            <span className="flex-1" />
            <button type="button" className="btn-quiet btn" onClick={() => setShowEmpty(false)}>
              閉じる
            </button>
          </div>
          {model.emptyFields.length === 0 ? (
            <p className="mt-1.5">未入力の項目はない。</p>
          ) : (
            <ul className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
              {model.emptyFields.map((f, i) => (
                <li key={i} className={f.required ? 'font-semibold text-[#b03a22]' : ''}>
                  <span className="text-ink-500">{f.sectionName}／</span>
                  {f.fieldName}
                  {f.required ? '（必須）' : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </>
  );
}
