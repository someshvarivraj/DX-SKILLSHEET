/**
 * Candidates answering a question set through a personal link (phase 3).
 *
 *   admin adds a candidate  -> Person + a DRAFT response with a token
 *   candidate opens /answer/<token>, answers, drafts are saved as they go
 *   candidate submits       -> SUBMITTED, the link closes, and the skill sheet
 *                              is built exactly as after an answer-file import
 *
 * A link works while the set is 受付中 (OPEN), its deadline has not passed and
 * the response is not yet submitted (approved 2026-10-05: "until the deadline
 * or the first submission"). Later changes go through the admin.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { recordAudit } from '@/lib/audit';
import { generateToken } from '@/lib/auth/crypto';
import { withBasePath } from '@/lib/base-path';
import { UNNAMED_PERSON } from '@/lib/constants';
import { buildCandidateInviteEmail, sendMail } from '@/lib/mail';
import { candidateLoginLink, ensureCandidateUser, LINK_DAYS } from './candidate-access';
import { enqueueGeneration } from '@/lib/sheet/generation-jobs';
import { getEditableVersion, getOrCreateSkillSheet } from '@/lib/sheet/version';
import { ensureRecords, parseDate, upsertJlpt } from '@/lib/import/run';
import { askedWording } from './manage';
import { toAnswerMap } from './answers';
import { answerProblem, isBlank, isShown, type AnswerValue, type QuestionRule, type ShowIf, type Validation } from './validate';

export type FormQuestion = {
  key: string;
  type: string;
  titleJa: string;
  titleEn: string | null;
  help: string | null;
  exampleJa: string | null;
  exampleEn: string | null;
  options: string[];
  allowOther: boolean;
  gridRows: string[];
  gridColumns: string[];
  required: boolean;
  showIf: ShowIf;
  validation: Validation;
};

export type FormPage = {
  key: string;
  titleJa: string;
  titleEn: string | null;
  isRepeating: boolean;
  maxEntries: number;
  questions: FormQuestion[];
};

export type DraftAnswer = { itemKey: string; entry: number; value: AnswerValue };

export type AnswerFormState =
  | { state: 'notfound' }
  | { state: 'closed'; setName: string; reason: 'notopen' | 'deadline' }
  | { state: 'submitted'; setName: string; name: string; submittedAt: Date | null }
  | {
      state: 'open';
      token: string;
      setName: string;
      name: string;
      deadline: Date | null;
      pages: FormPage[];
      answers: DraftAnswer[];
    };

function deadlinePassed(deadline: Date | null): boolean {
  return Boolean(deadline && deadline.getTime() < Date.now());
}

export function answerLink(token: string): string {
  return `${getEnv().APP_URL.replace(/\/$/, '')}${withBasePath(`/answer/${token}`)}`;
}

/** The set's questions grouped into pages (one per subcategory), in the set's order. */
export async function loadSetPages(setId: string): Promise<FormPage[]> {
  const setItems = await prisma.questionSetItem.findMany({
    where: { setId, item: { status: { not: 'REPLACED' } } },
    orderBy: { order: 'asc' },
    include: { item: { include: { subcategory: true } } },
  });
  const pages = new Map<string, FormPage>();
  for (const si of setItems) {
    const sub = si.item.subcategory;
    let page = pages.get(sub.id);
    if (!page) {
      page = { key: sub.key, titleJa: sub.nameJa, titleEn: sub.nameEn, isRepeating: sub.isRepeating, maxEntries: sub.maxEntries, questions: [] };
      pages.set(sub.id, page);
    }
    const w = askedWording(si.item, si.wording);
    page.questions.push({
      key: si.item.key,
      type: si.item.type,
      titleJa: w.titleJa,
      titleEn: w.titleEn,
      help: w.help,
      exampleJa: si.item.exampleJa,
      exampleEn: si.item.exampleEn,
      options: w.options,
      allowOther: w.allowOther,
      gridRows: w.gridRows,
      gridColumns: w.gridColumns,
      required: si.isRequired,
      showIf: (si.showIf as ShowIf) ?? null,
      validation: (si.item.validation as Validation) ?? null,
    });
  }
  return [...pages.values()];
}

