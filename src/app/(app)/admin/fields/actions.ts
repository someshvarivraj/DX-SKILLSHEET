'use server';

import { revalidatePath } from 'next/cache';
import type {
  Editing,
  GlossaryCategory,
  Processing,
  ValueType,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { recordAudit } from '@/lib/audit';

async function guard() {
  const user = await requireUser();
  if (!can(user, 'definition.manage')) throw new Error('項目定義を変更する権限がない');
  return user;
}

function refresh() {
  revalidatePath('/admin/fields');
  revalidatePath('/people');
}

export type SaveResult = { ok: boolean; message: string };

export async function updateSectionAction(input: {
  id: string;
  nameJa: string;
  nameEn?: string;
  order: number;
  isVisible: boolean;
  hideWhenEmpty: boolean;
  maxDisplayed: number;
  description?: string;
}): Promise<SaveResult> {
  const user = await guard();
  await prisma.sheetSection.update({
    where: { id: input.id },
    data: {
      nameJa: input.nameJa,
      nameEn: input.nameEn || null,
      order: input.order,
      isVisible: input.isVisible,
      hideWhenEmpty: input.hideWhenEmpty,
      maxDisplayed: input.maxDisplayed,
      description: input.description || null,
    },
  });
  await recordAudit({
    userId: user.id,
    action: 'definition.update',
    entityType: 'SheetSection',
    entityId: input.id,
    summary: `セクション「${input.nameJa}」を更新した`,
  });
  refresh();
  return { ok: true, message: '保存した' };
}

export async function reorderSectionsAction(
  orderedIds: string[],
): Promise<SaveResult> {
  const user = await guard();
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.sheetSection.update({ where: { id }, data: { order: (index + 1) * 10 } }),
    ),
  );
  await recordAudit({
    userId: user.id,
    action: 'definition.update',
    summary: 'セクションの並び順を変更した',
  });
  refresh();
  return { ok: true, message: '並び順を保存した' };
}

export async function updateFieldAction(input: {
  id: string;
  nameJa: string;
  nameEn?: string;
  order: number;
  processing: Processing;
  editing: Editing;
  valueType: ValueType;
  includeInPdf: boolean;
  displayToggle: boolean;
  isRequired: boolean;
  isActive: boolean;
  generationPrompt?: string;
  targetLengthMin?: number | null;
  targetLengthMax?: number | null;
  glossaryCategory?: GlossaryCategory | null;
  ruleKey?: string | null;
  helpText?: string;
  sourceCodes: string[];
}): Promise<SaveResult> {
  const user = await guard();

  await prisma.sheetField.update({
    where: { id: input.id },
    data: {
      nameJa: input.nameJa,
      nameEn: input.nameEn || null,
      order: input.order,
      processing: input.processing,
      editing: input.editing,
      valueType: input.valueType,
      includeInPdf: input.includeInPdf,
      displayToggle: input.displayToggle,
      isRequired: input.isRequired,
      isActive: input.isActive,
      generationPrompt: input.generationPrompt || null,
      targetLengthMin: input.targetLengthMin ?? null,
      targetLengthMax: input.targetLengthMax ?? null,
      glossaryCategory: input.glossaryCategory ?? null,
      ruleKey: input.ruleKey || null,
      helpText: input.helpText || null,
    },
  });

  // Replace the source list with what the operator entered.
  //
  // In one transaction: a failure part-way through used to leave the field with
  // a partial or empty source list, after which it silently generated blank —
  // and because the action threw, the screen showed no error either.
  // Duplicates are dropped first; the same code twice would violate the unique
  // constraint, and pasting a repeated code is an easy mistake to make.
  const revision = await prisma.formRevision.findFirst({ where: { isActive: true } });
  const codes = [...new Set(input.sourceCodes.map((c) => c.trim()).filter(Boolean))];
  const questions = revision
    ? await prisma.formQuestion.findMany({
        where: { formRevisionId: revision.id, code: { in: codes } },
        select: { id: true, code: true },
      })
    : [];
  const questionByCode = new Map(questions.map((q) => [q.code, q.id]));

  await prisma.$transaction([
    prisma.sheetFieldSource.deleteMany({ where: { fieldId: input.id } }),
    ...codes.map((code, index) =>
      prisma.sheetFieldSource.create({
        data: {
          fieldId: input.id,
          questionCode: code,
          questionId: questionByCode.get(code) ?? null,
          order: index,
        },
      }),
    ),
  ]);

  await recordAudit({
    userId: user.id,
    action: 'definition.update',
    entityType: 'SheetField',
    entityId: input.id,
    summary: `項目「${input.nameJa}」を更新した`,
    meta: { sources: codes },
  });

  refresh();
  return { ok: true, message: '保存した' };
}

