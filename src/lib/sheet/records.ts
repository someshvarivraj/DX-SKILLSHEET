/**
 * Repeating records and display selection.  Specification §5.4, §5.5.
 *
 * - About ten records may be stored per person; at most three are displayed.
 * - Records may be added from the screen and are then AI-generated and edited
 *   like any other.
 * - Deletion is logical so a mistake can be undone.
 * - Which records are displayed, and in what order, is held in a separate table
 *   so that several named sets (for company A, company B) can exist later.
 */

import type { RecordKind } from '@prisma/client';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';

export const MAX_RECORDS_PER_KIND = 10;

export async function listRecords(skillSheetId: string, kind: RecordKind) {
  return prisma.sheetRecord.findMany({
    where: { skillSheetId, kind, deletedAt: null },
    orderBy: { order: 'asc' },
    include: { displays: true },
  });
}

export async function createRecord(params: {
  skillSheetId: string;
  kind: RecordKind;
  personId: string;
  userId: string;
  sourcePrefix?: string | null;
  origin?: 'IMPORTED' | 'MANUAL';
}) {
  const count = await prisma.sheetRecord.count({
    where: { skillSheetId: params.skillSheetId, kind: params.kind, deletedAt: null },
  });
  if (count >= MAX_RECORDS_PER_KIND) {
    throw new Error(
      `${params.kind === 'INTERNSHIP' ? 'インターンシップ' : 'プロジェクト'}は1人あたり${MAX_RECORDS_PER_KIND}件までである`,
    );
  }

  const record = await prisma.sheetRecord.create({
    data: {
      skillSheetId: params.skillSheetId,
      kind: params.kind,
      origin: params.origin ?? 'MANUAL',
      sourcePrefix: params.sourcePrefix ?? null,
      order: count,
    },
  });

  // Register the record against every preset, hidden by default.
  const presets = await prisma.displayPreset.findMany({
    where: { skillSheetId: params.skillSheetId },
  });
  if (presets.length > 0) {
    await prisma.recordDisplay.createMany({
      data: presets.map((p) => ({
        presetId: p.id,
        recordId: record.id,
        isDisplayed: false,
        order: count,
      })),
      skipDuplicates: true,
    });
  }

  await recordAudit({
    userId: params.userId,
    action: 'sheet.record_create',
    entityType: 'SheetRecord',
    entityId: record.id,
    personId: params.personId,
  });

  return record;
}

export async function softDeleteRecord(params: {
  recordId: string;
  personId: string;
  userId: string;
}) {
  const record = await prisma.sheetRecord.update({
    where: { id: params.recordId },
    data: { deletedAt: new Date() },
  });
  await recordAudit({
    userId: params.userId,
    action: 'sheet.record_delete',
    entityType: 'SheetRecord',
    entityId: record.id,
    personId: params.personId,
    summary: '論理削除した（復旧可能）',
  });
  return record;
}

export async function restoreRecord(recordId: string) {
  return prisma.sheetRecord.update({
    where: { id: recordId },
    data: { deletedAt: null },
  });
}

/**
 * Set which records are displayed for a preset. Enforces the cap declared on
 * the section so more than three can never be marked (§5.4).
 */
export async function setDisplayedRecords(params: {
  presetId: string;
  kind: RecordKind;
  recordIds: string[];
  personId: string;
  userId: string;
}) {
  const section = await prisma.sheetSection.findFirst({
    where: { recordKind: params.kind },
    select: { maxDisplayed: true, nameJa: true },
  });
  const max = section?.maxDisplayed ?? 3;

  if (params.recordIds.length > max) {
    throw new Error(
      `${section?.nameJa ?? 'このセクション'}に表示できるのは${max}件までである`,
    );
  }

  const preset = await prisma.displayPreset.findUniqueOrThrow({
    where: { id: params.presetId },
  });

  const all = await prisma.sheetRecord.findMany({
    where: { skillSheetId: preset.skillSheetId, kind: params.kind, deletedAt: null },
    select: { id: true },
  });

  await prisma.$transaction(
    all.map((record) => {
      const index = params.recordIds.indexOf(record.id);
      return prisma.recordDisplay.upsert({
        where: {
          presetId_recordId: { presetId: params.presetId, recordId: record.id },
        },
        create: {
          presetId: params.presetId,
          recordId: record.id,
          isDisplayed: index !== -1,
          order: index === -1 ? 999 : index,
        },
        update: {
          isDisplayed: index !== -1,
          order: index === -1 ? 999 : index,
        },
      });
    }),
  );

  await recordAudit({
    userId: params.userId,
    action: 'sheet.record_display',
    personId: params.personId,
    summary: `表示レコードを${params.recordIds.length}件に設定した`,
    meta: { kind: params.kind, presetId: params.presetId },
  });
}

export async function createPreset(params: {
  skillSheetId: string;
  name: string;
}) {
  const preset = await prisma.displayPreset.create({
    data: { skillSheetId: params.skillSheetId, name: params.name, isDefault: false },
  });
  const records = await prisma.sheetRecord.findMany({
    where: { skillSheetId: params.skillSheetId, deletedAt: null },
  });
  if (records.length > 0) {
    await prisma.recordDisplay.createMany({
      data: records.map((r, i) => ({
        presetId: preset.id,
        recordId: r.id,
        isDisplayed: false,
        order: i,
      })),
      skipDuplicates: true,
    });
  }
  return preset;
}

export async function setHiddenFields(params: {
  presetId: string;
  hiddenFieldCodes: string[];
}) {
  return prisma.displayPreset.update({
    where: { id: params.presetId },
    data: { hiddenFieldCodes: params.hiddenFieldCodes },
  });
}