async function openResponse(token: string) {
  const response = await prisma.response.findUnique({
    where: { token },
    include: { set: true, person: true, answers: { include: { item: { select: { key: true } } } } },
  });
  if (!response) return { error: 'notfound' as const };
  if (response.status === 'SUBMITTED') return { error: 'submitted' as const, response };
  if (response.set.status !== 'OPEN') return { error: 'notopen' as const, response };
  if (deadlinePassed(response.set.deadline)) return { error: 'deadline' as const, response };
  return { response };
}

export async function loadAnswerForm(token: string): Promise<AnswerFormState> {
  const r = await openResponse(token);
  if (r.error === 'notfound') return { state: 'notfound' };
  const response = r.response!;
  const name = response.person?.fullNameEnglish ?? '';
  if (r.error === 'submitted') return { state: 'submitted', setName: response.set.name, name, submittedAt: response.submittedAt };
  if (r.error) return { state: 'closed', setName: response.set.name, reason: r.error };
  return {
    state: 'open',
    token,
    setName: response.set.name,
    name,
    deadline: response.set.deadline,
    pages: await loadSetPages(response.setId),
    answers: response.answers.map((a) => ({ itemKey: a.item.key, entry: a.entry, value: a.value as AnswerValue })),
  };
}

/** Replace the draft's answers with what the screen holds. Blank answers are dropped. */
async function writeAnswers(responseId: string, setId: string, answers: DraftAnswer[]) {
  const setItems = await prisma.questionSetItem.findMany({ where: { setId }, include: { item: { select: { id: true, key: true } } } });
  const idByKey = new Map(setItems.map((si) => [si.item.key, si.item.id]));
  const rows = answers
    .filter((a) => idByKey.has(a.itemKey) && !isBlank(a.value) && a.entry >= 1 && a.entry <= 20)
    .map((a) => ({ responseId, itemId: idByKey.get(a.itemKey)!, entry: a.entry, value: a.value as Prisma.InputJsonValue }));
  await prisma.$transaction([
    prisma.answer.deleteMany({ where: { responseId } }),
    prisma.answer.createMany({ data: rows, skipDuplicates: true }),
    prisma.response.update({ where: { id: responseId }, data: { updatedAt: new Date() } }),
  ]);
}

export async function saveDraft(token: string, answers: DraftAnswer[]): Promise<{ ok: boolean; error?: string }> {
  const r = await openResponse(token);
  if (r.error) return { ok: false, error: r.error };
  await writeAnswers(r.response.id, r.response.setId, answers);
  return { ok: true };
}

/** Problems that stop a submission: required answers missing, values out of range. */
export function findProblems(pages: FormPage[], answers: DraftAnswer[]): Array<{ itemKey: string; entry: number; problem: string }> {
  const byKey = new Map(answers.map((a) => [`${a.itemKey}#${a.entry}`, a.value]));
  const valueOf = (key: string, entry = 1) => byKey.get(`${key}#${entry}`) ?? byKey.get(`${key}#1`);
  const problems: Array<{ itemKey: string; entry: number; problem: string }> = [];
  for (const page of pages) {
    const entries = page.isRepeating
      ? Math.max(1, ...answers.filter((a) => page.questions.some((q) => q.key === a.itemKey)).map((a) => a.entry))
      : 1;
    for (let entry = 1; entry <= entries; entry++) {
      for (const q of page.questions) {
        if (!isShown(q.showIf, (k) => valueOf(k, entry))) continue;
        // In a repeating part, only the first entry is required; later ones are optional.
        const rule: QuestionRule = { ...q, required: q.required && entry === 1 };
        const problem = answerProblem(rule, byKey.get(`${q.key}#${entry}`));
        if (problem) problems.push({ itemKey: q.key, entry, problem });
      }
    }
  }
  return problems;
}

