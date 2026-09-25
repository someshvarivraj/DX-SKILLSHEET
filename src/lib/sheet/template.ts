/**
 * The template preview: what the current field definitions produce, with no
 * particular person attached.
 *
 * Sano-san's review (2026-09-25): the field-definition screen has no way to
 * see the effect of a change without opening a real person's sheet. This
 * builds a synthetic `SheetModel` straight from the definitions — every field
 * filled with its own name in brackets rather than invented data — and feeds
 * it through the same `SkillSheetDocument` and `toPrintableModel` the real
 * preview uses, so the layout, section order and show/hide rules are exactly
 * what will actually print.
 */

import { prisma } from '@/lib/db';
import type { FieldView, RecordView, SectionView, SheetModel } from './model';

function placeholder(nameJa: string): string {
  return `［${nameJa}］`;
}

function buildTemplateFieldView(field: {
  id: string;
  code: string;
  nameJa: string;
  nameEn: string | null;
  order: number;
  processing: import('@prisma/client').Processing;
  editing: 'MANUAL_ONLY' | 'PROMPT_AND_MANUAL';
  valueType: import('@prisma/client').ValueType;
  includeInPdf: boolean;
  displayToggle: boolean;
  isRequired: boolean;
  helpText: string | null;
  generationPrompt: string | null;
  targetLengthMin: number | null;
  targetLengthMax: number | null;
}): FieldView {
  const valueJa = placeholder(field.nameJa);
  return {
    id: field.id,
    code: field.code,
    nameJa: field.nameJa,
    nameEn: field.nameEn,
    order: field.order,
    processing: field.processing,
    editing: field.editing,
    valueType: field.valueType,
    includeInPdf: field.includeInPdf,
    displayToggle: field.displayToggle,
    isRequired: field.isRequired,
    helpText: field.helpText,
    generationPrompt: field.generationPrompt,
    targetLengthMin: field.targetLengthMin,
    targetLengthMax: field.targetLengthMax,
    sourceCodes: [],

    valueId: null,
    valueJa,
    valueJson: null,
    sourceText: '',
    isLocked: false,
    isReviewed: true,
    isDisplayed: true,
    generatedAt: null,
    characterCount: valueJa.length,
    styleIssues: [],
    historyCount: 0,
  };
}

/**
 * Loads every active section and field definition and fills each with a
 * placeholder, optionally narrowed to one section (the per-section preview
 * opened from the field-definition screen). `document` selects the skill
 * sheet or the supplementary document, matching `SectionView['document']`.
 */
export async function loadTemplateModel(options?: {
  sectionCode?: string;
  document?: 'SKILL_SHEET' | 'SUPPLEMENT';
}): Promise<SheetModel> {
  const sections = await prisma.sheetSection.findMany({
    where: options?.sectionCode ? { code: options.sectionCode } : {},
    orderBy: { order: 'asc' },
    include: {
      fields: {
        where: { isActive: true },
        orderBy: { order: 'asc' },
      },
    },
  });

  const sectionViews: SectionView[] = sections.map((section) => {
    const fields = section.fields.map(buildTemplateFieldView);

    // One sample record so a REPEATING section (internships, education, …)
    // shows what a filled-in row looks like, not an empty table.
    const records: RecordView[] =
      section.kind === 'REPEATING'
        ? [
            {
              id: `${section.id}-sample`,
              kind: section.recordKind ?? 'INTERNSHIP',
              origin: 'MANUAL',
              sourcePrefix: null,
              isDisplayed: true,
              displayOrder: 0,
              fields: fields.map((f) => ({ ...f, id: `${f.id}-sample` })),
              label: placeholder(section.nameJa),
            },
          ]
        : [];

    return {
      id: section.id,
      code: section.code,
      nameJa: section.nameJa,
      nameEn: section.nameEn,
      order: section.order,
      kind: section.kind,
      document: section.document,
      recordKind: section.recordKind,
      isVisible: section.isVisible,
      hideWhenEmpty: section.hideWhenEmpty,
      maxDisplayed: section.maxDisplayed,
      description: section.description,
      // A SINGLE section's own fields are dropped for REPEATING sections
      // (their content lives in `records` instead), matching how a real
      // sheet's SectionView is built.
      fields: section.kind === 'REPEATING' ? [] : fields,
      records,
      isEmpty: false,
    };
  });

  return {
    personId: 'template',
    skillSheetId: 'template',
    person: {
      id: 'template',
      employeeNumber: null,
      fullNameEnglish: 'テンプレート',
      fullNameKatakana: null,
      email: null,
      cohort: null,
      photoKey: null,
    },
    version: {
      id: 'template',
      versionNo: 0,
      status: 'FINAL',
      updatedAt: new Date(),
      finalisedAt: null,
    },
    preset: null,
    sections: sectionViews.filter((s) => s.document === (options?.document ?? 'SKILL_SHEET')),
    emptyFields: [],
    unreviewedCount: 0,
  };
}
