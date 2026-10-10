'use server';

import { revalidatePath } from 'next/cache';
import { recordAudit } from '@/lib/audit';
import type { RecordKind } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { can, canEditSection, canAccessPerson } from '@/lib/auth/permissions';
import {
  assertHistoryBelongsToPerson,
  assertRecordBelongsToPerson,
  assertValueBelongsToPerson,
  assertVersionBelongsToPerson,
  OwnershipError,
  resolveField,
} from '@/lib/auth/ownership';
import { runAction, OperatorError } from '@/lib/actions/result';
import { getStorage } from '@/lib/storage';
import { buildPhotoKey, checkPhoto } from '@/lib/photo';
import {
  editFieldValue,
  generateFieldValue,
  generateSection,
  revertFieldValue,
  runGeneration,
  setFieldFlags,
} from '@/lib/sheet/fields';
import { keepCurrentValues, loadImportDiffs } from '@/lib/sheet/import-diff';
import {
  createRecord,
  setDisplayedRecords,
  setHiddenFields,
  softDeleteRecord,
} from '@/lib/sheet/records';
import {
  finaliseVersion,
  getEditableVersion,
  getOrCreateSkillSheet,
  restoreVersion,
  submitForReview,
} from '@/lib/sheet/version';

/** Which section each kind of repeating record belongs to. */
const RECORD_SECTIONS: Record<RecordKind, string> = {
  EDUCATION: 'education',
  INTERNSHIP: 'internships',
  PROJECT: 'projects',
  WORK_EXPERIENCE: 'work_japan',
};

export type ActionResult = {
  ok: boolean;
  message?: string;
  warnings?: string[];
  unreviewed?: Array<{
    fieldName: string;
    sectionName: string;
    fieldNameEn?: string | null;
    sectionNameEn?: string | null;
  }>;
};

/**
 * Every write to a person's sheet passes through here.
 *
 * `sectionCode` is NOT taken from the client. The caller passes the id of the
 * thing being changed, this resolves that id back to the person and the section
 * it really belongs to, and permissions are checked against that. Trusting a
 * section name sent alongside the id let an engineer name a section they may
 * edit and then act on a field from one they may not.
 */
async function guard(personId: string, sectionCode?: string) {
  const user = await requireUser();
  if (!canAccessPerson(user, personId)) {
    throw new OwnershipError('この対象者を操作する権限がない');
  }
  if (sectionCode && !canEditSection(user, personId, sectionCode)) {
    throw new OwnershipError('このセクションを編集する権限がない');
  }
  const sheet = await getOrCreateSkillSheet(personId);
  const version = await getEditableVersion(sheet.id, user.id);
  return { user, sheet, version };
}

/** Resolve a field id to its real section, then guard against that section. */
async function guardField(personId: string, fieldId: string) {
  const field = await resolveField(fieldId);
  const guarded = await guard(personId, field.sectionCode);
  return { ...guarded, field };
}

/** Resolve a stored value to its person and section, then guard. */
async function guardValue(personId: string, valueId: string) {
  const value = await assertValueBelongsToPerson(valueId, personId);
  const guarded = await guard(personId, value.sectionCode);
  return { ...guarded, value };
}

function refresh(personId: string) {
  revalidatePath(`/people/${personId}`);
  revalidatePath(`/people/${personId}/preview`);
  revalidatePath(`/people/${personId}/differences`);
  revalidatePath('/people');
  revalidatePath('/my-sheet');
}

export async function saveFieldAction(
  personId: string,
  input: { fieldId: string; recordId?: string | null; sectionCode?: string; valueJa: string },
): Promise<ActionResult> {
  return runAction(async () => {
    const { user, version } = await guardField(personId, input.fieldId);
    if (input.recordId) await assertRecordBelongsToPerson(input.recordId, personId);
    await editFieldValue({
      versionId: version.id,
      fieldId: input.fieldId,
      recordId: input.recordId ?? null,
      valueJa: input.valueJa,
      userId: user.id,
      personId,
    });
    refresh(personId);
    return { ok: true, message: '保存した' };
  });
}

