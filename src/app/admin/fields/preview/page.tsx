import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
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
 * "セクションのプレビュー" overlay on that section's row.
 *
 * This uses `loadTemplateModel` + the same `SkillSheetDocument`/
 * `toPrintableModel` the real per-person preview uses (§11.2: preview and PDF
 * always match), so what is shown here is exactly the layout a finished sheet
 * would have, just with placeholder text instead of a real person's answers.
 *
 * Deliberately outside the `(app)` route group, so it renders without the
 * header/nav/AI banner — Sano-san's review (2026-09-28): the section-preview
 * overlay embeds this in an iframe inside a small modal, and the full app
 * chrome squeezed in there was pointless. Because that also removes the
 * `(app)` layout's own login check, this page does its own, matching it
 * exactly (`redirect('/login')`, not `requireUser()`'s thrown error, which
 * had no layout left to catch it).
 */
export default async function TemplatePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!can(user, 'definition.manage')) notFound();
  const { section } = await searchParams;

  const model = await loadTemplateModel({ sectionCode: section });
  if (section && model.sections.length === 0) notFound();
  const printable = toPrintableModel(model, true);

  return (
    <div className="space-y-3 p-3">
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
