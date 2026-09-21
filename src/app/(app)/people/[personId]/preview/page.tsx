import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { can, canAccessPerson } from '@/lib/auth/permissions';
import { loadSheetModel, toPrintableModel } from '@/lib/sheet/model';
import { SHEET_STYLES, SkillSheetDocument } from '@/components/sheet-document';
import { PreviewStage } from '@/components/editor/preview-stage';
import { STATUS_LABELS } from '@/lib/sheet/version';

export const dynamic = 'force-dynamic';

/**
 * On-screen preview. Uses the same component and the same stylesheet as the
 * PDF, so what is shown here is what is printed (§11.2).
 *
 * The sheet is the whole point of this screen, so it is given a stage of its
 * own: fitted to the window by default, zoomable, and able to fill the screen
 * with nothing else on it.
 */
export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ personId: string }>;
  searchParams: Promise<{ preset?: string }>;
}) {
  const { personId } = await params;
  const { preset } = await searchParams;
  const user = await requireUser();
  if (!canAccessPerson(user, personId)) notFound();

  const model = await loadSheetModel(personId, { presetId: preset ?? null });
  if (!model) notFound();
  const printable = toPrintableModel(model, true);
  // §11.1: only a finalised version can be exported. Offering the button before
  // then sends the operator to an endpoint that can only refuse them.
  const isFinal = model.version.status === 'FINAL';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title text-base">
          プレビュー: {model.person.fullNameKatakana ?? model.person.fullNameEnglish}
        </h1>
        <span className="badge badge-draft">
          {STATUS_LABELS[model.version.status]} 第{model.version.versionNo}版
        </span>
        <span className="text-xs text-ink-500">
          画面のプレビューとPDFは同じHTMLから生成されるため、見た目は一致する。
        </span>
      </div>

      <PreviewStage
        toolbar={
          <>
            <Link href={`/people/${personId}`} className="btn btn-secondary">
              編集に戻る
            </Link>
            {can(user, 'sheet.export') ? (
              isFinal ? (
                <a href={`/api/people/${personId}/pdf`} className="btn btn-primary">
                  PDFをダウンロード
                </a>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled
                  title="PDFは確定版のみ出力できる。編集画面で「確定する」を実行すること。"
                >
                  PDFをダウンロード
                </button>
              )
            ) : null}
          </>
        }
      >
        <style dangerouslySetInnerHTML={{ __html: SHEET_STYLES }} />
        <div className="p-[14mm]">
          <SkillSheetDocument model={printable} />
        </div>
      </PreviewStage>
    </div>
  );
}
