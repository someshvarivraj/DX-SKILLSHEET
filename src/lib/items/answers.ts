/**
 * Answers per item (design, 2026-10-02).
 *
 * Stored: one row per item and entry (Answer). Read: everything downstream —
 * field sources, the deterministic rules, the AI pipeline, JLPT and record
 * creation — looks answers up by item key, with a repeating item's "-x-"
 * replaced by its entry number ("E-x-6", entry 2 -> "E-2-6"). `toAnswerMap`
 * builds exactly that lookup, so none of those needed to change.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { splitTitle } from '@/lib/form/parse-apps-script';
import type { QuestionRef } from '@/lib/import/match';
import { isShown, type AnswerValue, type ShowIf } from './validate';

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
  /** Each question's display condition in this set, by item key. */
  showIf: Map<string, ShowIf>;
}> {
  const setItems = await prisma.questionSetItem.findMany({
    where: { setId },
    orderBy: { order: 'asc' },
    include: { item: true },
  });
  const refs: QuestionRef[] = [];
  const types = new Map<string, string>();
  const codes: SetCodeMap = new Map();
  const showIf = new Map<string, ShowIf>();
  for (const si of setItems) {
    if (si.showIf) showIf.set(si.item.key, si.showIf as ShowIf);
    si.formCodes.forEach((code, index) => {
      const header = si.formHeaders[index] ?? `${code}. ${si.item.titleJa}`;
      const { ja, en } = splitTitle(header);
      refs.push({ code, fullTitle: header, titleJa: ja, titleEn: en, type: si.item.type, gridRows: si.item.gridRows });
      types.set(code, si.item.type);
      codes.set(code, { itemId: si.itemId, key: si.item.key, entry: index + 1 });
    });
  }
  return { refs, types, codes, showIf };
}

/**
 * Answers to questions the form would not have shown, dropped — as on the
 * answer screen. A bachelor's student who also picked something in the
 * master's 学位 list (B-1-2(M), shown only for 修士) no longer gets that
 * printed beside their B.Tech.
 */
export function dropHiddenAnswers(items: ItemAnswer[], showIf: Map<string, ShowIf>): ItemAnswer[] {
  if (showIf.size === 0) return items;
  const valueOf = new Map(items.map((a) => [`${a.key}#${a.entry}`, a.value]));
  return items.filter((a) =>
    isShown(showIf.get(a.key) ?? null, (key) =>
      (valueOf.get(`${key}#${a.entry}`) ?? valueOf.get(`${key}#1`)) as AnswerValue | undefined,
    ),
  );
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
  // Answers stored before the import applied the form's conditions may still
  // hold a hidden page's answer; the sheet never reads those.
  const setItems = await prisma.questionSetItem.findMany({
    where: { setId: response.setId, showIf: { not: Prisma.DbNull } },
    select: { showIf: true, item: { select: { key: true } } },
  });
  const showIf = new Map(setItems.map((si) => [si.item.key, si.showIf as ShowIf]));
  const items = response.answers.map((a) => ({ itemId: a.itemId, key: a.item.key, entry: a.entry, value: a.value }));
  return {
    responseId: response.id,
    answers: toAnswerMap(dropHiddenAnswers(items, showIf)),
  };
}

/**
 * The item keys the person's question set asks (the set of their latest
 * submitted response), or null when they have no response — then nothing is
 * treated as "not asked".
 */
export async function askedItemKeys(personId: string): Promise<Set<string> | null> {
  const response = await prisma.response.findFirst({
    where: { personId, status: 'SUBMITTED' },
    orderBy: { createdAt: 'desc' },
    select: { set: { select: { items: { select: { item: { select: { key: true } } } } } } },
  });
  if (!response) return null;
  return new Set(response.set.items.map((i) => i.item.key));
}

export type Gender = 'male' | 'female';

/**
 * Each person's gender from their latest submitted answers (A-1-3,
 * 「男性／Male」「女性／Female」), for the people list. People who have not
 * answered it are left out.
 */
export async function gendersOf(personIds: string[]): Promise<Map<string, Gender>> {
  const rows = await prisma.answer.findMany({
    where: {
      item: { key: 'A-1-3' },
      response: { personId: { in: personIds }, status: 'SUBMITTED' },
    },
    select: { value: true, response: { select: { personId: true, createdAt: true } } },
    orderBy: { response: { createdAt: 'desc' } },
  });
  const out = new Map<string, Gender>();
  for (const row of rows) {
    const personId = row.response.personId;
    if (!personId || out.has(personId)) continue; // newest first
    const v = String(row.value ?? '').toLowerCase();
    if (v.includes('女') || /\bfemale\b|\bwoman\b/.test(v)) out.set(personId, 'female');
    else if (v.includes('男') || /\bmale\b|\bman\b/.test(v)) out.set(personId, 'male');
  }
  return out;
}
