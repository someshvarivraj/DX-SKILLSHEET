/**
 * Differences after a re-import — spec §5.2.
 *
 * The first import fills the sheet. Later imports (or answers submitted again
 * on マイページ) never change it on their own: each field keeps the English
 * answer it was built from (`sourceText`, §8.4), so a field whose answer has
 * changed since is found by comparing that with the person's newest answers.
 * For each one the operator chooses:
 *
 *   take the new answer   — the field is rebuilt from it, as on first import
 *                           (copy, glossary, rule or AI, per its definition)
 *   keep the current value — nothing changes, and this answer is not offered
 *                           again (`keptSourceText`) until it changes once more
 */

import { prisma } from '@/lib/db';
import { sourceTextFor } from '@/lib/processing/pipeline';
import { getPersonContext, toFieldDefinition } from './fields';

export type ImportDiff = {
  fieldId: string;
  recordId: string | null;
  sectionName: string;
  fieldName: string;
  /** "インターンシップ 2" for a repeating record. */
  recordLabel: string | null;
  /** What the sheet says now. */
  currentJa: string;
  /** The answer the current value was built from. */
  previousAnswer: string;
  /** The newest answer. */
  newAnswer: string;
  /** Locked fields are never rebuilt (§7.5); unlock first. */
  locked: boolean;
};

/** Whitespace-insensitive, so a reformatted answer is not a difference. */
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

const RECORD_NAMES: Record<string, string> = {
  EDUCATION: '学歴',
  INTERNSHIP: 'インターンシップ',
  PROJECT: 'プロジェクト',
};

export async function loadImportDiffs(personId: string): Promise<ImportDiff[]> {
  const sheet = await prisma.skillSheet.findUnique({ where: { personId } });
  if (!sheet?.currentVersionId) return [];

  const [context, sections, records, values] = await Promise.all([
    getPersonContext(personId),
    prisma.sheetSection.findMany({
      orderBy: { order: 'asc' },
      include: {
        fields: {
          where: { isActive: true, processing: { not: 'MANUAL' } },
          orderBy: { order: 'asc' },
          include: { sources: { orderBy: { order: 'asc' } }, section: true },
        },
      },
    }),
    prisma.sheetRecord.findMany({
      where: { skillSheetId: sheet.id, deletedAt: null },
      orderBy: [{ kind: 'asc' }, { order: 'asc' }],
    }),
    prisma.fieldValue.findMany({ where: { versionId: sheet.currentVersionId } }),
  ]);

  // Nothing answered yet (a person added by hand), or a sheet not written yet
  // (that is first generation, not a difference): nothing to compare.
  if (Object.keys(context.answers).length === 0 || values.length === 0) return [];

  const valueOf = new Map(values.map((v) => [`${v.fieldId}#${v.recordKey}`, v]));
  const diffs: ImportDiff[] = [];

  for (const section of sections) {
    const targets =
      section.kind === 'REPEATING'
        ? records.filter((r) => r.kind === section.recordKind)
        : [null];
    targets.forEach((record, index) => {
      for (const field of section.fields) {
        if (field.sources.length === 0) continue;
        const definition = toFieldDefinition(field);
        const newAnswer = sourceTextFor(definition, {
          answers: context.answers,
          recordPrefix: record?.sourcePrefix ?? null,
        });
        const value = valueOf.get(`${field.id}#${record?.id ?? ''}`);
        const previousAnswer = value?.sourceText ?? '';
        if (norm(newAnswer) === norm(previousAnswer)) continue;
        // Already decided: keep the current value for exactly this answer.
        if (value?.keptSourceText != null && norm(newAnswer) === norm(value.keptSourceText)) continue;
        // A field that was never filled and still has no answer is not news.
        if (!value && !norm(newAnswer)) continue;
        diffs.push({
          fieldId: field.id,
          recordId: record?.id ?? null,
          sectionName: section.nameJa,
          fieldName: field.nameJa,
          recordLabel: record ? `${RECORD_NAMES[record.kind] ?? record.kind} ${index + 1}` : null,
          currentJa: value?.valueJa ?? '',
          previousAnswer,
          newAnswer,
          locked: Boolean(value?.isLocked),
        });
      }
    });
  }
  return diffs;
}

/** "Keep the current value": remember the answer that was declined. */
export async function keepCurrentValues(
  personId: string,
  targets: Array<{ fieldId: string; recordId: string | null }>,
): Promise<number> {
  const sheet = await prisma.skillSheet.findUniqueOrThrow({ where: { personId } });
  if (!sheet.currentVersionId) return 0;
  const diffs = await loadImportDiffs(personId);
  let kept = 0;
  for (const target of targets) {
    const diff = diffs.find((d) => d.fieldId === target.fieldId && d.recordId === target.recordId);
    if (!diff) continue;
    // Only the marker is written; the value itself does not change, so this
    // needs no new version even when the current one is final.
    await prisma.fieldValue.upsert({
      where: {
        versionId_fieldId_recordKey: {
          versionId: sheet.currentVersionId,
          fieldId: target.fieldId,
          recordKey: target.recordId ?? '',
        },
      },
      update: { keptSourceText: diff.newAnswer },
      // Keeping "empty": an empty, unprinted row that carries the decision.
      create: {
        versionId: sheet.currentVersionId,
        fieldId: target.fieldId,
        recordId: target.recordId,
        recordKey: target.recordId ?? '',
        valueJa: '',
        isDisplayed: false,
        keptSourceText: diff.newAnswer,
      },
    });
    kept++;
  }
  return kept;
}
