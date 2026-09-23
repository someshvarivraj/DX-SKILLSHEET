/**
 * Loads a complete skill sheet: the definition, the values and the records,
 * assembled in the order the definition tables specify.
 *
 * The same model feeds the editor, the on-screen preview and the PDF, which is
 * how the specification's requirement that "the preview and the PDF always
 * match" is satisfied (§11.2).
 */

import type {
  Processing,
  RecordKind,
  SectionKind,
  SheetStatus,
  ValueType,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { characterCount, checkStyle, type StyleIssue } from '@/lib/style/text';
import { isFieldPrintable } from './visibility';

export type FieldView = {
  id: string;
  code: string;
  nameJa: string;
  nameEn: string | null;
  order: number;
  processing: Processing;
  editing: 'MANUAL_ONLY' | 'PROMPT_AND_MANUAL';
  valueType: ValueType;
  includeInPdf: boolean;
  displayToggle: boolean;
  isRequired: boolean;
  helpText: string | null;
  generationPrompt: string | null;
  targetLengthMin: number | null;
  targetLengthMax: number | null;
  sourceCodes: string[];

  valueId: string | null;
  valueJa: string;
  valueJson: unknown;
  sourceText: string;
  isLocked: boolean;
  isReviewed: boolean;
  isDisplayed: boolean;
  generatedAt: Date | null;
  characterCount: number;
  styleIssues: StyleIssue[];
  historyCount: number;
};

export type RecordView = {
  id: string;
  kind: RecordKind;
  origin: 'IMPORTED' | 'MANUAL';
  sourcePrefix: string | null;
  isDisplayed: boolean;
  displayOrder: number;
  fields: FieldView[];
  /** Short label for the record list, taken from its title field. */
  label: string;
};

export type SectionView = {
  id: string;
  code: string;
  nameJa: string;
  nameEn: string | null;
  order: number;
  kind: SectionKind;
  /** Which printed document this section belongs to. */
  document: 'SKILL_SHEET' | 'SUPPLEMENT';
  recordKind: RecordKind | null;
  isVisible: boolean;
  hideWhenEmpty: boolean;
  maxDisplayed: number;
  description: string | null;
  fields: FieldView[];
  records: RecordView[];
  /** True when every value in the section is empty (§5.3 hide-when-empty). */
  isEmpty: boolean;
};

export type SheetModel = {
  personId: string;
  skillSheetId: string;
  person: {
    id: string;
    employeeNumber: string | null;
    fullNameEnglish: string;
    fullNameKatakana: string | null;
    email: string | null;
    cohort: string | null;
    photoKey: string | null;
  };
  version: {
    id: string;
    versionNo: number;
    status: SheetStatus;
    updatedAt: Date;
    finalisedAt: Date | null;
  };
  preset: { id: string; name: string; hiddenFieldCodes: string[] } | null;
  sections: SectionView[];
  /** Fields with no content, for the "list of empty fields" check (§7.5). */
  emptyFields: Array<{ sectionName: string; fieldName: string; required: boolean }>;
  unreviewedCount: number;
};

function buildFieldView(
  field: {
    id: string;
    code: string;
    nameJa: string;
    nameEn: string | null;
    order: number;
    processing: Processing;
    editing: 'MANUAL_ONLY' | 'PROMPT_AND_MANUAL';
    valueType: ValueType;
    includeInPdf: boolean;
    displayToggle: boolean;
    isRequired: boolean;
    helpText: string | null;
    generationPrompt: string | null;
    targetLengthMin: number | null;
    targetLengthMax: number | null;
    sources: Array<{ questionCode: string; order: number }>;
  },
  value:
    | {
        id: string;
        valueJa: string | null;
        valueJson: unknown;
        sourceText: string | null;
        isLocked: boolean;
        isReviewed: boolean;
        isDisplayed: boolean;
        generatedAt: Date | null;
        _count?: { history: number };
      }
    | undefined,
): FieldView {
  const valueJa = value?.valueJa ?? '';
  const prose =
    field.valueType === 'TEXT' ||
    (field.processing === 'GENERATE' && field.valueType === 'STRING');

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
    sourceCodes: [...field.sources]
      .sort((a, b) => a.order - b.order)
      .map((s) => s.questionCode),

    valueId: value?.id ?? null,
    valueJa,
    valueJson: value?.valueJson ?? null,
    sourceText: value?.sourceText ?? '',
    isLocked: value?.isLocked ?? false,
    isReviewed: value?.isReviewed ?? false,
    // No value row yet means the field has never been imported or filled in, so
    // it starts unticked rather than printing as an empty row. Writing a value
    // ticks it (see writeFieldValue).
    isDisplayed: value?.isDisplayed ?? false,
    generatedAt: value?.generatedAt ?? null,
    characterCount: characterCount(valueJa),
    styleIssues: valueJa
      ? checkStyle(valueJa, {
          prose,
          nounForm: field.code === 'oth_hobbies',
          min: field.targetLengthMin,
          max: field.targetLengthMax,
        })
      : [],
    historyCount: value?._count?.history ?? 0,
  };
}

