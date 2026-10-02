import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { FieldDefinitionTable } from '@/components/admin/field-definition-table';
import Link from 'next/link';
import { PickableItemsProvider } from '@/components/admin/item-picker';
import { resolveSectionColours } from '@/lib/sheet/section-colours';
import { PageHeader } from '@/components/page-header';
import { getT } from '@/lib/i18n/server';
import { TemplatePreviewButton } from '@/components/admin/template-preview-overlay';

export const dynamic = 'force-dynamic';

/**
 * §5.3 — the section and field definitions are edited here, not in code.
 * The screen also lists questions that no field consumes, so a change to next
 * year's form cannot be missed.
 */
export default async function FieldDefinitionPage() {
  const user = await requireUser();
  const t = await getT();
  if (!can(user, 'definition.manage')) notFound();

  const [sections, items] = await Promise.all([
    prisma.sheetSection.findMany({
      orderBy: { order: 'asc' },
      include: {
        fields: {
          orderBy: { order: 'asc' },
          include: { sources: { orderBy: { order: 'asc' } } },
        },
      },
    }),
    // Every item still asked somewhere; hidden and replaced ones are left out.
    prisma.item.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ subcategory: { category: { order: 'asc' } } }, { subcategory: { order: 'asc' } }, { order: 'asc' }],
      select: {
        id: true,
        key: true,
        titleJa: true,
        titleEn: true,
        subcategory: { select: { category: { select: { nameJa: true } } } },
        groupTypes: { select: { groupType: { select: { nameJa: true } } } },
      },
    }),
  ]);

  // Who has something entered in each field (in their current version), so
  // deleting a field can name the candidates whose data would go with it.
  // A repeating section holds one value per record, hence `distinct`.
  const filledRows = await prisma.fieldValue.findMany({
    where: { valueJa: { not: '' }, version: { currentFor: { isNot: null } } },
    distinct: ['fieldId', 'versionId'],
    select: {
      fieldId: true,
      version: { select: { skillSheet: { select: { person: { select: { fullNameEnglish: true } } } } } },
    },
  });
  const filledByField = new Map<string, string[]>();
  for (const row of filledRows) {
    const names = filledByField.get(row.fieldId) ?? [];
    names.push(row.version.skillSheet.person.fullNameEnglish);
    filledByField.set(row.fieldId, names);
  }
  for (const names of filledByField.values()) names.sort((a, b) => a.localeCompare(b));

  // Field sources name items by key ("E-x-6" included), so an item is in use
  // when some field lists its key.
  const usedKeys = new Set(
    sections.flatMap((s) => s.fields.flatMap((f) => f.sources.map((src) => src.questionCode))),
  );
  const unassigned = items.filter((item) => !usedKeys.has(item.key));

  const colours = resolveSectionColours(sections);

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
    colour: section.colour,
    colourKey: colours.get(section.code)!.key,
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
      filledPeople: filledByField.get(f.id) ?? [],
    })),
  }));

  return (
    <div className="space-y-5">
      {/* Kept for the next developer: which answer lands where on the sheet
          is decided by the rows on this screen, not by code — a new year's
          form needs rows added here, never a redeploy. */}
      <PageHeader
        title={t('項目定義')}
        lead={t('スキルシートに載せる項目と、その並び順を決めます。行を押すと詳しい設定を開きます。')}
        actions={
<TemplatePreviewButton />
        }
      />

      <p className="text-sm text-ink-500">
        {t('設問の追加や、Googleフォームのスクリプト（.gs）の取り込みは「設問マスタ」で行います。')}{' '}
        <Link href="/admin/items" className="font-medium text-brand-500 hover:underline">
          {t('設問マスタを開く')}
        </Link>
      </p>

      {unassigned.length > 0 ? (
        // Collapsed: most days nobody needs this list. It matters after a
        // form change, when a new question has no field to land in yet.
        <details className="card px-4 py-3 text-sm">
          <summary className="cursor-pointer text-ink-700">
            {t('シートに使われていない設問が{n}件あります', { n: unassigned.length })}
          </summary>
          <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-0.5 text-ink-500 md:grid-cols-2">
            {unassigned.map((q) => (
              <li key={q.id}>{q.titleJa}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <PickableItemsProvider
        items={items.map((item) => ({
          key: item.key,
          title: item.titleJa,
          titleEn: item.titleEn,
          category: item.subcategory.category.nameJa,
          groups: item.groupTypes.map((g) => g.groupType.nameJa),
        }))}
      >
        <FieldDefinitionTable sections={rows} questionCodes={items.map((item) => item.key)} />
      </PickableItemsProvider>
    </div>
  );
}