/** Drop answers to questions their condition hides (a Master's degree after choosing Bachelor's). */
function shownOnly(pages: FormPage[], answers: DraftAnswer[]): DraftAnswer[] {
  const byKey = new Map(answers.map((a) => [`${a.itemKey}#${a.entry}`, a.value]));
  const showIf = new Map(pages.flatMap((p) => p.questions.map((q) => [q.key, q.showIf] as const)));
  return answers.filter((a) =>
    isShown(showIf.get(a.itemKey) ?? null, (k) => byKey.get(`${k}#${a.entry}`) ?? byKey.get(`${k}#1`)),
  );
}

export async function submitAnswers(
  token: string,
  answers: DraftAnswer[],
): Promise<{ ok: true } | { ok: false; error?: string; problems?: ReturnType<typeof findProblems> }> {
  const r = await openResponse(token);
  if (r.error) return { ok: false, error: r.error };
  const pages = await loadSetPages(r.response.setId);
  const problems = findProblems(pages, answers);
  if (problems.length > 0) return { ok: false, problems };

  await writeAnswers(r.response.id, r.response.setId, shownOnly(pages, answers));
  await prisma.response.update({ where: { id: r.response.id }, data: { status: 'SUBMITTED', submittedAt: new Date() } });
  await recordAudit({
    action: 'import.run',
    entityType: 'Response',
    entityId: r.response.id,
    personId: r.response.personId ?? undefined,
    summary: `${r.response.person?.fullNameEnglish ?? ''} が質問セット「${r.response.set.name}」に回答した`,
  });
  await buildSheetFromResponse(r.response.id);
  return { ok: true };
}

/**
 * After a submission: update the person, then do what an answer-file import
 * does — JLPT results, records, and the AI generation in the background for a
 * first answer (a later one shows differences to review instead).
 */
export async function buildSheetFromResponse(responseId: string) {
  const response = await prisma.response.findUniqueOrThrow({
    where: { id: responseId },
    include: { answers: { include: { item: { select: { key: true } } } }, set: true },
  });
  if (!response.personId) return;
  const answers = toAnswerMap(response.answers.map((a) => ({ key: a.item.key, entry: a.entry, value: a.value })));
  const str = (k: string) => (typeof answers[k] === 'string' ? (answers[k] as string).trim() : '');
  const name = str('A-1-1') || str('A-2-1');
  const kana = str('A-1-2') || str('A-2-2');
  const person = await prisma.person.update({
    where: { id: response.personId },
    data: {
      ...(name ? { fullNameEnglish: name } : {}),
      ...(kana ? { fullNameKatakana: kana } : {}),
      ...(parseDate(str('A-1-4')) ? { dateOfBirth: parseDate(str('A-1-4')) } : {}),
    },
  });
  await upsertJlpt(person.id, answers);

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, orderBy: { createdAt: 'asc' } });
  const userId = admin?.id ?? '';
  const sheet = await getOrCreateSkillSheet(person.id);
  await ensureRecords(sheet.id, answers, userId);

  const earlier = await prisma.response.count({
    where: { personId: person.id, status: 'SUBMITTED', id: { not: response.id } },
  });
  const hasValues = await prisma.fieldValue.count({ where: { version: { skillSheetId: sheet.id } } });
  if (earlier === 0 || hasValues === 0) {
    const version = await getEditableVersion(sheet.id, userId || undefined);
    enqueueGeneration({ personId: person.id, name: person.fullNameKatakana ?? person.fullNameEnglish, versionId: version.id, userId });
  }
}

// ---------------------------------------------------------------------------
// Admin side
// ---------------------------------------------------------------------------

/**
 * Add candidates to a set, each with a personal link. A person found by
 * e-mail is reused; if they already answered (e.g. on the Google Form), the
 * new draft starts from their latest answers so they only check and confirm.
 */
