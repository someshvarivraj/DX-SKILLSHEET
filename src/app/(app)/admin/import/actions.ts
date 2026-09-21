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

async function activeRevisionId(): Promise<string> {
  const revision = await prisma.formRevision.findFirst({ where: { isActive: true } });
  if (!revision) {
    throw new Error(
      '有効なフォーム改訂が登録されていない。`npm run form:parse` と `npm run db:seed` を先に実行すること',
    );
  }
  return revision.id;
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
      formRevisionId: await activeRevisionId(),
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
      formRevisionId: await activeRevisionId(),
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
      message: `取り込みが完了した。新規${outcome.created}件、既存${outcome.updated}件。`,
    };
  } catch (error) {
    return { step: 'idle', error: (error as Error).message };
  }
}
