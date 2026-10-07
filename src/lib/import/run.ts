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
import { enqueueGeneration } from '@/lib/sheet/generation-jobs';
import { getOrCreateSkillSheet, getEditableVersion } from '@/lib/sheet/version';
import { createRecord } from '@/lib/sheet/records';
import {
  latestAnswerMap,
  loadSetQuestions,
  saveImportedResponse,
  toAnswerMap,
  toItemAnswers,
  type ItemAnswer,
  type SetCodeMap,
} from '@/lib/items/answers';
import { isSystemColumn, matchColumns, rowToAnswers, type ColumnMatch } from './match';
import { parseUpload, type ParsedFile } from './parse';
import { parseFormTimestamp } from './timestamp';

export type ImportPreviewRow = {
  index: number;
  email: string | null;
  nameEnglish: string | null;
  nameKatakana: string | null;
  personId: string | null;
  isNewPerson: boolean;
  answerCount: number;
  /**
   * What importing this row does. Answers arrive both from Google Form files
   * and from the answer links, and a form export always holds every row, so:
   *   new      — a person seen for the first time
   *   update   — newer answers for someone already here (differences reviewed)
   *   same     — this very response was imported before; skipped
   *   inApp    — they have since answered through their link; skipped, so an
   *              older form answer never replaces the newer one
   */
  status: RowStatus;
  /** An answer link was sent and is not submitted yet. */
  linkOpen: boolean;
};

export type RowStatus = 'new' | 'update' | 'same' | 'inApp';

/** The form's own timestamp column: when the candidate submitted it. */
function rowTimestamp(row: Record<string, string>): Date | null {
  return parseFormTimestamp(String(row['タイムスタンプ'] ?? row['Timestamp'] ?? ''));
}


/** JSON with object keys sorted: the database (jsonb) reorders them. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The answers as one comparable string, whatever their order. */
function answersFingerprint(answers: Array<{ itemId: string; entry: number; value: unknown }>): string {
  return answers
    .map((a) => `${a.itemId}#${a.entry}=${stableJson(a.value)}`)
    .sort()
    .join('\n');
}

async function rowStatus(
  personId: string | null,
  submittedAt: Date | null,
  items: ItemAnswer[],
): Promise<{ status: RowStatus; linkOpen: boolean }> {
  if (!personId) return { status: 'new', linkOpen: false };
  const responses = await prisma.response.findMany({
    where: { personId },
    orderBy: { createdAt: 'desc' },
    select: {
      source: true,
      status: true,
      submittedAt: true,
      answers: { select: { itemId: true, entry: true, value: true } },
    },
  });
  const linkOpen = responses.some((r) => r.source === 'APP' && r.status === 'DRAFT');
  const submitted = responses.filter((r) => r.status === 'SUBMITTED');
  if (submitted.length === 0) return { status: 'new', linkOpen };
  const newerInApp = submitted.some(
    (r) => r.source === 'APP' && (!submittedAt || !r.submittedAt || r.submittedAt >= submittedAt),
  );
  if (newerInApp) return { status: 'inApp', linkOpen };
  // The same response: by the form's timestamp, or — for answers imported
  // before timestamps were read — by identical answers.
  const fingerprint = answersFingerprint(items);
  const same = submitted.some(
    (r) =>
      r.source === 'IMPORT' &&
      ((submittedAt !== null && r.submittedAt?.getTime() === submittedAt.getTime()) ||
        answersFingerprint(r.answers) === fingerprint),
  );
  if (same) return { status: 'same', linkOpen };
  return { status: 'update', linkOpen };
}