export async function generateFieldAction(
  personId: string,
  input: {
    fieldId: string;
    recordId?: string | null;
    sectionCode?: string;
    operatorPrompt?: string | null;
  },
): Promise<ActionResult> {
  return runAction(async () => {
    const { user, version } = await guardField(personId, input.fieldId);
    if (input.recordId) await assertRecordBelongsToPerson(input.recordId, personId);
    const result = await generateFieldValue({
      versionId: version.id,
      fieldId: input.fieldId,
      recordId: input.recordId ?? null,
      personId,
      userId: user.id,
      operatorPrompt: input.operatorPrompt,
    });
    refresh(personId);
    return {
      ok: result.ok,
      message: result.ok ? '生成した。内容を確認すること' : 'ロックされているため生成しなかった',
      warnings: result.warnings,
    };
  });
}

export async function generateSectionAction(
  personId: string,
  input: { sectionId: string; sectionCode: string },
): Promise<ActionResult> {
  return runAction(async () => {
  const { user, version } = await guard(personId, input.sectionCode);
  const outcome = await generateSection({
    versionId: version.id,
    sectionId: input.sectionId,
    personId,
    userId: user.id,
  });
  refresh(personId);
  return {
    ok: true,
    message:
      `${outcome.generated}項目を生成した（ロック等で${outcome.skipped}項目は対象外）` +
      (outcome.failed > 0 ? `。${outcome.failed}項目は生成できなかった` : ''),
    warnings: [...new Set(outcome.warnings)],
  };
  });
}

export async function setFieldFlagsAction(
  personId: string,
  input: {
    valueId: string;
    sectionCode?: string;
    isLocked?: boolean;
    isReviewed?: boolean;
    isDisplayed?: boolean;
  },
): Promise<ActionResult> {
  return runAction(async () => {
  const { user } = await guardValue(personId, input.valueId);
  await setFieldFlags({
    valueId: input.valueId,
    userId: user.id,
    personId,
    isLocked: input.isLocked,
    isReviewed: input.isReviewed,
    isDisplayed: input.isDisplayed,
  });
  refresh(personId);
  return { ok: true };
  });
}

export async function revertFieldAction(
  personId: string,
  input: { historyId: string; sectionCode?: string; to?: 'after' | 'before' },
): Promise<ActionResult> {
  return runAction(async () => {
    const history = await assertHistoryBelongsToPerson(input.historyId, personId);
    const { user, version } = await guard(personId, history.sectionCode);
    // Into the version being edited — never back into the (perhaps finalised)
    // version the history entry was recorded in.
    await revertFieldValue({
      historyId: input.historyId,
      userId: user.id,
      personId,
      versionId: version.id,
      to: input.to ?? 'after',
    });
    refresh(personId);
    return { ok: true, message: '以前の内容に戻した' };
  });
}

export async function loadHistoryAction(
  personId: string,
  valueId: string,
): Promise<
  Array<{
    id: string;
    changeType: string;
    valueJa: string | null;
    previousJa: string | null;
    prompt: string | null;
    changedBy: string | null;
    createdAt: string;
  }>