/**
 * A field code is used in URLs, in the seed definition and in the display
 * presets, so it is restricted to the shape the screen already promises:
 * lower-case letters, digits and underscores.
 */
const FIELD_CODE_RE = /^[a-z][a-z0-9_]*$/;

export async function createFieldAction(input: {
  sectionId: string;
  code: string;
  nameJa: string;
  processing: Processing;
  sourceCodes: string[];
}): Promise<SaveResult> {
  const user = await guard();

  // Validate before the uniqueness check. Whitespace-only input used to pass
  // the screen's `!code` guard, be trimmed to '' here, and create a permanent
  // phantom row that no screen can delete.
  const code = input.code.trim();
  const nameJa = input.nameJa.trim();
  if (!FIELD_CODE_RE.test(code)) {
    return {
      ok: false,
      message: '項目コードは英小文字で始まり、英小文字・数字・アンダースコアのみが使える',
    };
  }
  if (!nameJa) return { ok: false, message: '表示名は必須である' };

  const exists = await prisma.sheetField.findUnique({ where: { code } });
  if (exists) return { ok: false, message: 'その項目コードはすでに使われている' };

  const last = await prisma.sheetField.findFirst({
    where: { sectionId: input.sectionId },
    orderBy: { order: 'desc' },
  });

  const field = await prisma.sheetField.create({
    data: {
      sectionId: input.sectionId,
      code,
      nameJa,
      order: (last?.order ?? 0) + 10,
      processing: input.processing,
      editing: input.processing === 'GENERATE' ? 'PROMPT_AND_MANUAL' : 'MANUAL_ONLY',
    },
  });

  for (const [index, code] of input.sourceCodes.entries()) {
    await prisma.sheetFieldSource.create({
      data: { fieldId: field.id, questionCode: code, order: index },
    });
  }

  await recordAudit({
    userId: user.id,
    action: 'definition.update',
    entityType: 'SheetField',
    entityId: field.id,
    summary: `項目「${input.nameJa}」を追加した`,
  });

  refresh();
  return { ok: true, message: '追加した' };
}

export async function createSectionAction(input: {
  code: string;
  nameJa: string;
  nameEn?: string;
}): Promise<SaveResult> {
  const user = await guard();
  const code = input.code.trim();
  const nameJa = input.nameJa.trim();
  if (!FIELD_CODE_RE.test(code)) {
    return {
      ok: false,
      message: 'セクションコードは英小文字で始まり、英小文字・数字・アンダースコアのみが使える',
    };
  }
  if (!nameJa) return { ok: false, message: '表示名は必須である' };
  const exists = await prisma.sheetSection.findUnique({ where: { code } });
  if (exists) return { ok: false, message: 'そのセクションコードはすでに使われている' };

  const last = await prisma.sheetSection.findFirst({ orderBy: { order: 'desc' } });
  const section = await prisma.sheetSection.create({
    data: {
      code,
      nameJa,
      nameEn: input.nameEn || null,
      order: (last?.order ?? 0) + 10,
    },
  });

  await recordAudit({
    userId: user.id,
    action: 'definition.update',
    entityType: 'SheetSection',
    entityId: section.id,
    summary: `セクション「${input.nameJa}」を追加した`,
  });

  refresh();
  return { ok: true, message: '追加した' };
}
