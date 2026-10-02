/**
 * Answers per item (design, 2026-10-02).
 *
 * Stored: one row per item and entry (Answer). Read: everything downstream —
 * field sources, the deterministic rules, the AI pipeline, JLPT and record
 * creation — looks answers up by item key, with a repeating item's "-x-"
 * replaced by its entry number ("E-x-6", entry 2 -> "E-2-6"). `toAnswerMap`
 * builds exactly that lookup, so none of those needed to change.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { splitTitle } from '@/lib/form/parse-apps-script';
import type { QuestionRef } from '@/lib/import/match';

export type ItemAnswer = { itemId: string; key: string; entry: number; value: unknown };

/** "E-x-6" + entry 2 -> "E-2-6"; any other key is returned as it is. */
export function answerKey(key: string, entry: number): string {
  return key.includes('-x-') ? key.replace('-x-', `-${entry}-`) : key;
}

export function toAnswerMap(answers: Array<{ key: string; entry: number; value: unknown }>): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const a of answers) map[answerKey(a.key, a.entry)] = a.value;
  return map;
}

export type SetCodeMap = Map<string, { itemId: string; key: string; entry: number }>;

/**
 * What an answer file for this set should contain: one question per form code
 * (for matching columns), and where each code's answer goes.
 */
export async function loadSetQuestions(setId: string): Promise<{
  refs: QuestionRef[];
  types: Map<string, string>;
  codes: SetCodeMap;
}> {
  const setItems = await prisma.questionSetItem.findMany({
    where: { setId },
    orderBy: { order: 'asc' },
    include: { item: true },
  });
  const refs: QuestionRef[] = [];
  const types = new Map<string, string>();
  const codes: SetCodeMap = new Map();
  for (const si of setItems) {
    si.formCodes.forEach((code, index) => {
      const header = si.formHeaders[index] ?? `${code}. ${si.item.titleJa}`;
      const { ja, en } = splitTitle(header);
      refs.push({ code, fullTitle: header, titleJa: ja, titleEn: en, type: si.item.type, gridRows: si.item.gridRows });
      types.set(code, si.item.type);
      codes.set(code, { itemId: si.itemId, key: si.item.key, entry: index + 1 });
    });
  }
  return { refs, types, codes };
}

/** Answers keyed by form code -> answers per item and entry. Empty answers are skipped. */
export function toItemAnswers(byCode: Record<string, unknown>, codes: SetCodeMap): ItemAnswer[] {
  const out: ItemAnswer[] = [];
  for (const [code, value] of Object.entries(byCode)) {
    const target = codes.get(code);
    if (!target || isBlank(value)) continue;
    out.push({ ...target, value });
  }
  return out;
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return String(value).trim() === '';
}

/** Store one imported row as a submitted response. */
export async function saveImportedResponse(params: {
  setId: string;
  personId: string;
  importBatchId: string;
  submittedAt: Date | null;
  answers: ItemAnswer[];
}) {
  return prisma.response.create({
    data: {
      setId: params.setId,
      personId: params.personId,
      importBatchId: params.importBatchId,
      source: 'IMPORT',
      status: 'SUBMITTED',
      submittedAt: params.submittedAt,
      answers: {
        create: params.answers.map((a) => ({
          itemId: a.itemId,
          entry: a.entry,
          value: a.value as Prisma.InputJsonValue,
        })),
      },
    },
  });
}

/**
 * The person's most recent response, as the answer lookup. A draft started on
 * the answer screen does not count until it is submitted.
 */
export async function latestAnswerMap(personId: string): Promise<{
  responseId: string | null;
  answers: Record<string, unknown>;
}> {
  const response = await prisma.response.findFirst({
    where: { personId, status: 'SUBMITTED' },
    // The latest import or submission wins, as with the answer files before.
    orderBy: { createdAt: 'desc' },
    include: { answers: { include: { item: { select: { key: true } } } } },
  });
  if (!response) return { responseId: null, answers: {} };
  return {
    responseId: response.id,
    answers: toAnswerMap(response.answers.map((a) => ({ key: a.item.key, entry: a.entry, value: a.value }))),
  };
}