> {
  const user = await requireUser();
  if (!canAccessPerson(user, personId)) throw new OwnershipError('権限がない');
  // The value id decides which rows come back, so it has to belong to this
  // person — otherwise any signed-in user could read another sheet's history.
  await assertValueBelongsToPerson(valueId, personId);
  // The field's history across every version of this sheet. Editing a
  // finalised sheet starts a new version, and the values are copied into it
  // without their history — so the AI's original text, written in an earlier
  // version, was nowhere to be found (Sano-san, 2026-10-10).
  const value = await prisma.fieldValue.findUniqueOrThrow({
    where: { id: valueId },
    select: { fieldId: true, recordKey: true, version: { select: { skillSheetId: true } } },
  });
  const rows = await prisma.fieldValueHistory.findMany({
    where: {
      fieldValue: {
        fieldId: value.fieldId,
        recordKey: value.recordKey,
        version: { skillSheetId: value.version.skillSheetId },
      },
      changeType: { notIn: ['LOCK', 'UNLOCK', 'REVIEW'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { changedBy: { select: { displayName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    changeType: r.changeType,
    valueJa: r.valueJa,
    previousJa: r.previousJa,
    prompt: r.prompt,
    changedBy: r.changedBy?.displayName ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function addRecordAction(
  personId: string,
  kind: RecordKind,
): Promise<ActionResult> {
  const sectionCode = RECORD_SECTIONS[kind] ?? 'education';
  const { user, sheet } = await guard(personId, sectionCode);
  try {
    await createRecord({
      skillSheetId: sheet.id,
      kind,
      personId,
      userId: user.id,
      origin: 'MANUAL',
    });
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  refresh(personId);
  return { ok: true, message: '追加した' };
}

export async function deleteRecordAction(
  personId: string,
  input: { recordId: string; sectionCode?: string },
): Promise<ActionResult> {
  return runAction(async () => {
    const record = await assertRecordBelongsToPerson(input.recordId, personId);
    const { user } = await guard(personId, RECORD_SECTIONS[record.kind as RecordKind]);
    await softDeleteRecord({ recordId: input.recordId, personId, userId: user.id });
    refresh(personId);
    return { ok: true, message: '削除した（論理削除のため復旧できる）' };
  });
}

export async function setDisplayedRecordsAction(
  personId: string,
  input: { presetId: string; kind: RecordKind; recordIds: string[] },
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    if (!canAccessPerson(user, personId)) {
      throw new OwnershipError('この対象者を操作する権限がない');
    }
    if (!can(user, 'sheet.selectRecords')) {
      throw new OperatorError('表示レコードを変更する権限がない');
    }
    for (const recordId of input.recordIds) {
      await assertRecordBelongsToPerson(recordId, personId);
    }
    await setDisplayedRecords({ ...input, personId, userId: user.id });
    refresh(personId);
    return { ok: true, message: '表示設定を保存した' };
  });
}

export async function setHiddenFieldsAction(
  personId: string,
  input: { presetId: string; hiddenFieldCodes: string[] },
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    if (!canAccessPerson(user, personId)) {
      throw new OwnershipError('この対象者を操作する権限がない');
    }
    if (!can(user, 'sheet.selectRecords')) {
      throw new OperatorError('権限がない');
    }
    await setHiddenFields(input);
    refresh(personId);
    return { ok: true, message: '出力項目を保存した' };
  });
}

export async function finaliseAction(
  personId: string,
  options: { confirmUnreviewed?: boolean } = {},
): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user, 'sheet.finalise')) {
    return { ok: false, message: '確定する権限がない' };
  }
  const sheet = await prisma.skillSheet.findUniqueOrThrow({ where: { personId } });
  if (!sheet.currentVersionId) return { ok: false, message: '版が存在しない' };

  const result = await finaliseVersion(sheet.currentVersionId, user.id, {
    confirmUnreviewed: options.confirmUnreviewed,
  });
  refresh(personId);
  if (!result.ok) {
    return {
      ok: false,
      message: '未確認の項目が残っているため確定できない',
      unreviewed: result.unreviewed.map((u) => ({
        fieldName: u.fieldName,
        sectionName: u.sectionName,
        fieldNameEn: u.fieldNameEn,
        sectionNameEn: u.sectionNameEn,
      })),
    };
  }
  return { ok: true, message: '確定した。PDFを出力できる' };
}

export async function submitForReviewAction(personId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    if (!canAccessPerson(user, personId)) throw new OwnershipError('権限がない');
    if (!can(user, 'sheet.submitForReview')) {
      throw new OperatorError('確認を依頼する権限がない');
    }
    const sheet = await prisma.skillSheet.findUniqueOrThrow({ where: { personId } });
    if (!sheet.currentVersionId) throw new OperatorError('版が存在しない');
    // A finalised version must not be pulled back into review: the PDF endpoint
    // serves the latest FINAL version, so this would silently stop exports.
    const version = await assertVersionBelongsToPerson(sheet.currentVersionId, personId);
    if (version.status === 'FINAL') {
      throw new OperatorError('確定済みの版は確認依頼できない。編集すると新しい下書きが作られる。');
    }
    await submitForReview(sheet.currentVersionId, user.id);
    refresh(personId);
    return { ok: true, message: '確認を依頼した' };
  });
}

export async function restoreVersionAction(
  personId: string,
  versionId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    if (!canAccessPerson(user, personId)) throw new OwnershipError('権限がない');
    if (!can(user, 'sheet.edit')) throw new OperatorError('権限がない');
    // Without this, a version id from another person's sheet would be cloned
    // into this one and could be finalised and exported under the wrong name.
    await assertVersionBelongsToPerson(versionId, personId);
    const sheet = await prisma.skillSheet.findUniqueOrThrow({ where: { personId } });
    await restoreVersion(sheet.id, versionId, user.id);
    refresh(personId);
    return { ok: true, message: '復元した' };
  });
}

