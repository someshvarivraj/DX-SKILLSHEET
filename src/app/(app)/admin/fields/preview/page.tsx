import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { loadTemplateModel } from '@/lib/sheet/template';
import { toPrintableModel } from '@/lib/sheet/model';
import { SHEET_STYLES, SkillSheetDocument } from '@/components/sheet-document';
import { PreviewStage } from '@/components/editor/preview-stage';

export const dynamic = 'force-dynamic';

/**
 * Template preview: what the current field definitions produce, with no
 * particular person's data. Opened from the field-definition screen, either
 * for the whole sheet or, with `?section=`, for one section only — the
 * "セクションのプレビュー" link on that section's row.
 *
 * This uses `loadTemplateModel` + the same `SkillSheetDocument`/
 * `toPrintableModel` the real per-person preview uses (§11.2: preview and PDF
 * always match), so what is shown here is exactly the layout a finished sheet
 * would have, just with placeholder text instead of a real person's answers.
 */
export default async function TemplatePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, 'definition.manage')) notFound();
  const { section } = await searchParams;

  const model = await loadTemplateModel({ sectionCode: section });
  if (section && model.sections.length === 0) notFound();
  const printable = toPrintableModel(model, true);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title text-base">
          {section ? `セクションのプレビュー: ${model.sections[0]?.nameJa ?? section}` : 'テンプレートのプレビュー'}
        </h1>
        <span className="text-xs text-ink-500">
          実際のデータではなく、項目名を仮の値として表示している。表示・非表示の設定は現在の項目定義のとおりに反映される。
        </span>
      </div>

      <PreviewStage
        toolbar={
          <Link href="/admin/fields" className="btn btn-secondary">
            項目定義に戻る
          </Link>
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
