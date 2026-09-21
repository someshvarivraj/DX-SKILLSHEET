/**
 * Import: Google Form responses -> import layer -> working layer.
 * Specification §5.1, §5.2.
 *
 *  - Import is an explicit action by the operator, never an automatic sync.
 *  - The raw answers are stored verbatim and are read-only afterwards.
 *  - On the first import, every field is copied into the working layer.
 *  - On later imports, the differences are shown and the operator chooses per
 *    field whether to take the new answer or keep the current value.
 *  - Manually added records are never removed by an import.
 */

import type { ImportSource, JlptLevel, RecordKind } from '@prisma/client';
import { prisma } from '@/lib/db';
import { UNNAMED_PERSON } from '@/lib/constants';
import { recordAudit } from '@/lib/audit';
import { generateSection } from '@/lib/sheet/fields';
import { getOrCreateSkillSheet, getEditableVersion } from '@/lib/sheet/version';
import { createRecord } from '@/lib/sheet/records';
import {
  isSystemColumn,
  matchColumns,
  rowToAnswers,
  type ColumnMatch,
  type QuestionRef,
} from './match';
import { parseUpload, type ParsedFile } from './parse';

export type ImportPreviewRow = {
  index: number;
  email: string | null;
  nameEnglish: string | null;
  nameKatakana: string | null;
  personId: string | null;
  isNewPerson: boolean;
  answerCount: number;
};

export type ImportPreview = {
  fileName: string;
  formRevisionCode: string;
  totalRows: number;
  rows: ImportPreviewRow[];
  matched: ColumnMatch[];
  /** Columns that matched no question — spec §5.3 "unassigned questions". */
  unmapped: string[];
  /** Questions in the revision that the file does not contain. */
  missingQuestions: string[];
};

const EMAIL_HEADERS = ['メールアドレス', 'email address', 'email', 'username'];

function findEmail(row: Record<string, string>): string | null {
  for (const [key, value] of Object.entries(row)) {
    const k = key.trim().toLowerCase();
    if (EMAIL_HEADERS.some((h) => k === h || k.startsWith(h))) {
      const v = value.trim();
      if (v.includes('@')) return v.toLowerCase();
    }
  }
  const any = Object.values(row).find((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()));
  return any ? any.trim().toLowerCase() : null;
}

async function loadQuestions(formRevisionId: string): Promise<{
  refs: QuestionRef[];
  types: Map<string, string>;
}> {
  const questions = await prisma.formQuestion.findMany({
    where: { formRevisionId },
    orderBy: { order: 'asc' },
  });
  return {
    refs: questions.map((q) => ({
      code: q.code,
      fullTitle: q.responseHeader ?? q.titleJa,
      titleJa: q.titleJa,
      titleEn: q.titleEn,
      type: q.type,
      gridRows: q.gridRows,
    })),
    types: new Map(questions.map((q) => [q.code, q.type as string])),
  };
}

/** What the importer needs from an existing person to merge a row into it. */
const PERSON_MATCH_FIELDS = {
  id: true,
  fullNameEnglish: true,
  fullNameKatakana: true,
  dateOfBirth: true,
} as const;

export type ExistingPerson = {
  id: string;
  fullNameEnglish: string;
  fullNameKatakana: string | null;
  dateOfBirth: Date | null;
};

/**
 * Find the person a row belongs to.
 *
 * The dry run and the real import MUST agree. They used to differ: the preview
 * matched on email only, so an email-less row was always badged 新規, while the
 * import fell back to the English name and quietly updated an existing person.
 * The operator was told one thing and the other happened.
 */
export async function findExistingPerson(
  email: string | null,
  nameEnglish: string,
): Promise<ExistingPerson | null> {
  if (email) {
    const byEmail = await prisma.person.findUnique({
      where: { email },
      select: PERSON_MATCH_FIELDS,
    });
    if (byEmail) return byEmail;
  }
  const name = nameEnglish.trim();
  if (!name) return null;
  return prisma.person.findFirst({
    where: { fullNameEnglish: name },
    select: PERSON_MATCH_FIELDS,
  });
}

