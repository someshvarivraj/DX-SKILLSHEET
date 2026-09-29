import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { FieldDefinitionTable } from '@/components/admin/field-definition-table';
import { FormScriptImport } from '@/components/admin/form-script-import';
import { expandSourceCodes } from '@/lib/sheet/question-coverage';
import { PageHeader } from '@/components/page-header';
import { TemplatePreviewButton } from '@/components/admin/template-preview-overlay';

export const dynamic = 'force-dynamic';

/**
 * §5.3 — the section and field definitions are edited here, not in code.
 * The screen also lists questions that no field consumes, so a change to next
 * year's form cannot be missed.
 */
export default async function FieldDefinitionPage() {
  const user = await requireUser();
  if (!can(user, 'definition.manage')) notFound();

  const [sections, revision] = await Promise.all([
    prisma.sheetSection.findMany({
      orderBy: { order: 'asc' },
      include: {
        fields: {
          orderBy: { order: 'asc' },
          include: { sources: { orderBy: { order: 'asc' } } },
        },
      },
    }),
    prisma.formRevision.findFirst({ where: { isActive: true } }),
  ]);

  // How many people have something entered in each field (in their current
  // version), so deleting a field can say how much entered data goes with it.
  // A repeating section holds one value per record, so values are grouped by
  // field and version first and then counted per field.
  const filledRows = await prisma.fieldValue.groupBy({
    by: ['fieldId', 'versionId'],
    where: { valueJa: { not: '' }, version: { currentFor: { isNot: null } } },
  });
  const filledByField = new Map<string, number>();
  for (const row of filledRows) {
    filledByField.set(row.fieldId, (filledByField.get(row.fieldId) ?? 0) + 1);
  }

  const questions = revision
    ? await prisma.formQuestion.findMany({
        where: { formRevisionId: revision.id },
        orderBy: { order: 'asc' },
      })
    : [];

  const usedCodes = new Set(
    sections.flatMap((s) => s.fields.flatMap((f) => f.sources.map((src) => src.questionCode))),
  );

  // "E-x-6" covers E-1-6 and E-2-6: expand the placeholders before comparing.
  const expanded = expandSourceCodes(usedCodes);

  const unassigned = questions.filter((q) => !expanded.has(q.code));

  const rows = sections.map((section) => ({
    id: section.id,
    code: section.code,
    nameJa: section.nameJa,
    nameEn: section.nameEn,
    order: section.order,
    kind: section.kind,
    isVisible: section.isVisible,
    hideWhenEmpty: section.hideWhenEmpty,
    maxDisplayed: section.maxDisplayed,
    description: section.description,
    fields: section.fields.map((f) => ({
      id: f.id,
      code: f.code,
      nameJa: f.nameJa,
      nameEn: f.nameEn,
      order: f.order,
      processing: f.processing,
      editing: f.editing,
      valueType: f.valueType,
      includeInPdf: f.includeInPdf,
      displayToggle: f.displayToggle,
      isRequired: f.isRequired,
      isActive: f.isActive,
      generationPrompt: f.generationPrompt,
      targetLengthMin: f.targetLengthMin,
      targetLengthMax: f.targetLengthMax,
      glossaryCategory: f.glossaryCategory,
      ruleKey: f.ruleKey,
      helpText: f.helpText,
      sourceCodes: f.sources.map((s) => s.questionCode),
      filledCount: filledByField.get(f.id) ?? 0,
    })),
  }));

  return (
    <div className="space-y-5">
      {/* Kept for the next developer: which answer lands where on the sheet
          is decided by the rows on this screen, not by code — a new year's
          form needs rows added here, never a redeploy. */}
      <PageHeader
        title="項目定義"
        lead="スキルシートに載せる項目と、その並び順を決めます。行を押すと詳しい設定を開きます。"
        actions={
<TemplatePreviewButton />
        }
      />

      <FormScriptImport />

      {unassigned.length > 0 ? (
        // Collapsed: most days nobody needs this list. It matters after a
        // form change, when a new question has no field to land in yet.
        <details className="card px-4 py-3 text-sm">
          <summary className="cursor-pointer text-ink-700">
            シートに使われていない設問が{unassigned.length}件あります
          </summary>
          <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-0.5 text-ink-500 md:grid-cols-2">
            {unassigned.map((q) => (
              <li key={q.id}>{q.titleJa}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <FieldDefinitionTable
        sections={rows}
        questionCodes={questions.map((q) => q.code)}
      />
    </div>
  );
}
