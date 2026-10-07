'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { planFromGs } from '@/lib/items/gs-plan';
import { applyGsPlan, previewGsPlan, type GsPreview, type ItemDecision } from '@/lib/items/gs-apply';
import type { QuestionSetStatus } from '@prisma/client';
import {
  copySet,
  createCategory,
  createGroup,
  createItem,
  createSetForGroup,
  createSubcategory,
  deleteCategory,
  deleteGroup,
  deleteItem,
  deleteSet,
  deleteSubcategory,
  findOrCreateGroup,
  moveSetItem,
  renameCategory,
  renameGroup,
  replaceItem,
  setItemAsked,
  setItemCondition,
  setItemHidden,
  setItemRequired,
  updateItem,
  updateSet,
  updateSubcategory,
  type ItemInput,
  type ShowIf,
} from '@/lib/items/manage';
import { addCandidates, reopenForChanges, removeDraft, sendInvite } from '@/lib/items/candidate';
import { candidateLoginLink } from '@/lib/items/candidate-access';

export type GsUploadState = {
  step: 'idle' | 'preview' | 'done';
  fileName?: string;
  preview?: GsPreview;
  message?: string;
  error?: string;
};

async function guard() {
  const user = await requireUser();
  if (!can(user, 'definition.manage')) throw new Error('設問マスタを変更する権限がない');
  return user;
}

async function readPlan(formData: FormData) {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) throw new Error('.gs ファイルを選択してください');
  const plan = planFromGs(await file.text());
  if (plan.items.length === 0) {
    throw new Error('設問が1件も見つかりませんでした。createForm() を定義した.gsファイルか確認してください。');
  }
  return { fileName: file.name, plan };
}

function refresh() {
  revalidatePath('/admin/items', 'layout');
  revalidatePath('/admin/fields');
  revalidatePath('/admin/import');
}

/** Reads the file and shows what an upload would do — nothing is saved. */
export async function previewGsAction(_prev: GsUploadState, formData: FormData): Promise<GsUploadState> {
  try {
    await guard();
    const { fileName, plan } = await readPlan(formData);
    return { step: 'preview', fileName, preview: await previewGsPlan(plan) };
  } catch (e) {
    return { step: 'idle', error: e instanceof Error ? e.message : '読み込みに失敗しました' };
  }
}

export async function importGsAction(_prev: GsUploadState, formData: FormData): Promise<GsUploadState> {
  try {
    const user = await guard();
    const { fileName, plan } = await readPlan(formData);
    const setName = String(formData.get('setName') ?? '').trim();
    if (!setName) throw new Error('質問セットの名前を入力してください');

    const groupTypeId = String(formData.get('groupTypeId') ?? '');
    const newGroup = String(formData.get('newGroupName') ?? '').trim();
    if (groupTypeId === '__new' && !newGroup) throw new Error('新しいグループの名前を入力してください');

    const decisions: Record<string, ItemDecision> = {};
    for (const [name, value] of formData.entries()) {
      if (!name.startsWith('decision:')) continue;
      if (value === 'same' || value === 'different') decisions[name.slice('decision:'.length)] = value;
    }

    const makeDefault = formData.get('makeDefault') === 'on';
    const result = await applyGsPlan({
      plan,
      setName,
      groupTypeId: groupTypeId === '__new' ? null : groupTypeId,
      newGroupName: groupTypeId === '__new' ? newGroup : null,
      sourceFile: fileName,
      userId: user.id,
      decisions,
      makeDefault,
    });
    refresh();
    return {
      step: 'done',
      fileName,
      message: `質問セット「${setName}」を作成しました。設問マスタに新しく${result.createdItems}件を追加し、${result.keptItems}件はそのまま使っています。`,
    };
  } catch (e) {
    return { step: 'idle', error: e instanceof Error ? e.message : '取り込みに失敗しました' };
  }
}

/** Answer files are imported into the default set. */
export async function setDefaultSetAction(setId: string): Promise<{ ok: boolean; message: string }> {
  const user = await guard();
  const previous = await prisma.questionSet.findFirst({ where: { isDefault: true }, select: { name: true } });
  const [, next] = await prisma.$transaction([
    prisma.questionSet.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
    prisma.questionSet.update({ where: { id: setId }, data: { isDefault: true } }),
  ]);
  await recordAudit({
    userId: user.id,
    action: 'definition.update',
    entityType: 'QuestionSet',
    entityId: setId,
    summary: `回答ファイルの取り込み先を「${previous?.name ?? 'なし'}」から「${next.name}」に変更した`,
  });
  refresh();
  return { ok: true, message: '回答ファイルの取り込み先を変更しました' };
}

