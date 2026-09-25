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
  /** Omitted by the screen: order is changed only by reordering. */
  order?: number;
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
      ...(input.order !== undefined ? { order: input.order } : {}),
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
  return { ok: true, message: '保存しました' };
}

export async function reorderSectionsAction(
  orderedIds: string[],
): Promise<SaveResult> {
  const user = await guard();
  const sections = await prisma.sheetSection.findMany({ select: { id: true } });
  const known = new Set(sections.map((s) => s.id));
  if (orderedIds.length !== known.size || orderedIds.some((id) => !known.has(id))) {
    return { ok: false, message: '画面が古くなっています。再読み込みしてからやり直してください。' };
  }
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
  return { ok: true, message: '並び順を保存しました' };
}

export async function updateFieldAction(input: {
  id: string;
  nameJa: string;
  nameEn?: string;
  /** Omitted by the screen: order is changed only by reordering. */
  order?: number;
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
      ...(input.order !== undefined ? { order: input.order } : {}),
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
  return { ok: true, message: '保存しました' };
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
      message: '項目コードは英小文字で始まり、英小文字・数字・アンダースコアのみ使えます',
    };
  }
  if (!nameJa) return { ok: false, message: '表示名を入力してください' };

  const exists = await prisma.sheetField.findUnique({ where: { code } });
  if (exists) return { ok: false, message: 'その項目コードはすでに使われています' };

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
  return { ok: true, message: '追加しました' };
}

export async function createSectionAction(input: {
  code: string;
  nameJa: string;
  nameEn?: string;
  /** The screen has an add button above the list and one below it. */
  position?: 'first' | 'last';
}): Promise<SaveResult> {
  const user = await guard();
  const code = input.code.trim();
  const nameJa = input.nameJa.trim();
  if (!FIELD_CODE_RE.test(code)) {
    return {
      ok: false,
      message: 'セクションコードは英小文字で始まり、英小文字・数字・アンダースコアのみ使えます',
    };
  }
  if (!nameJa) return { ok: false, message: '表示名を入力してください' };
  const exists = await prisma.sheetSection.findUnique({ where: { code } });
  if (exists) return { ok: false, message: 'そのセクションコードはすでに使われています' };

  const data = { code, nameJa, nameEn: input.nameEn || null };
  let section;
  if (input.position === 'first') {
    // Shift everything down one step rather than going below the first order
    // value, so the stored numbers stay positive.
    [, section] = await prisma.$transaction([
      prisma.sheetSection.updateMany({ data: { order: { increment: 10 } } }),
      prisma.sheetSection.create({ data: { ...data, order: 10 } }),
    ]);
  } else {
    const last = await prisma.sheetSection.findFirst({ orderBy: { order: 'desc' } });
    section = await prisma.sheetSection.create({
      data: { ...data, order: (last?.order ?? 0) + 10 },
    });
  }

  await recordAudit({
    userId: user.id,
    action: 'definition.update',
    entityType: 'SheetSection',
    entityId: section.id,
    summary: `セクション「${input.nameJa}」を追加した`,
  });

  refresh();
  return { ok: true, message: '追加しました' };
}

// ---------------------------------------------------------------------------
// Direct manipulation on the field-definition screen.
//
// Sano-san's review (2026-09-23, item 4): order, visibility and deletion were
// set by typing numbers, and the numbers (10, 20, 65, 90 …) meant nothing to
// the person using the screen. The screen now reorders by drag and drop or
// arrow buttons, shows and hides with a switch, and deletes with a bin icon.
// These actions back those controls. The stored order values are an internal
// detail: they are renumbered 10, 20, 30 … on every reorder and never shown.
// ---------------------------------------------------------------------------

export async function reorderFieldsAction(
  sectionId: string,
  orderedIds: string[],
): Promise<SaveResult> {
  const user = await guard();
  const fields = await prisma.sheetField.findMany({
    where: { sectionId },
    select: { id: true },
  });
  const known = new Set(fields.map((f) => f.id));
  // Refuse a list that does not describe exactly this section's fields, so a
  // stale screen cannot move a field into another section or drop one.
  if (orderedIds.length !== known.size || orderedIds.some((id) => !known.has(id))) {
    return { ok: false, message: '画面が古くなっています。再読み込みしてからやり直してください。' };
  }
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.sheetField.update({ where: { id }, data: { order: (index + 1) * 10 } }),
    ),
  );
  await recordAudit({
    userId: user.id,
    action: 'definition.update',
    entityType: 'SheetSection',
    entityId: sectionId,
    summary: '項目の並び順を変更した',
  });
  refresh();
  return { ok: true, message: '並び順を保存しました' };
}