export async function previewImport(params: {
  fileName: string;
  buffer: ArrayBuffer;
  formRevisionId: string;
}): Promise<{ preview: ImportPreview; parsed: ParsedFile; matches: ColumnMatch[] }> {
  const parsed = await parseUpload(params.fileName, params.buffer);
  const revision = await prisma.formRevision.findUniqueOrThrow({
    where: { id: params.formRevisionId },
  });
  const { refs, types } = await loadQuestions(params.formRevisionId);

  const matches = matchColumns(parsed.headers, refs);
  const unmapped = matches
    .filter((m) => !m.code && !isSystemColumn(m.header) && m.header.trim() !== '')
    .map((m) => m.header);

  const foundCodes = new Set(matches.map((m) => m.code).filter(Boolean) as string[]);
  const missingQuestions = refs.filter((q) => !foundCodes.has(q.code)).map((q) => q.code);

  const rows: ImportPreviewRow[] = [];
  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const answers = rowToAnswers(row, matches, types);
    const email = findEmail(row);
    const person = await findExistingPerson(
      email,
      String(answers['A-1-1'] ?? ''),
    );

    rows.push({
      index: i,
      email,
      nameEnglish: (answers['A-1-1'] as string) ?? null,
      nameKatakana: (answers['A-1-2'] as string) ?? null,
      personId: person?.id ?? null,
      isNewPerson: !person,
      answerCount: Object.keys(answers).length,
    });
  }

  return {
    preview: {
      fileName: params.fileName,
      formRevisionCode: revision.code,
      totalRows: parsed.rows.length,
      rows,
      matched: matches,
      unmapped,
      missingQuestions,
    },
    parsed,
    matches,
  };
}

export type ImportOutcome = {
  batchId: string;
  created: number;
  updated: number;
  /** People whose sheet already had content: differences are queued for review. */
  needsReview: Array<{ personId: string; name: string }>;
};

