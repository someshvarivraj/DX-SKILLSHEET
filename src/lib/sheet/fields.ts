/**
 * Field-level operations.  Specification chapter 7.
 *
 * §7.1 Every field is editable by hand, including copied and glossary values.
 * §7.2 AI regeneration and manual editing are separate concerns: company name,
 *      period, university, degree, scores and choice fields are excluded from
 *      regeneration but remain editable by hand.
 * §7.3 Editing and regeneration work at field level, never at block level.
 * §7.4 Prompted regeneration affects only the field it was typed on.
 * §7.5 Per-field history, locking, character counts, unreviewed indicator and a
 *      bulk generation that must not overwrite locked fields.
 */

import type { ChangeType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { loadGlossary } from '@/lib/glossary';
import { processField, type FieldDefinition } from '@/lib/processing/pipeline';
import { normaliseJapanese } from '@/lib/style/text';
import { selectPrimaryResult, type JlptScores } from '@/lib/rules/jlpt';

/** Processing types that the AI may regenerate (§7.2). */
const AI_REGENERATABLE = new Set(['GENERATE', 'TRANSLATE']);

export function isRegeneratable(processing: string): boolean {
  return AI_REGENERATABLE.has(processing);
}

export async function getPersonContext(personId: string) {
  const [person, response, jlptResults] = await Promise.all([
    prisma.person.findUniqueOrThrow({ where: { id: personId } }),
    prisma.formResponse.findFirst({
      where: { personId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.jlptResult.findMany({ where: { personId } }),
  ]);

  const jlpt = selectPrimaryResult(
    jlptResults.map<JlptScores>((r) => ({
      level: r.level,
      examYear: r.examYear,
      examMonth: r.examMonth,
      total: r.total,
      languageKnowledge: r.languageKnowledge,
      reading: r.reading,
      languageAndReading: r.languageAndReading,
      listening: r.listening,
    })),
  );

  return {
    person,
    answers: (response?.answers as Record<string, unknown> | undefined) ?? {},
    jlpt,
  };
}

async function loadFieldDefinition(fieldId: string): Promise<FieldDefinition & {
  sectionCode: string;
  nameJa: string;
}> {
  const field = await prisma.sheetField.findUniqueOrThrow({
    where: { id: fieldId },
    include: { sources: { orderBy: { order: 'asc' } }, section: true },
  });
  return {
    id: field.id,
    code: field.code,
    nameJa: field.nameJa,
    processing: field.processing,
    valueType: field.valueType,
    sourceCodes: field.sources.map((s) => s.questionCode),
    generationPrompt: field.generationPrompt,
    targetLengthMin: field.targetLengthMin,
    targetLengthMax: field.targetLengthMax,
    glossaryCategory: field.glossaryCategory,
    ruleKey: field.ruleKey,
    sectionCode: field.section.code,
  };
}

/**
 * Postgres allows any number of rows with the same (versionId, fieldId) when
 * recordId is NULL, and Prisma's findUnique/update refuse null inside a
 * compound-unique selector anyway ("Argument `recordId` must not be null").
 * `recordKey` is the non-null mirror of recordId that the DB-level
 * @@unique(versionId, fieldId, recordKey) is actually built on — every
 * lookup by the compound key must go through this helper, never recordId
 * directly.
 */
function fieldValueWhere(versionId: string, fieldId: string, recordId?: string | null) {
  return {
    versionId_fieldId_recordKey: {
      versionId,
      fieldId,
      recordKey: recordId ?? '',
    },
  } as const;
}

export type WriteValueInput = {
  versionId: string;
  fieldId: string;
  recordId?: string | null;
  valueJa?: string | null;
  valueJson?: unknown;
  sourceText?: string | null;
  changeType: ChangeType;
  userId?: string | null;
  prompt?: string | null;
  model?: string | null;
  /** Manual edits count as reviewed; AI output does not (§7.5). */
  markReviewed?: boolean;
  generated?: boolean;
  /**
   * Re-derive the display checkbox from whether the value is empty. Set only by
   * the importer: an import rebuilds the sheet from the form, so an empty answer
   * should arrive unchecked. Everywhere else the operator's choice stands.
   */
  displayFromValue?: boolean;
};

export async function writeFieldValue(input: WriteValueInput) {
  const existing = await prisma.fieldValue.findUnique({
    where: fieldValueWhere(input.versionId, input.fieldId, input.recordId),
  });

  const valueJa =
    input.valueJa === undefined ? (existing?.valueJa ?? '') : (input.valueJa ?? '');

  const data = {
    valueJa,
    valueJson: (input.valueJson === undefined
      ? existing?.valueJson
      : input.valueJson) as Prisma.InputJsonValue,
    sourceText:
      input.sourceText === undefined ? existing?.sourceText : input.sourceText,
    isReviewed: input.markReviewed ?? existing?.isReviewed ?? false,
    generatedAt: input.generated ? new Date() : existing?.generatedAt,
    generatedBy: input.generated ? (input.model ?? null) : (existing?.generatedBy ?? null),
  };

  // Sano-san's rule for empty fields: every person keeps every field so that it
  // can be filled in later (someone with no GitHub today may have one next
  // month), and whether a field prints is decided by its display checkbox
  // rather than by the program noticing it is blank. A field that arrives empty
  // starts unchecked; the operator ticks it by hand.
  //
  // On an existing row the checkbox is left alone, so a deliberate choice is
  // never silently overwritten — except on re-import, which re-derives the
  // sheet from the form and passes `displayFromValue`.
  const displayed = valueJa.trim() !== '';
  const displayData = existing
    ? input.displayFromValue
      ? { isDisplayed: displayed }
      : {}
    : { isDisplayed: displayed };

  const value = existing
    ? await prisma.fieldValue.update({
        where: { id: existing.id },
        data: { ...data, ...displayData },
      })
    : await prisma.fieldValue.create({
        data: {
          versionId: input.versionId,
          fieldId: input.fieldId,
          recordId: input.recordId ?? null,
          recordKey: input.recordId ?? '',
          ...data,
          ...displayData,
        },
      });

  await prisma.fieldValueHistory.create({
    data: {
      fieldValueId: value.id,
      changeType: input.changeType,
      previousJa: existing?.valueJa ?? null,
      valueJa: value.valueJa,
      valueJson: value.valueJson as Prisma.InputJsonValue,
      prompt: input.prompt ?? null,
      model: input.model ?? null,
      changedById: input.userId ?? null,
    },
  });

  return value;
}

/** Manual edit from the editor (§7.1). */
export async function editFieldValue(params: {
  versionId: string;
  fieldId: string;
  recordId?: string | null;
  valueJa: string;
  userId: string;
  personId: string;
  normalise?: boolean;
}) {
  const existing = await prisma.fieldValue.findUnique({
    where: fieldValueWhere(params.versionId, params.fieldId, params.recordId),
  });
  if (existing?.isLocked) {
    throw new Error('この項目はロックされている。ロックを解除してから編集すること');
  }

  const value = await writeFieldValue({
    versionId: params.versionId,
    fieldId: params.fieldId,
    recordId: params.recordId,
    valueJa: params.normalise === false ? params.valueJa : normaliseJapanese(params.valueJa),
    changeType: 'MANUAL_EDIT',
    userId: params.userId,
    markReviewed: true,
  });

  await recordAudit({
    userId: params.userId,
    action: 'sheet.field_edit',
    entityType: 'FieldValue',
    entityId: value.id,
    personId: params.personId,
  });

  return value;
}

export type GenerateResult = {
  ok: boolean;
  skipped?: 'locked' | 'not-regeneratable' | 'empty-source';
  valueJa?: string;
  warnings?: string[];
  unmatchedTerms?: string[];
};

/** Generate or regenerate one field (§7.3, §7.4). */
export async function generateFieldValue(params: {
  versionId: string;
  fieldId: string;
  recordId?: string | null;
  personId: string;
  userId: string;
  operatorPrompt?: string | null;
  /** Bulk runs skip locked fields instead of failing (§7.5). */
  skipLocked?: boolean;
  /** Forwarded to writeFieldValue; set by the importer. */
  displayFromValue?: boolean;
}): Promise<GenerateResult> {
  const [definition, context, glossary] = await Promise.all([
    loadFieldDefinition(params.fieldId),
    getPersonContext(params.personId),
    loadGlossary(),
  ]);

  const existing = await prisma.fieldValue.findUnique({
    where: fieldValueWhere(params.versionId, params.fieldId, params.recordId),
  });

  if (existing?.isLocked) {
    if (params.skipLocked) return { ok: false, skipped: 'locked' };
    throw new Error('この項目はロックされている');
  }

  let recordPrefix: string | null = null;
  if (params.recordId) {
    const record = await prisma.sheetRecord.findUnique({
      where: { id: params.recordId },
      select: { sourcePrefix: true },
    });
    recordPrefix = record?.sourcePrefix ?? null;
  }

  const result = await processField(definition, {
    answers: context.answers,
    glossary,
    recordPrefix,
    operatorPrompt: params.operatorPrompt,
    currentValue: params.operatorPrompt ? (existing?.valueJa ?? null) : null,
    rule: {
      person: {
        fullNameEnglish: context.person.fullNameEnglish,
        fullNameKatakana: context.person.fullNameKatakana,
        dateOfBirth: context.person.dateOfBirth,
      },
      jlpt: context.jlpt,
    },
  });

  const value = await writeFieldValue({
    versionId: params.versionId,
    fieldId: params.fieldId,
    recordId: params.recordId,
    valueJa: result.valueJa,
    valueJson: result.valueJson,
    sourceText: result.sourceText,
    changeType: result.usedAi ? 'AI_GENERATE' : 'RULE_GENERATE',
    userId: params.userId,
    prompt: params.operatorPrompt,
    model: result.model,
    generated: result.usedAi,
    // Rule and copy output is deterministic, so it still needs a human check
    // before finalising; nothing is auto-marked as reviewed.
    markReviewed: false,
  });

  await recordAudit({
    userId: params.userId,
    action: 'sheet.field_generate',
    entityType: 'FieldValue',
    entityId: value.id,
    personId: params.personId,
    summary: `${definition.nameJa} を生成した`,
    meta: { usedAi: result.usedAi, model: result.model },
  });

  return {
    ok: true,
    valueJa: result.valueJa,
    warnings: result.warnings,
    unmatchedTerms: result.unmatchedTerms,
  };
}

/** Initial generation for a whole section (§7.5 bulk generation). */
export async function generateSection(params: {
  versionId: string;
  sectionId: string;
  personId: string;
  userId: string;
  /** Forwarded to writeFieldValue; set by the importer. */
  displayFromValue?: boolean;
}) {
  const section = await prisma.sheetSection.findUniqueOrThrow({
    where: { id: params.sectionId },
    include: { fields: { where: { isActive: true }, orderBy: { order: 'asc' } } },
  });

  const records =
    section.kind === 'REPEATING'
      ? await prisma.sheetRecord.findMany({
          where: {
            skillSheet: { personId: params.personId },
            kind: section.recordKind!,
            deletedAt: null,
          },
        })
      : [null];

  const outcome = { generated: 0, skipped: 0, warnings: [] as string[] };

  for (const record of records) {
    for (const field of section.fields) {
      if (field.processing === 'MANUAL') continue;
      const result = await generateFieldValue({
        versionId: params.versionId,
        fieldId: field.id,
        recordId: record?.id ?? null,
        personId: params.personId,
        userId: params.userId,
        skipLocked: true,
        displayFromValue: params.displayFromValue,
      });
      if (result.ok) outcome.generated++;
      else outcome.skipped++;
      if (result.warnings?.length) outcome.warnings.push(...result.warnings);
    }
  }

  return outcome;
}

export async function setFieldFlags(params: {
  valueId: string;
  userId: string;
  personId: string;
  isLocked?: boolean;
  isReviewed?: boolean;
  isDisplayed?: boolean;
}) {
  const value = await prisma.fieldValue.update({
    where: { id: params.valueId },
    data: {
      ...(params.isLocked === undefined ? {} : { isLocked: params.isLocked }),
      ...(params.isReviewed === undefined ? {} : { isReviewed: params.isReviewed }),
      ...(params.isDisplayed === undefined ? {} : { isDisplayed: params.isDisplayed }),
    },
  });

  if (params.isLocked !== undefined) {
    await prisma.fieldValueHistory.create({
      data: {
        fieldValueId: value.id,
        changeType: params.isLocked ? 'LOCK' : 'UNLOCK',
        valueJa: value.valueJa,
        changedById: params.userId,
      },
    });
    await recordAudit({
      userId: params.userId,
      action: 'sheet.field_lock',
      entityType: 'FieldValue',
      entityId: value.id,
      personId: params.personId,
      summary: params.isLocked ? 'ロックした' : 'ロックを解除した',
    });
  }

  return value;
}

/** Restore a field to an earlier value (§7.5 per-field history). */
export async function revertFieldValue(params: {
  historyId: string;
  userId: string;
  personId: string;
}) {
  const entry = await prisma.fieldValueHistory.findUniqueOrThrow({
    where: { id: params.historyId },
    include: { fieldValue: true },
  });

  const value = await writeFieldValue({
    versionId: entry.fieldValue.versionId,
    fieldId: entry.fieldValue.fieldId,
    recordId: entry.fieldValue.recordId,
    valueJa: entry.valueJa,
    valueJson: entry.valueJson,
    changeType: 'REVERT',
    userId: params.userId,
    markReviewed: true,
  });

  await recordAudit({
    userId: params.userId,
    action: 'sheet.field_revert',
    entityType: 'FieldValue',
    entityId: value.id,
    personId: params.personId,
  });

  return value;
}