export async function setSectionVisibleAction(
  id: string,
  isVisible: boolean,
): Promise<SaveResult> {
  const user = await guard();
  const section = await prisma.sheetSection.update({ where: { id }, data: { isVisible } });
  await recordAudit({
    userId: user.id,
    action: 'definition.update',
    entityType: 'SheetSection',
    entityId: id,
    summary: `セクション「${section.nameJa}」を${isVisible ? '表示' : '非表示'}にした`,
  });
  refresh();
  return { ok: true, message: isVisible ? '表示にしました' : '非表示にしました' };
}

export async function setFieldPrintedAction(
  id: string,
  includeInPdf: boolean,
): Promise<SaveResult> {
  const user = await guard();
  const field = await prisma.sheetField.update({ where: { id }, data: { includeInPdf } });
  await recordAudit({
    userId: user.id,
    action: 'definition.update',
    entityType: 'SheetField',
    entityId: id,
    summary: `項目「${field.nameJa}」を${includeInPdf ? '表示' : '非表示'}にした`,
  });
  refresh();
  return { ok: true, message: includeInPdf ? '表示にしました' : '非表示にしました' };
}

export async function setFieldRequiredAction(
  id: string,
  isRequired: boolean,
): Promise<SaveResult> {
  const user = await guard();
  const field = await prisma.sheetField.update({ where: { id }, data: { isRequired } });
  await recordAudit({
    userId: user.id,
    action: 'definition.update',
    entityType: 'SheetField',
    entityId: id,
    summary: `項目「${field.nameJa}」を${isRequired ? '必須' : '任意'}にした`,
  });
  refresh();
  return { ok: true, message: isRequired ? '必須にしました' : '任意にしました' };
}

/**
 * The section-level 必須 checkbox is not a stored property of the section —
 * SheetSection has no isRequired column. It is a bulk action on the fields
 * inside it: check it to mark every field in the section required in one
 * step, then adjust individual fields from their own checkbox. Unchecking it
 * again clears isRequired on every field the same way.
 */
export async function setSectionFieldsRequiredAction(
  sectionId: string,
  isRequired: boolean,
): Promise<SaveResult> {
  const user = await guard();
  const section = await prisma.sheetSection.findUnique({
    where: { id: sectionId },
    select: { nameJa: true },
  });
  if (!section) return { ok: false, message: 'そのセクションはすでに削除されています' };
  const { count } = await prisma.sheetField.updateMany({
    where: { sectionId, isActive: true },
    data: { isRequired },
  });
  await recordAudit({
    userId: user.id,
    action: 'definition.update',
    entityType: 'SheetSection',
    entityId: sectionId,
    summary: `セクション「${section.nameJa}」の項目${count}件を${isRequired ? '必須' : '任意'}にした`,
  });
  refresh();
  return {
    ok: true,
    message: isRequired ? `${count}件を必須にしました` : `${count}件を任意にしました`,
  };
}

/**
 * Deleting a field also deletes what has been entered in it for every person,
 * so the screen asks for confirmation and states how many people that affects
 * before calling this. Hiding (the switch) is the reversible alternative.
 */
export async function deleteFieldAction(id: string): Promise<SaveResult> {
  const user = await guard();
  const field = await prisma.sheetField.findUnique({ where: { id } });
  if (!field) return { ok: false, message: 'その項目はすでに削除されています' };
  await prisma.sheetField.delete({ where: { id } });
  await recordAudit({
    userId: user.id,
    action: 'definition.update',
    entityType: 'SheetField',
    entityId: id,
    summary: `項目「${field.nameJa}」（${field.code}）を削除した`,
  });
  refresh();
  return { ok: true, message: `「${field.nameJa}」を削除しました` };
}

/**
 * A section is deleted only once it is empty. Deleting one that still holds
 * fields would silently take every field and all their entered data with it.
 */
export async function deleteSectionAction(id: string): Promise<SaveResult> {
  const user = await guard();
  const section = await prisma.sheetSection.findUnique({
    where: { id },
    include: { _count: { select: { fields: true } } },
  });
  if (!section) return { ok: false, message: 'そのセクションはすでに削除されています' };
  if (section._count.fields > 0) {
    return {
      ok: false,
      message: `「${section.nameJa}」には項目が${section._count.fields}件あります。先に項目を削除するか、スイッチで非表示にしてください。`,
    };
  }
  await prisma.sheetSection.delete({ where: { id } });
  await recordAudit({
    userId: user.id,
    action: 'definition.update',
    entityType: 'SheetSection',
    entityId: id,
    summary: `セクション「${section.nameJa}」（${section.code}）を削除した`,
  });
  refresh();
  return { ok: true, message: `「${section.nameJa}」を削除しました` };
}