export async function runImport(params: {
  fileName: string;
  buffer: ArrayBuffer;
  formRevisionId: string;
  source: ImportSource;
  userId: string;
  /** Row indexes to import; omit for all rows. */
  rowIndexes?: number[];
  /** Generate all fields immediately for people imported for the first time. */
  generateOnFirstImport?: boolean;
}): Promise<ImportOutcome> {
  const { parsed, matches, preview } = await previewImport({
    fileName: params.fileName,
    buffer: params.buffer,
    formRevisionId: params.formRevisionId,
  });
  const { types } = await loadQuestions(params.formRevisionId);

  const batch = await prisma.importBatch.create({
    data: {
      formRevisionId: params.formRevisionId,
      importedById: params.userId,
      source: params.source,
      fileName: params.fileName,
      rowCount: parsed.rows.length,
      unmappedHeaders: preview.unmapped,
    },
  });

  const outcome: ImportOutcome = {
    batchId: batch.id,
    created: 0,
    updated: 0,
    needsReview: [],
  };

  const indexes =
    params.rowIndexes ?? parsed.rows.map((_, i) => i);

  for (const index of indexes) {
    const row = parsed.rows[index];
    if (!row) continue;
    const answers = rowToAnswers(row, matches, types);
    const email = findEmail(row);
    const nameEnglish = String(answers['A-1-1'] ?? '').trim();
    const nameKatakana = String(answers['A-1-2'] ?? '').trim();
    if (!nameEnglish && !email) continue;

    // --- person -----------------------------------------------------------
    const existing = await findExistingPerson(email, nameEnglish);

    const dateOfBirth = parseDate(String(answers['A-1-4'] ?? ''));

    const person = existing
      ? await prisma.person.update({
          where: { id: existing.id },
          data: {
            fullNameEnglish: nameEnglish || existing.fullNameEnglish,
            fullNameKatakana: nameKatakana || existing.fullNameKatakana,
            dateOfBirth: dateOfBirth ?? existing.dateOfBirth,
          },
        })
      : await prisma.person.create({
          data: {
            email,
            // NEVER the email address. It is printed as 氏名 on the skill
            // sheet, appears in the PDF's title and file name, and the client
            // requires that a recruit's private address never reaches the
            // printed document. A row with no name gets a placeholder that is
            // obvious on screen instead.
            fullNameEnglish: nameEnglish || UNNAMED_PERSON,
            fullNameKatakana: nameKatakana || null,
            dateOfBirth,
          },
        });

    const hadResponses = await prisma.formResponse.count({
      where: { personId: person.id },
    });

    // --- import layer (written once, read-only afterwards) ------------------
    await prisma.formResponse.upsert({
      where: {
        importBatchId_responseKey: {
          importBatchId: batch.id,
          responseKey: email ?? person.id,
        },
      },
      create: {
        importBatchId: batch.id,
        personId: person.id,
        responseKey: email ?? person.id,
        submittedAt: parseDate(String(row['タイムスタンプ'] ?? row['Timestamp'] ?? '')),
        answers: answers as never,
      },
      update: { answers: answers as never, personId: person.id },
    });

    await upsertJlpt(person.id, answers);

    const sheet = await getOrCreateSkillSheet(person.id);
    await ensureRecords(sheet.id, answers, params.userId);

    if (hadResponses === 0) {
      outcome.created++;
      if (params.generateOnFirstImport) {
        const version = await getEditableVersion(sheet.id, params.userId);
        const sections = await prisma.sheetSection.findMany({
          orderBy: { order: 'asc' },
        });
        for (const section of sections) {
          await generateSection({
            versionId: version.id,
            sectionId: section.id,
            personId: person.id,
            userId: params.userId,
            // An import derives the sheet from the form, so a field that comes
            // back empty starts unticked and the operator ticks it by hand.
            displayFromValue: true,
          });
        }
      }
    } else {
      outcome.updated++;
      outcome.needsReview.push({
        personId: person.id,
        name: person.fullNameEnglish,
      });
    }
  }

  await recordAudit({
    userId: params.userId,
    action: 'import.run',
    entityType: 'ImportBatch',
    entityId: batch.id,
    summary: `${params.fileName} を取り込んだ（新規${outcome.created}件、更新${outcome.updated}件）`,
    meta: { unmapped: preview.unmapped },
  });

  return outcome;
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const cleaned = value.replace(/年|月/g, '-').replace(/日/g, '').replace(/\//g, '-').trim();
  const d = new Date(cleaned);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** C-1-1 and C-2-* become a JlptResult row; history is kept (§6.10). */
async function upsertJlpt(personId: string, answers: Record<string, unknown>) {
  const levelRaw = String(answers['C-1-1'] ?? '').trim();
  const level = (['N1', 'N2', 'N3', 'N4', 'N5'] as const).find((l) =>
    levelRaw.startsWith(l),
  );
  if (!level) return;

  const session = String(answers['C-2-1'] ?? '');
  const year = Number(session.match(/(\d{4})\s*年/)?.[1] ?? session.match(/(\d{4})/)?.[1]);
  const month = Number(session.match(/年\s*(\d{1,2})\s*月/)?.[1] ?? (/12月|December/.test(session) ? 12 : /7月|July/.test(session) ? 7 : NaN));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return;

  const int = (v: unknown): number | null => {
    const n = Number(String(v ?? '').replace(/[^\d]/g, ''));
    return Number.isFinite(n) && String(v ?? '').trim() !== '-' ? n : null;
  };

  await prisma.jlptResult.upsert({
    where: {
      personId_level_examYear_examMonth: {
        personId,
        level: level as JlptLevel,
        examYear: year,
        examMonth: month,
      },
    },
    create: {
      personId,
      level: level as JlptLevel,
      examYear: year,
      examMonth: month,
      total: int(answers['C-2-2']),
      languageKnowledge: int(answers['C-2-3']),
      reading: int(answers['C-2-4']),
      languageAndReading: int(answers['C-2-5']),
      listening: int(answers['C-2-6']),
    },
    update: {
      total: int(answers['C-2-2']),
      languageKnowledge: int(answers['C-2-3']),
      reading: int(answers['C-2-4']),
      languageAndReading: int(answers['C-2-5']),
      listening: int(answers['C-2-6']),
    },
  });
}

/**
 * Create one record per populated block in the form. Existing records with the
 * same prefix are reused, and manually added records are left untouched (§5.2).
 */
async function ensureRecords(
  skillSheetId: string,
  answers: Record<string, unknown>,
  userId: string,
) {
  const blocks: Array<{ prefix: string; kind: RecordKind }> = [
    { prefix: 'B-1', kind: 'EDUCATION' },
    { prefix: 'B-2', kind: 'EDUCATION' },
    { prefix: 'B-3', kind: 'EDUCATION' },
    { prefix: 'E-1', kind: 'INTERNSHIP' },
    { prefix: 'E-2', kind: 'INTERNSHIP' },
    { prefix: 'F-1', kind: 'PROJECT' },
    { prefix: 'F-2', kind: 'PROJECT' },
  ];

  const sheet = await prisma.skillSheet.findUniqueOrThrow({
    where: { id: skillSheetId },
    select: { personId: true },
  });

  for (const block of blocks) {
    const hasContent = Object.entries(answers).some(
      ([code, value]) =>
        code.startsWith(`${block.prefix}-`) &&
        value !== null &&
        value !== undefined &&
        String(value).trim() !== '',
    );
    if (!hasContent) continue;

    const existing = await prisma.sheetRecord.findFirst({
      where: { skillSheetId, kind: block.kind, sourcePrefix: block.prefix },
    });
    if (existing) {
      if (existing.deletedAt) continue; // respect a deliberate deletion
      continue;
    }

    await createRecord({
      skillSheetId,
      kind: block.kind,
      personId: sheet.personId,
      userId,
      sourcePrefix: block.prefix,
      origin: 'IMPORTED',
    }).catch(() => undefined); // cap reached: leave for the operator to manage
  }
}

// ---------------------------------------------------------------------------
// Re-import differences (§5.2)
// ---------------------------------------------------------------------------

export type FieldDiff = {
  fieldId: string;
  fieldCode: string;
  fieldName: string;
  sectionName: string;
  recordId: string | null;
  recordLabel: string | null;
  currentSource: string;
  incomingSource: string;
  currentValue: string;
  isLocked: boolean;
};

/**
 * Compare the answers behind the current values with the newest import and
 * return the fields whose source text changed. The operator decides per field
 * whether to take the new answer; nothing is overwritten automatically.
 */
export async function diffLatestImport(personId: string): Promise<FieldDiff[]> {
  const [latest, sheet] = await Promise.all([
    prisma.formResponse.findFirst({
      where: { personId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.skillSheet.findUnique({
      where: { personId },
      include: {
        currentVersion: {
          include: {
            values: {
              include: {
                field: { include: { section: true, sources: true } },
                record: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (!latest || !sheet?.currentVersion) return [];
  const answers = latest.answers as Record<string, unknown>;
  const diffs: FieldDiff[] = [];

  for (const value of sheet.currentVersion.values) {
    const prefix = value.record?.sourcePrefix ?? null;
    let codes = value.field.sources.map((s) => s.questionCode);
    if (prefix) {
      const direct = codes.filter((c) => c.startsWith(`${prefix}-`));
      if (direct.length > 0) codes = direct;
      else codes = codes.map((c) => c.replace(/-x-/, `${prefix.split('-')[1] ? `-${prefix.split('-')[1]}-` : '-x-'}`));
    }

    const incoming = codes
      .map((code) => {
        const resolved = prefix && code.includes('-x-')
          ? `${prefix}-${code.split('-x-')[1]}`
          : code;
        const v = answers[resolved];
        return v === undefined || v === null
          ? ''
          : `[${resolved}] ${Array.isArray(v) ? v.join(', ') : String(v)}`;
      })
      .filter(Boolean)
      .join('\n\n');

    const current = value.sourceText ?? '';
    if (incoming.trim() && incoming.trim() !== current.trim()) {
      diffs.push({
        fieldId: value.fieldId,
        fieldCode: value.field.code,
        fieldName: value.field.nameJa,
        sectionName: value.field.section.nameJa,
        recordId: value.recordId,
        recordLabel: value.record?.sourcePrefix ?? null,
        currentSource: current,
        incomingSource: incoming,
        currentValue: value.valueJa ?? '',
        isLocked: value.isLocked,
      });
    }
  }

  return diffs;
}
