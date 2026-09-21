/**
 * Version lifecycle.  Specification §5.6, §5.8.
 *
 * Rules implemented here:
 *   - Every save is recorded as a version, and earlier versions are restorable.
 *   - Status belongs to the version, not the person, so a finalised version and
 *     a version being edited can exist at the same time.
 *   - Only a FINAL version can be exported to PDF (enforced in the PDF module).
 *   - Opening an existing person shows the latest saved content; it is never
 *     re-fetched from the form or regenerated automatically (§5.8).
 */

import type { SheetStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { getEnv } from '@/lib/env';
import { buildReviewRequestEmail, sendMail } from '@/lib/mail';

export async function getOrCreateSkillSheet(personId: string) {
  const existing = await prisma.skillSheet.findUnique({
    where: { personId },
    include: { currentVersion: true },
  });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const sheet = await tx.skillSheet.create({ data: { personId } });
    const version = await tx.sheetVersion.create({
      data: { skillSheetId: sheet.id, versionNo: 1, status: 'DRAFT' },
    });
    await tx.displayPreset.create({
      data: { skillSheetId: sheet.id, name: '既定', isDefault: true },
    });
    return tx.skillSheet.update({
      where: { id: sheet.id },
      data: { currentVersionId: version.id },
      include: { currentVersion: true },
    });
  });
}

/**
 * The version that edits should be written to. A FINAL version is never edited
 * in place: a new draft is cloned from it so the finalised copy stays intact.
 */
export async function getEditableVersion(skillSheetId: string, userId?: string) {
  const sheet = await prisma.skillSheet.findUniqueOrThrow({
    where: { id: skillSheetId },
    include: { currentVersion: true },
  });

  if (sheet.currentVersion && sheet.currentVersion.status !== 'FINAL') {
    return sheet.currentVersion;
  }

  return cloneVersion(skillSheetId, sheet.currentVersionId, 'DRAFT', userId);
}

export async function cloneVersion(
  skillSheetId: string,
  sourceVersionId: string | null,
  status: SheetStatus,
  userId?: string,
  note?: string,
) {
  return prisma.$transaction(async (tx) => {
    const last = await tx.sheetVersion.findFirst({
      where: { skillSheetId },
      orderBy: { versionNo: 'desc' },
      select: { versionNo: true },
    });

    const version = await tx.sheetVersion.create({
      data: {
        skillSheetId,
        versionNo: (last?.versionNo ?? 0) + 1,
        status,
        createdById: userId,
        note,
      },
    });

    if (sourceVersionId) {
      const values = await tx.fieldValue.findMany({
        where: { versionId: sourceVersionId },
      });
      if (values.length > 0) {
        await tx.fieldValue.createMany({
          data: values.map((v) => ({
            versionId: version.id,
            fieldId: v.fieldId,
            recordId: v.recordId,
            // Mirrors recordId — see the comment on FieldValue.recordKey.
            recordKey: v.recordId ?? '',
            valueJa: v.valueJa,
            valueJson: v.valueJson as never,
            sourceText: v.sourceText,
            isLocked: v.isLocked,
            isReviewed: v.isReviewed,
            isDisplayed: v.isDisplayed,
            generatedAt: v.generatedAt,
            generatedBy: v.generatedBy,
          })),
        });
      }
    }

    await tx.skillSheet.update({
      where: { id: skillSheetId },
      data: { currentVersionId: version.id },
    });

    return version;
  });
}

