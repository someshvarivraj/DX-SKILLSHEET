import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { can, canAccessPerson } from '@/lib/auth/permissions';
import { loadSheetModel, toPrintableModel } from '@/lib/sheet/model';
import { SHEET_STYLES, SkillSheetDocument } from '@/components/sheet-document';
import { PreviewStage } from '@/components/editor/preview-stage';
import { STATUS_LABELS } from '@/lib/sheet/version';
import { withBasePath } from '@/lib/base-path';
import { getLang, getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/**
 * On-screen preview. Uses the same component and the same stylesheet as the
 * PDF, so what is shown here is what is printed (§11.2).
 *
 * The sheet is the whole point of this screen, so it is given a stage of its
 * own: fitted to the window by default, zoomable, and able to fill the screen
 * with nothing else on it.
 *
 * Deliberately outside the `(app)` route group, so it renders without the
 * header/nav/AI banner — Sano-san's review (2026-09-28): the split-preview
 * panel embeds this in an iframe, and the full app chrome squeezed into that
 * panel was pointless (and confusing) next to the editor it already sits
 * beside. A standalone visit loses nothing: the "編集に戻る" link and the
 * stage's own toolbar already cover getting back. Because that also removes
 * the `(app)` layout's own login check, this page does its own, matching it
 * exactly (`redirect('/login')`, not `requireUser()`'s thrown error, which
 * had no layout left to catch it).
 */
export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ personId: string }>;
  searchParams: Promise<{ preset?: string; tab?: string; embed?: string }>;
}) {
  const { personId } = await params;
  const { preset, tab, embed } = await searchParams;
  const user = await getCurrentUser();
  const t = await getT();
  const lang = await getLang();
  if (!user) redirect('/login');
  if (!canAccessPerson(user, personId)) notFound();

  const model = await loadSheetModel(personId, { presetId: preset ?? null });
  if (!model) notFound();
  const printable = toPrintableModel(model, true);
  // §11.1: only a finalised version can be exported. Offering the button before
  // then sends the operator to an endpoint that can only refuse them.
  const isFinal = model.version.status === 'FINAL';
  // The same file URL the editing screen shows. The PDF embeds the photo on
  // its own (lib/pdf/render.ts); the on-screen preview has to be given it.
  const photoUrl = model.person.photoKey
    ? withBasePath(`/api/files/${encodeURIComponent(model.person.photoKey)}`)
    : null;

  // Back to the same tab the preview was opened from (Sano-san's review,
  // 2026-09-23 item 5). The editing screen then scrolls to the field that was
  // on screen; `scroll={false}` stops the router jumping to the top first.
  const backQuery = new URLSearchParams();
  if (preset) backQuery.set('preset', preset);
  if (tab) backQuery.set('tab', tab);
  const backHref = `/people/${personId}${backQuery.size > 0 ? `?${backQuery}` : ''}`;

  // Inside the editor's split panel: the sheet and one small bar (zoom,
  // 全画面表示, PDF). The heading and 編集に戻る are left out — the editor is
  // right beside it.
  if (embed) {
    return (
      <PreviewStage
        compact
        toolbar={
          can(user, 'sheet.export') ? (
            isFinal ? (
              // The endpoint answers with a download (Content-Disposition:
              // attachment), so this frame stays on the preview.
              <a
                href={withBasePath(`/api/people/${personId}/pdf`)}
                className="btn btn-sm btn-primary"
              >
                {t('PDFをダウンロード')}
              </a>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                disabled
                title={t('PDFは確定版のみ出力できます。先に「確定する」を押してください。')}
              >
                {t('PDFをダウンロード')}
              </button>
            )
          ) : null
        }
      >
        <style dangerouslySetInnerHTML={{ __html: SHEET_STYLES }} />
        <div className="p-[14mm]">
          <SkillSheetDocument model={printable} photoUrl={photoUrl} />
        </div>
      </PreviewStage>
    );
  }

  return (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title text-base">
          {t('プレビュー')}:{' '}
          {lang === 'en'
            ? model.person.fullNameEnglish
            : (model.person.fullNameKatakana ?? model.person.fullNameEnglish)}
        </h1>
        <span className="badge badge-draft">
          {t(STATUS_LABELS[model.version.status]!)} {t('第{n}版', { n: model.version.versionNo })}
        </span>
        <span className="text-xs text-ink-500">{t('PDFと同じ見た目で表示しています。')}</span>
      </div>

      <PreviewStage
        toolbar={
          <>
            <Link href={backHref} scroll={false} className="btn btn-secondary">
              {t('編集に戻る')}
            </Link>
            {can(user, 'sheet.export') ? (
              isFinal ? (
                <a href={withBasePath(`/api/people/${personId}/pdf`)} className="btn btn-primary">
                  {t('PDFをダウンロード')}
                </a>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled
                  title={t('PDFは確定版のみ出力できます。先に「確定する」を押してください。')}
                >
                  {t('PDFをダウンロード')}
                </button>
              )
            ) : null}
          </>
        }
      >
        <style dangerouslySetInnerHTML={{ __html: SHEET_STYLES }} />
        <div className="p-[14mm]">
          <SkillSheetDocument model={printable} photoUrl={photoUrl} />
        </div>
      </PreviewStage>
    </div>
  );
}