// ---------------------------------------------------------------------------
// Editing on screen (phase 2)
// ---------------------------------------------------------------------------

export type ActionResult = { ok: boolean; message: string; id?: string };

async function run(summary: string, fn: () => Promise<{ id?: string } | void>, done: string): Promise<ActionResult> {
  try {
    const user = await guard();
    const result = await fn();
    await recordAudit({ userId: user.id, action: 'definition.update', summary });
    refresh();
    return { ok: true, message: done, id: result && 'id' in result ? result.id : undefined };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '保存に失敗しました' };
  }
}

export async function saveItemAction(input: { itemId?: string; subcategoryId?: string; data: ItemInput }) {
  return run(
    input.itemId ? `設問「${input.data.titleJa}」を更新した` : `設問「${input.data.titleJa}」を追加した`,
    async () => {
      if (input.itemId) return updateItem(input.itemId, input.data);
      if (!input.subcategoryId) throw new Error('サブカテゴリを選んでください');
      return createItem(input.subcategoryId, input.data);
    },
    '保存しました',
  );
}

export async function setItemHiddenAction(itemId: string, hidden: boolean) {
  return run(`設問を${hidden ? '非表示' : '再表示'}にした`, () => setItemHidden(itemId, hidden).then(() => undefined), hidden ? '非表示にしました（回答は残っています）' : '表示に戻しました');
}

export async function replaceItemAction(fromId: string, toId: string) {
  let detail = '';
  const result = await run('設問を置き換えた', async () => {
    const r = await replaceItem(fromId, toId);
    detail = `「${r.from}」を「${r.to}」に置き換えました（回答${r.moved}件を移動）`;
  }, '');
  return result.ok ? { ...result, message: detail } : result;
}

export async function deleteItemAction(itemId: string) {
  return run('設問を削除した', () => deleteItem(itemId), '削除しました');
}

export async function saveCategoryAction(input: { id?: string; nameJa: string; nameEn?: string | null }) {
  return run(
    `カテゴリ「${input.nameJa}」を${input.id ? '更新' : '追加'}した`,
    () => (input.id ? renameCategory(input.id, input.nameJa, input.nameEn) : createCategory(input.nameJa, input.nameEn)),
    '保存しました',
  );
}

export async function deleteCategoryAction(id: string) {
  return run('カテゴリを削除した', () => deleteCategory(id), '削除しました');
}

export async function saveSubcategoryAction(input: {
  id?: string;
  categoryId?: string;
  nameJa: string;
  nameEn?: string | null;
  isRepeating?: boolean;
  maxEntries?: number;
}) {
  return run(
    `サブカテゴリ「${input.nameJa}」を${input.id ? '更新' : '追加'}した`,
    async () => {
      if (input.id) return updateSubcategory(input.id, input);
      if (!input.categoryId) throw new Error('カテゴリを選んでください');
      return createSubcategory(input.categoryId, { ...input, isRepeating: Boolean(input.isRepeating) });
    },
    '保存しました',
  );
}

export async function deleteSubcategoryAction(id: string) {
  return run('サブカテゴリを削除した', () => deleteSubcategory(id), '削除しました');
}

export async function saveGroupAction(input: { id?: string; nameJa: string; nameEn?: string | null }) {
  return run(
    `グループ「${input.nameJa}」を${input.id ? '更新' : '追加'}した`,
    () => (input.id ? renameGroup(input.id, input.nameJa, input.nameEn) : createGroup(input.nameJa, input.nameEn)),
    '保存しました',
  );
}

export async function deleteGroupAction(id: string) {
  return run('グループを削除した', () => deleteGroup(id), '削除しました');
}

export async function createSetAction(input: {
  name: string;
  groupTypeId: string | null;
  /** A new group's name, created (or found, if it exists) in the same step. */
  newGroupName?: string | null;
  copyFromId?: string | null;
}) {
  return run(
    `質問セット「${input.name}」を作成した`,
    async () => {
      const groupTypeId = input.newGroupName?.trim() ? await findOrCreateGroup(input.newGroupName) : input.groupTypeId;
      if (!groupTypeId) throw new Error('グループを選んでください');
      return input.copyFromId ? copySet(input.copyFromId, input.name, groupTypeId) : createSetForGroup(input.name, groupTypeId);
    },
    '質問セットを作成しました',
  );
}