export type ImportPreview = {
  fileName: string;
  /** The question set the file is read with. */
  setName: string;
  totalRows: number;
  rows: ImportPreviewRow[];
  matched: ColumnMatch[];
  /** Columns that matched no question — spec §5.3 "unassigned questions". */
  unmapped: string[];
  /** Questions in the set that the file does not contain. */
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

/**
 * One row's answers, by form code (as the file has them) and as the lookup by
 * item key that everything after the import reads.
 */
function readRow(
  row: Record<string, string>,
  matches: ColumnMatch[],
  types: Map<string, string>,
  codes: SetCodeMap,
) {
  const items = toItemAnswers(rowToAnswers(row, matches, types), codes);
  return { items, answers: toAnswerMap(items) };
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
  setId: string;
}): Promise<{ preview: ImportPreview; parsed: ParsedFile; matches: ColumnMatch[] }> {
  const parsed = await parseUpload(params.fileName, params.buffer);
  const set = await prisma.questionSet.findUniqueOrThrow({ where: { id: params.setId } });
  const { refs, types, codes } = await loadSetQuestions(params.setId);

  const matches = matchColumns(parsed.headers, refs);
  const unmapped = matches
    .filter((m) => !m.code && !isSystemColumn(m.header) && m.header.trim() !== '')
    .map((m) => m.header);

  const foundCodes = new Set(matches.map((m) => m.code).filter(Boolean) as string[]);
  const missingQuestions = refs.filter((q) => !foundCodes.has(q.code)).map((q) => q.code);

  const rows: ImportPreviewRow[] = [];
  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const { items, answers } = readRow(row, matches, types, codes);
    const email = findEmail(row);
    const person = await findExistingPerson(
      email,
      String(answers['A-1-1'] ?? ''),
    );

    rows.push({
      ...(await rowStatus(person?.id ?? null, rowTimestamp(row), items)),
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
      setName: set.name,
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
  /** Rows imported before, or replaced by a newer answer through the link. */
  skipped: number;
  /** People whose sheet already had content: differences are queued for review. */
  needsReview: Array<{ personId: string; name: string }>;
  /** New people whose AI generation was started in the background. */
  generationQueued: number;
};

export async function runImport(params: {
  fileName: string;
  buffer: ArrayBuffer;
  setId: string;
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
    setId: params.setId,
  });
  const { types, codes } = await loadSetQuestions(params.setId);

  const batch = await prisma.importBatch.create({
    data: {
      questionSetId: params.setId,
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
    skipped: 0,
    needsReview: [],
    generationQueued: 0,
  };

  const indexes =
    params.rowIndexes ?? parsed.rows.map((_, i) => i);

  for (const index of indexes) {
    const row = parsed.rows[index];
    if (!row) continue;
    const planned = preview.rows[index];
    if (planned && (planned.status === 'same' || planned.status === 'inApp')) {
      outcome.skipped++;
      continue;
    }
    const { items, answers } = readRow(row, matches, types, codes);
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

    const hadResponses = await prisma.response.count({
      where: { personId: person.id, status: 'SUBMITTED' },
    });

    // --- answers, per item (kept as imported; read-only afterwards) ---------
    await saveImportedResponse({
      setId: params.setId,
      personId: person.id,
      importBatchId: batch.id,
      submittedAt: rowTimestamp(row),
      answers: items,
    });

    await upsertJlpt(person.id, answers);

    const sheet = await getOrCreateSkillSheet(person.id);
    await ensureRecords(sheet.id, answers, params.userId);

    if (hadResponses === 0) {
      outcome.created++;
      if (params.generateOnFirstImport) {
        const version = await getEditableVersion(sheet.id, params.userId);
        // Queued, not awaited: with a capable model this takes minutes a
        // person. The import returns at once and the screens show progress
        // (see generation-jobs.ts).
        enqueueGeneration({
          personId: person.id,
          name: person.fullNameKatakana ?? person.fullNameEnglish,
          versionId: version.id,
          userId: params.userId,
        });
        outcome.generationQueued++;
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
    summary: `${params.fileName} を取り込んだ（新規${outcome.created}件、更新${outcome.updated}件、スキップ${outcome.skipped}件）`,
    meta: { unmapped: preview.unmapped },
  });

  return outcome;
}

export function parseDate(value: string): Date | null {
  if (!value) return null;
  const cleaned = value.replace(/年|月/g, '-').replace(/日/g, '').replace(/\//g, '-').trim();
  const d = new Date(cleaned);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** C-1-1 and C-2-* become a JlptResult row; history is kept (§6.10). */
export async function upsertJlpt(personId: string, answers: Record<string, unknown>) {
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
export async function ensureRecords(
  skillSheetId: string,
  answers: Record<string, unknown>,
  userId: string,
) {
  // Education is three fixed blocks; internships and projects are repeating
  // parts with up to ten entries (E-1 … E-10), so their blocks come from the
  // entries the answers actually have.
  const entryPrefixes = (letter: string) =>
    [...new Set(Object.keys(answers).map((k) => k.match(new RegExp(`^(${letter}-\\d+)-`))?.[1]).filter(Boolean) as string[])].sort(
      (a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]),
    );
  const blocks: Array<{ prefix: string; kind: RecordKind }> = [
    { prefix: 'B-1', kind: 'EDUCATION' },
    { prefix: 'B-2', kind: 'EDUCATION' },
    { prefix: 'B-3', kind: 'EDUCATION' },
    ...entryPrefixes('E').map((prefix) => ({ prefix, kind: 'INTERNSHIP' as RecordKind })),
    ...entryPrefixes('F').map((prefix) => ({ prefix, kind: 'PROJECT' as RecordKind })),
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
    latestAnswerMap(personId),
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

  if (!latest.responseId || !sheet?.currentVersion) return [];
  const answers = latest.answers;
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
