'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { planFromGs } from '@/lib/items/gs-plan';
import { applyGsPlan, previewGsPlan, type GsPreview, type ItemDecision } from '@/lib/items/gs-apply';

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
  revalidatePath('/admin/items');
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