export async function updateSetAction(
  setId: string,
  input: { name: string; groupTypeId: string; status: QuestionSetStatus; deadline: string | null },
) {
  return run(
    `質問セット「${input.name}」を更新した`,
    () =>
      updateSet(setId, { ...input, deadline: input.deadline ? new Date(`${input.deadline}T23:59:59+09:00`) : null }).then(
        () => undefined,
      ),
    '保存しました',
  );
}

export async function deleteSetAction(setId: string) {
  return run('質問セットを削除した', () => deleteSet(setId), '削除しました');
}

export async function setItemAskedAction(setId: string, itemId: string, asked: boolean) {
  return run(asked ? '質問セットに設問を追加した' : '質問セットから設問を外した', () => setItemAsked(setId, itemId, asked), asked ? '聞く設問に追加しました' : '聞く設問から外しました');
}

export async function setItemRequiredAction(setId: string, itemId: string, required: boolean) {
  return run('質問セットの必須を変更した', () => setItemRequired(setId, itemId, required), required ? '必須にしました' : '任意にしました');
}

export async function setItemConditionAction(setId: string, itemId: string, showIf: ShowIf) {
  return run('質問セットの表示条件を変更した', () => setItemCondition(setId, itemId, showIf), '表示条件を保存しました');
}

export async function moveSetItemAction(setId: string, itemId: string, direction: -1 | 1) {
  return run('質問セットの並び順を変更した', () => moveSetItem(setId, itemId, direction), '並び順を保存しました');
}

// ---------------------------------------------------------------------------
// Candidates and personal links (phase 3)
// ---------------------------------------------------------------------------

export async function addCandidatesAction(setId: string, text: string): Promise<ActionResult> {
  try {
    const user = await guard();
    // One per line: "Name, email" (either may be missing, not both).
    const rows = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[,，\t]/).map((p) => p.trim());
        const email = parts.find((p) => p.includes('@')) ?? '';
        const name = parts.filter((p) => p !== email).join(' ').trim();
        return { name, email };
      });
    if (rows.length === 0) throw new Error('候補者を1人以上入力してください');
    const r = await addCandidates(setId, rows, user.id);
    refresh();
    return {
      ok: true,
      message: r.reused > 0 ? `${r.created}人を追加しました（${r.reused}人は既に追加済みです）` : `${r.created}人を追加しました`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '追加に失敗しました' };
  }
}

export async function sendInviteAction(responseId: string): Promise<ActionResult> {
  try {
    const user = await guard();
    await sendInvite(responseId, user.id);
    refresh();
    return { ok: true, message: 'マイページのログインリンクをメールで送りました' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '送信に失敗しました' };
  }
}

/** A link to the candidate's page, to paste into a chat. */
export async function candidateLinkAction(responseId: string): Promise<ActionResult & { link?: string }> {
  try {
    const user = await guard();
    const response = await prisma.response.findUniqueOrThrow({ where: { id: responseId } });
    if (!response.personId) throw new Error('候補者が見つかりません');
    const { link, email } = await candidateLoginLink(response.personId);
    await recordAudit({ userId: user.id, action: 'definition.update', entityType: 'Response', entityId: responseId, personId: response.personId, summary: `マイページのログインリンクを発行した（${email}）` });
    return { ok: true, message: 'ログインリンクをコピーしました', link };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '失敗しました' };
  }
}

export async function reopenResponseAction(responseId: string): Promise<ActionResult> {
  try {
    const user = await guard();
    await reopenForChanges(responseId, user.id);
    refresh();
    return { ok: true, message: '更新の依頼を作りました。「メールで送る」で本人に知らせてください' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '失敗しました' };
  }
}

export async function removeDraftAction(responseId: string): Promise<ActionResult> {
  return run('未提出の回答を削除した', () => removeDraft(responseId), '削除しました');
}

/** 受付を開始する — open the set so its answer links work. */
export async function openSetAction(setId: string): Promise<ActionResult> {
  return run(
    '質問セットの受付を開始した',
    () => prisma.questionSet.update({ where: { id: setId }, data: { status: 'OPEN' } }).then(() => undefined),
    '受付を開始しました。回答リンクが使えるようになりました',
  );
}