export async function loadSheetModel(
  personId: string,
  options: { presetId?: string | null; versionId?: string | null } = {},
): Promise<SheetModel | null> {
  const sheet = await prisma.skillSheet.findUnique({
    where: { personId },
    include: {
      person: true,
      currentVersion: true,
      displayPresets: { orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] },
      records: {
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
        include: { displays: true },
      },
    },
  });
  if (!sheet) return null;

  const versionId = options.versionId ?? sheet.currentVersionId;
  if (!versionId) return null;

  const version = await prisma.sheetVersion.findUnique({ where: { id: versionId } });
  if (!version) return null;

  const preset =
    sheet.displayPresets.find((p) => p.id === options.presetId) ??
    sheet.displayPresets.find((p) => p.isDefault) ??
    sheet.displayPresets[0] ??
    null;

  const [sections, values] = await Promise.all([
    prisma.sheetSection.findMany({
      orderBy: { order: 'asc' },
      include: {
        fields: {
          where: { isActive: true },
          orderBy: { order: 'asc' },
          include: { sources: true },
        },
      },
    }),
    prisma.fieldValue.findMany({
      where: { versionId },
      include: { _count: { select: { history: true } } },
    }),
  ]);

  const valueByKey = new Map<string, (typeof values)[number]>();
  for (const v of values) {
    valueByKey.set(`${v.fieldId}::${v.recordId ?? ''}`, v);
  }

  const emptyFields: SheetModel['emptyFields'] = [];
  let unreviewedCount = 0;

  const sectionViews: SectionView[] = sections.map((section) => {
    const isRepeating = section.kind === 'REPEATING';

    const singleFields = isRepeating
      ? []
      : section.fields.map((f) => {
          const view = buildFieldView(f, valueByKey.get(`${f.id}::`));
          // プロフィール写真 holds no text: the photo is a file on the person,
          // uploaded from the editing screen. It is missing only when there
          // is no photo, not because its (unused) text value is blank.
          const isEmpty = f.code === 'photo' ? !sheet.person.photoKey : !view.valueJa;
          if (isEmpty) {
            emptyFields.push({
              sectionName: section.nameJa,
              fieldName: f.nameJa,
              required: f.isRequired,
            });
          }
          if (view.valueJa && !view.isReviewed) unreviewedCount++;
          return view;
        });

    const records: RecordView[] = isRepeating
      ? sheet.records
          .filter((r) => r.kind === section.recordKind)
          .map((record) => {
            const display = preset
              ? record.displays.find((d) => d.presetId === preset.id)
              : undefined;
            const fields = section.fields.map((f) => {
              const view = buildFieldView(f, valueByKey.get(`${f.id}::${record.id}`));
              if (view.valueJa && !view.isReviewed) unreviewedCount++;
              return view;
            });
            const titleField =
              fields.find((f) => f.code.endsWith('_title')) ?? fields[0];
            return {
              id: record.id,
              kind: record.kind,
              origin: record.origin,
              sourcePrefix: record.sourcePrefix,
              isDisplayed: display?.isDisplayed ?? false,
              displayOrder: display?.order ?? record.order,
              fields,
              label: titleField?.valueJa || '（タイトル未設定）',
            };
          })
          .sort((a, b) => a.displayOrder - b.displayOrder)
      : [];

    const isEmpty = isRepeating
      ? records.every((r) => r.fields.every((f) => !f.valueJa))
      : singleFields.every((f) => !f.valueJa);

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
      fields: singleFields,
      records,
      isEmpty,
    };
  });

  return {
    personId,
    skillSheetId: sheet.id,
    person: {
      id: sheet.person.id,
      employeeNumber: sheet.person.employeeNumber,
      fullNameEnglish: sheet.person.fullNameEnglish,
      fullNameKatakana: sheet.person.fullNameKatakana,
      email: sheet.person.email,
      cohort: sheet.person.cohort,
      photoKey: sheet.person.photoKey,
    },
    version: {
      id: version.id,
      versionNo: version.versionNo,
      status: version.status,
      updatedAt: version.updatedAt,
      finalisedAt: version.finalisedAt,
    },
    preset: preset
      ? { id: preset.id, name: preset.name, hiddenFieldCodes: preset.hiddenFieldCodes }
      : null,
    sections: sectionViews,
    emptyFields,
    unreviewedCount,
  };
}

/**
 * Reduce the model to what actually appears on the sheet: hidden sections and
 * fields removed, records limited to those selected for display (§5.3, §5.5,
 * §6.12).
 */
export function toPrintableModel(
  model: SheetModel,
  forPdf: boolean,
  /**
   * Which document is being built. 配属検討用の情報 and the sales notes print
   * only on the supplementary document; everything else only on the skill
   * sheet. Nothing appears on both.
   */
  document: 'SKILL_SHEET' | 'SUPPLEMENT' = 'SKILL_SHEET',
): SheetModel {
  const hidden = new Set(model.preset?.hiddenFieldCodes ?? []);
  const printOptions = { forPdf, hiddenFieldCodes: hidden };

  const sections = model.sections
    .filter((s) => s.document === document)
    .filter((s) => s.isVisible)
    .filter((s) => !(s.hideWhenEmpty && s.isEmpty))
    .map((s) => ({
      ...s,
      // The rule itself lives in ./visibility, where it is documented and
      // tested: printing follows the display checkbox, not emptiness.
      fields: s.fields.filter((f) => isFieldPrintable(f, printOptions)),
      records: s.records
        .filter((r) => r.isDisplayed)
        .slice(0, s.maxDisplayed)
        .map((r) => ({
          ...r,
          fields: r.fields.filter((f) => isFieldPrintable(f, printOptions)),
        })),
    }))
    .filter((s) => s.fields.length > 0 || s.records.length > 0);

  return { ...model, sections };
}