export async function addCandidates(
  setId: string,
  rows: Array<{ name: string; email: string }>,
  userId: string,
): Promise<{ created: number; reused: number }> {
  const set = await prisma.questionSet.findUniqueOrThrow({ where: { id: setId }, include: { items: { include: { item: { select: { id: true } } } } } });
  const inSet = new Set(set.items.map((si) => si.itemId));
  let created = 0;
  let reused = 0;
  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    const name = row.name.trim();
    if (!email && !name) continue;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`メールアドレスの形式が正しくありません: ${email}`);
    let person = email ? await prisma.person.findUnique({ where: { email } }) : null;
    if (!person) {
      person = await prisma.person.create({ data: { email: email || null, fullNameEnglish: name || UNNAMED_PERSON } });
    }
    if (await createDraftFor(setId, person.id, inSet)) created++;
    else reused++;
    // Their login to マイページ. Without an address, or with one a staff account
    // uses, it is made (or the problem shown) when the link is sent.
    if (person.email) await ensureCandidateUser(person.id).catch(() => undefined);
  }
  await recordAudit({
    userId,
    action: 'definition.update',
    entityType: 'QuestionSet',
    entityId: setId,
    summary: `質問セット「${set.name}」に候補者を追加した（新規${created}件）`,
  });
  return { created, reused };
}

/** A draft with a link for one person, pre-filled from their latest answers. False if one exists. */
async function createDraftFor(setId: string, personId: string, inSet: Set<string>): Promise<boolean> {
  const existing = await prisma.response.findFirst({ where: { setId, personId, status: 'DRAFT' } });
  if (existing) return false;
  const latest = await prisma.response.findFirst({
    where: { personId, status: 'SUBMITTED' },
    orderBy: { createdAt: 'desc' },
    include: { answers: true },
  });
  await prisma.response.create({
    data: {
      setId,
      personId,
      status: 'DRAFT',
      source: 'APP',
      token: generateToken(24),
      answers: {
        create: (latest?.answers ?? [])
          .filter((a) => inSet.has(a.itemId))
          .map((a) => ({ itemId: a.itemId, entry: a.entry, value: a.value as Prisma.InputJsonValue })),
      },
    },
  });
  return true;
}

/**
 * E-mail the candidate a link to their page: the first invitation, or — when
 * they have answered before — a request to update their answers.
 */
export async function sendInvite(responseId: string, userId: string) {
  const response = await prisma.response.findUniqueOrThrow({ where: { id: responseId }, include: { person: true, set: true } });
  if (response.status !== 'DRAFT') throw new Error('この回答は提出済みのため、リンクを送れません');
  if (!response.person?.email) throw new Error('メールアドレスが登録されていません');
  const { link, email } = await candidateLoginLink(response.person.id);
  const answeredBefore = await prisma.response.count({ where: { personId: response.person.id, status: 'SUBMITTED' } });
  const mail = buildCandidateInviteEmail({
    name: response.person.fullNameEnglish,
    link,
    kind: answeredBefore > 0 ? 'update' : 'first',
    deadline: response.set.deadline,
    days: LINK_DAYS,
  });
  await sendMail({ ...mail, to: email });
  await prisma.response.update({ where: { id: responseId }, data: { invitedAt: new Date() } });
  await recordAudit({ userId, action: 'definition.update', entityType: 'Response', entityId: responseId, personId: response.personId ?? undefined, summary: `マイページのログインリンクを ${email} に送った` });
}

/** Reopen a submitted response for changes: a new draft from its answers, with a new link. */
export async function reopenForChanges(responseId: string, userId: string) {
  const response = await prisma.response.findUniqueOrThrow({ where: { id: responseId }, include: { person: true } });
  if (!response.personId) throw new Error('候補者が見つかりません');
  const items = await prisma.questionSetItem.findMany({ where: { setId: response.setId }, select: { itemId: true } });
  await createDraftFor(response.setId, response.personId, new Set(items.map((i) => i.itemId)));
  await recordAudit({ userId, action: 'definition.update', entityType: 'Response', entityId: responseId, personId: response.personId, summary: '修正のために回答を再開した' });
}

export async function removeDraft(responseId: string) {
  const response = await prisma.response.findUniqueOrThrow({ where: { id: responseId } });
  if (response.status !== 'DRAFT') throw new Error('提出済みの回答は削除できません');
  await prisma.response.delete({ where: { id: responseId } });
}