/** Mark the working version as final. Spec §11.1: only this can be exported. */
export async function finaliseVersion(versionId: string, userId: string) {
  const version = await prisma.sheetVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: {
      skillSheet: { include: { person: true } },
      // The section comes along so the screen can say which 「備考」 or which
      // 「果たした役割」 is meant — the same field name appears in several
      // sections, and a list of bare names is unusable.
      values: {
        include: {
          field: { include: { section: true } },
          record: { select: { deletedAt: true } },
        },
      },
    },
  });

  // §11.1 — refuse when fields are still unreviewed, and say which ones.
  //
  // Only values the editor can actually show count. A value left behind by a
  // deleted record or a deactivated field is unreachable on screen, so counting
  // it made the sheet impossible to finalise — and therefore impossible to
  // export — with no way for anyone to find the offending item.
  const unreviewed = version.values.filter(
    (v) =>
      !v.isReviewed &&
      (v.valueJa ?? '').trim() !== '' &&
      v.field.isActive &&
      (v.record === null || v.record.deletedAt === null),
  );
  if (unreviewed.length > 0) {
    return {
      ok: false as const,
      unreviewed: unreviewed.map((v) => ({
        fieldCode: v.field.code,
        fieldName: v.field.nameJa,
        sectionName: v.field.section.nameJa,
      })),
    };
  }

  const updated = await prisma.sheetVersion.update({
    where: { id: versionId },
    data: { status: 'FINAL', finalisedAt: new Date(), finalisedById: userId },
  });

  await recordAudit({
    userId,
    action: 'sheet.finalise',
    entityType: 'SheetVersion',
    entityId: versionId,
    personId: version.skillSheet.personId,
    summary: `第${version.versionNo}版を確定した`,
  });

  return { ok: true as const, version: updated };
}

export async function submitForReview(versionId: string, userId: string) {
  const version = await prisma.sheetVersion.update({
    where: { id: versionId },
    data: { status: 'AWAITING_REVIEW' },
    include: { skillSheet: { include: { person: true } } },
  });
  await recordAudit({
    userId,
    action: 'sheet.submit_for_review',
    entityType: 'SheetVersion',
    entityId: versionId,
    personId: version.skillSheet.personId,
    summary: `第${version.versionNo}版の確認を依頼した`,
  });

  await notifyAdministrators(version.skillSheet.personId, {
    personName:
      version.skillSheet.person.fullNameKatakana ??
      version.skillSheet.person.fullNameEnglish,
    versionNo: version.versionNo,
  });

  return version;
}

/**
 * Email every active administrator that a sheet is waiting for them (§D-2).
 *
 * Deliberately best-effort: a submission has already been recorded by the time
 * this runs, and failing to send a notification must not undo it or show the
 * person an error for something that is not their problem.
 */
async function notifyAdministrators(
  personId: string,
  details: { personName: string; versionNo: number },
) {
  try {
    const env = getEnv();
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true },
      select: { email: true },
    });
    if (admins.length === 0) return;

    const link = `${env.APP_URL.replace(/\/$/, '')}/people/${personId}`;
    const mail = buildReviewRequestEmail({ ...details, link });
    for (const admin of admins) {
      await sendMail({ ...mail, to: admin.email });
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('確認依頼の通知メールを送信できなかった', error);
  }
}

/** Restore an earlier version by copying its values into a new draft (§5.6). */
export async function restoreVersion(
  skillSheetId: string,
  sourceVersionId: string,
  userId: string,
) {
  const source = await prisma.sheetVersion.findUniqueOrThrow({
    where: { id: sourceVersionId },
  });
  const version = await cloneVersion(
    skillSheetId,
    sourceVersionId,
    'DRAFT',
    userId,
    `第${source.versionNo}版から復元`,
  );
  await recordAudit({
    userId,
    action: 'sheet.version_create',
    entityType: 'SheetVersion',
    entityId: version.id,
    summary: `第${source.versionNo}版を復元して第${version.versionNo}版を作成した`,
  });
  return version;
}

export const STATUS_LABELS: Record<SheetStatus, string> = {
  DRAFT: '下書き',
  AWAITING_REVIEW: '確認待ち',
  FINAL: '確定',
};

export async function latestFinalVersion(skillSheetId: string) {
  return prisma.sheetVersion.findFirst({
    where: { skillSheetId, status: 'FINAL' },
    orderBy: { versionNo: 'desc' },
  });
}