/**
 * Store or replace a person's photo.
 *
 * Takes FormData because a file cannot travel as a plain server-action
 * argument. The previous key is left in storage rather than deleted: an export
 * already produced still references it, and a seldom-used object costs nothing
 * next to the risk of breaking a PDF that has been sent out.
 */
export async function uploadPhotoAction(
  personId: string,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    if (!canAccessPerson(user, personId)) {
      throw new OwnershipError('この対象者を操作する権限がない');
    }
    if (!can(user, 'sheet.edit')) throw new OperatorError('写真を登録する権限がない');

    const file = formData.get('photo');
    if (!(file instanceof File)) throw new OperatorError('ファイルが選択されていない');

    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkPhoto(file.type, bytes);
    if (!check.ok) throw new OperatorError(check.message);

    const key = buildPhotoKey(personId, check.extension);
    await getStorage().put(key, Buffer.from(bytes), file.type);
    await prisma.person.update({ where: { id: personId }, data: { photoKey: key } });

    await recordAudit({
      userId: user.id,
      action: 'person.photo_upload',
      personId,
      entityType: 'Person',
      entityId: personId,
      summary: `写真を登録した（${Math.round(bytes.byteLength / 1024)}KB）`,
    });

    refresh(personId);
    return { ok: true, message: '写真を登録した' };
  });
}

/** Remove the photo from the sheet. The stored file itself is left alone. */
export async function removePhotoAction(personId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    if (!canAccessPerson(user, personId)) {
      throw new OwnershipError('この対象者を操作する権限がない');
    }
    if (!can(user, 'sheet.edit')) throw new OperatorError('写真を変更する権限がない');
    await prisma.person.update({ where: { id: personId }, data: { photoKey: null } });
    await recordAudit({
      userId: user.id,
      action: 'person.photo_remove',
      personId,
      entityType: 'Person',
      entityId: personId,
    });
    refresh(personId);
    return { ok: true, message: '写真を外した' };
  });
}

export async function updatePersonAction(
  personId: string,
  input: { employeeNumber?: string; cohort?: string },
): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user, 'sheet.edit')) return { ok: false, message: '権限がない' };
  await prisma.person.update({
    where: { id: personId },
    data: {
      employeeNumber: input.employeeNumber?.trim() || null,
      cohort: input.cohort?.trim() || null,
    },
  });
  refresh(personId);
  return { ok: true, message: '保存した' };
}

