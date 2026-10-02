'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { previewImport, runImport, type ImportPreview } from '@/lib/import/run';

export type ImportActionState = {
  step: 'idle' | 'preview' | 'done';
  preview?: ImportPreview;
  message?: string;
  error?: string;
  created?: number;
  updated?: number;
  needsReview?: Array<{ personId: string; name: string }>;
  /** New people whose AI generation is now running in the background. */
  generationQueued?: number;
};

async function guard() {
  const user = await requireUser();
  if (!can(user, 'import.run')) throw new Error('取り込みを実行する権限がない');
  return user;
}

async function readFile(formData: FormData) {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('ファイルを選択してください');
  }
  return { fileName: file.name, buffer: await file.arrayBuffer() };
}

/** Answer files go into the default question set (the latest .gs upload). */
async function defaultSetId(): Promise<string> {
  const set = await prisma.questionSet.findFirst({ where: { isDefault: true } });
  if (!set) {
    throw new Error(
      '取り込み先の質問セットがありません。先に「設問マスタ」画面でGoogleフォームのスクリプトを取り込んでください。',
    );
  }
  return set.id;
}

export async function previewImportAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  try {
    await guard();
    const { fileName, buffer } = await readFile(formData);
    const { preview } = await previewImport({
      fileName,
      buffer,
      setId: await defaultSetId(),
    });
    return { step: 'preview', preview };
  } catch (error) {
    return { step: 'idle', error: (error as Error).message };
  }
}

export async function runImportAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  try {
    const user = await guard();
    const { fileName, buffer } = await readFile(formData);
    const generate = formData.get('generate') === 'on';

    const outcome = await runImport({
      fileName,
      buffer,
      setId: await defaultSetId(),
      source: /\.xlsx?$/i.test(fileName) ? 'XLSX' : 'CSV',
      userId: user.id,
      generateOnFirstImport: generate,
    });

    revalidatePath('/people');
  // The 取り込み履歴 table lives on this page; without this it still shows the
  // previous batches and the operator re-runs the import.
  revalidatePath('/admin/import');

    return {
      step: 'done',
      created: outcome.created,
      updated: outcome.updated,
      needsReview: outcome.needsReview,
      generationQueued: outcome.generationQueued,
      message: `取り込みが完了しました。新規${outcome.created}件、既存${outcome.updated}件。`,
    };
  } catch (error) {
    return { step: 'idle', error: (error as Error).message };
  }
}
