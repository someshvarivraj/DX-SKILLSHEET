'use server';

import { revalidatePath } from 'next/cache';
import type { QuestionType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { recordAudit } from '@/lib/audit';
import { toCatalogue, type ParsedForm } from '@/lib/form/parse-apps-script';

/**
 * In-app replacement for `npm run form:parse` + `npm run db:seed`'s
 * seedFormRevision step. Sano-san's review (2026-09-29): dropping in a new
 * .gs and running two commands was a developer's step, not an operator's —
 * this does the same parsing (`toCatalogue`, shared with the CLI) and writes
 * straight to the database from the field-definition screen.
 *
 * What this does NOT do, on purpose: create sections or fields for the
 * questions it imports. Which section a question belongs to, and how its
 * answer should be processed, is a real editorial decision (README: "which
 * question feeds which position on the sheet is configuration data, not
 * code") — this only makes the question catalogue available. Newly imported
 * questions with no field yet show up in the existing "未割当の設問" panel,
 * same as today.
 */

async function guard() {
  const user = await requireUser();
  if (!can(user, 'definition.manage')) throw new Error('項目定義を変更する権限がない');
  return user;
}

export type FormImportState = {
  step: 'idle' | 'preview' | 'done';
  catalogue?: ParsedForm;
  /** Question codes this revision doesn't have yet — new since last import, if any. */
  newCodes?: string[];
  /** Question codes already known under this revision code — will be updated in place. */
  knownCodeCount?: number;
  message?: string;
  error?: string;
};

async function readGsFile(formData: FormData): Promise<{ fileName: string; text: string }> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('.gs ファイルを選択してください');
  }
  return { fileName: file.name, text: await file.text() };
}

function defaultRevisionCode(fileName: string): string {
  return fileName.match(/(\d{4})/)?.[1] ?? String(new Date().getFullYear());
}

function parse(text: string, revisionCode: string, fileName: string): ParsedForm {
  const catalogue = toCatalogue(text, revisionCode, fileName);
  if (catalogue.questions.length === 0) {
    throw new Error(
      '設問が1件も見つからなかった。createForm() を定義した正しい.gsファイルか確認すること。',
    );
  }
  return catalogue;
}

/** Reads the file and shows what would be imported — nothing is saved yet. */
export async function previewFormScriptAction(
  _prev: FormImportState,
  formData: FormData,
): Promise<FormImportState> {
  try {
    await guard();
    const { fileName, text } = await readGsFile(formData);
    const revisionCode =
      String(formData.get('revisionCode') ?? '').trim() || defaultRevisionCode(fileName);
    const catalogue = parse(text, revisionCode, fileName);

    const existing = await prisma.formQuestion.findMany({
      where: { formRevision: { code: revisionCode } },
      select: { code: true },
    });
    const knownCodes = new Set(existing.map((q) => q.code));
    const newCodes = catalogue.questions
      .filter((q) => !knownCodes.has(q.code))
      .map((q) => q.code);

    return {
      step: 'preview',
      catalogue,
      newCodes,
      knownCodeCount: catalogue.questions.length - newCodes.length,
    };
  } catch (e) {
    return { step: 'idle', error: e instanceof Error ? e.message : '解析に失敗した' };
  }
}

/** Parses the same file again and writes the revision + questions to the database. */
export async function importFormScriptAction(
  _prev: FormImportState,
  formData: FormData,
): Promise<FormImportState> {
  try {
    const user = await guard();
    const { fileName, text } = await readGsFile(formData);
    const revisionCode =
      String(formData.get('revisionCode') ?? '').trim() || defaultRevisionCode(fileName);
    const catalogue = parse(text, revisionCode, fileName);

    const revision = await prisma.$transaction(async (tx) => {
      // Only one revision is ever active at a time — the 取り込み screen
      // picks it with `findFirst({ where: { isActive: true } })`, so any
      // other revision must be deactivated when a new one comes in.
      await tx.formRevision.updateMany({
        where: { code: { not: revisionCode } },
        data: { isActive: false },
      });
      const rev = await tx.formRevision.upsert({
        where: { code: revisionCode },
        create: {
          code: revisionCode,
          name: `${revisionCode}年度 IITアンケート`,
          sourceFile: fileName,
          isActive: true,
        },
        update: { sourceFile: fileName, isActive: true },
      });

      for (const q of catalogue.questions) {
        const data = {
          titleJa: q.titleJa,
          titleEn: q.titleEn,
          helpText: q.helpText,
          type: q.type as QuestionType,
          sectionLabel: q.sectionLabel,
          options: q.options,
          gridRows: q.gridRows,
          gridColumns: q.gridColumns,
          responseHeader: q.fullTitle,
          isRequired: q.isRequired,
          order: q.order,
        };
        await tx.formQuestion.upsert({
          where: { formRevisionId_code: { formRevisionId: rev.id, code: q.code } },
          create: { formRevisionId: rev.id, code: q.code, ...data },
          update: data,
        });
      }
      return rev;
    });

    await recordAudit({
      userId: user.id,
      action: 'definition.update',
      entityType: 'FormRevision',
      entityId: revision.id,
      summary: `Googleフォームのスクリプト「${fileName}」から設問${catalogue.questions.length}件を取り込んだ（${revisionCode}年度）`,
    });

    revalidatePath('/admin/fields');
    revalidatePath('/admin/import');

    return {
      step: 'done',
      message: `${catalogue.questions.length}件の設問を取り込みました（${revisionCode}年度）。項目定義から各セクションに割り当ててください。`,
    };
  } catch (e) {
    return { step: 'idle', error: e instanceof Error ? e.message : '取り込みに失敗した' };
  }
}