/**
 * Add a note about a person to the supplementary document.
 *
 * The date is the row's own createdAt — Sano-san asked for it to be stamped
 * automatically, so there is nothing for the author to type or forget, and a
 * note cannot be backdated. Notes are append-only: a correction is a new note,
 * which keeps the history of what sales knew and when.
 *
 * Engineers cannot reach this: the supplementary document is internal, and the
 * person it describes should not be writing or reading it.
 */
export async function addMemoAction(
  personId: string,
  body: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user, 'sheet.edit') || user.role === 'ENGINEER') {
    return { ok: false, message: 'メモを追加する権限がない' };
  }
  const text = body.trim();
  if (!text) return { ok: false, message: 'メモの内容が空である' };

  await prisma.personMemo.create({
    data: { personId, body: text, createdById: user.id },
  });

  await recordAudit({
    userId: user.id,
    action: 'supplement.memo_add',
    entityType: 'Person',
    entityId: personId,
    personId,
    summary: text.length > 40 ? `${text.slice(0, 40)}…` : text,
  });

  refresh(personId);
  return { ok: true, message: 'メモを追加した' };
}

/**
 * Re-import differences (spec §5.2): rebuild the chosen fields from the newest
 * answers. Only fields that really differ are touched, and locked fields never.
 */
export async function takeNewAnswersAction(
  personId: string,
  targets: Array<{ fieldId: string; recordId: string | null }>,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    if (!canAccessPerson(user, personId) || !can(user, 'sheet.edit') || user.role === 'ENGINEER') {
      throw new OwnershipError('この操作を行う権限がない');
    }
    const diffs = await loadImportDiffs(personId);
    const chosen = diffs.filter(
      (d) => !d.locked && targets.some((t) => t.fieldId === d.fieldId && t.recordId === d.recordId),
    );
    if (chosen.length === 0) return { ok: true, message: '取り込む項目がありません' };
    const sheet = await getOrCreateSkillSheet(personId);
    const version = await getEditableVersion(sheet.id, user.id);
    const toTarget = (d: (typeof chosen)[number]) => ({
      fieldId: d.fieldId,
      recordId: d.recordId,
      fieldName: d.fieldName,
    });
    // A field that was empty is shown once it has a value; a choice made on a
    // field with a value is left as it was.
    const [wasEmpty, hadValue] = [
      chosen.filter((d) => !d.currentJa.trim()).map(toTarget),
      chosen.filter((d) => d.currentJa.trim()).map(toTarget),
    ];
    const base = { versionId: version.id, personId, userId: user.id };
    const a = await runGeneration(wasEmpty, { ...base, displayFromValue: true });
    const b = await runGeneration(hadValue, base);
    await recordAudit({
      userId: user.id,
      action: 'sheet.field_generate',
      entityType: 'SheetVersion',
      entityId: version.id,
      personId,
      summary: `取り込みの差分: ${chosen.length}項目を新しい回答で作り直した`,
    });
    refresh(personId);
    const failed = a.failed + b.failed;
    return {
      ok: true,
      message:
        `${a.generated + b.generated}項目を新しい回答で作り直しました。内容を確認してください` +
        (failed > 0 ? `（${failed}項目は作成できませんでした）` : ''),
      warnings: [...new Set([...a.warnings, ...b.warnings])],
    };
  });
}

/** Re-import differences (§5.2): keep the current value for the chosen fields. */
export async function keepCurrentValuesAction(
  personId: string,
  targets: Array<{ fieldId: string; recordId: string | null }>,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    if (!canAccessPerson(user, personId) || !can(user, 'sheet.edit') || user.role === 'ENGINEER') {
      throw new OwnershipError('この操作を行う権限がない');
    }
    const kept = await keepCurrentValues(personId, targets);
    await recordAudit({
      userId: user.id,
      action: 'sheet.field_edit',
      entityType: 'Person',
      entityId: personId,
      personId,
      summary: `取り込みの差分: ${kept}項目は現在の値を維持した`,
    });
    refresh(personId);
    return { ok: true, message: `${kept}項目は現在の値のままにしました` };
  });
}
