/**
 * Ownership checks for the ids a client sends.
 *
 * A server action receives a `personId` and an id for the thing to change — a
 * field, a stored value, a record, a history entry, a version. Checking the
 * `personId` alone is not a check at all: an operator who may edit their own
 * sheet can pass their own `personId` together with somebody else's `valueId`
 * and the action will happily act on it.
 *
 * Every one of those ids is resolved here, back to the person it actually
 * belongs to, and refused when it does not match. Actions must not query these
 * tables by a client-supplied id without going through this module.
 *
 * The section an operation belongs to is derived here too. It used to be sent
 * by the client alongside the field id, which meant an engineer could name a
 * section they are allowed to edit and then act on a field from one they are
 * not.
 */

import { prisma } from '@/lib/db';

/** Thrown when an id does not belong to the person in the request. */
export class OwnershipError extends Error {
  constructor(message = 'この操作は許可されていない') {
    super(message);
    this.name = 'OwnershipError';
  }
}

/** The field being changed, with the section it really belongs to. */
export type ResolvedField = {
  fieldId: string;
  sectionCode: string;
  sectionDocument: string;
};

/**
 * Resolve a field id to its section.
 *
 * The field definition is shared by every person, so there is nothing to tie to
 * `personId` here — the point is that the caller no longer chooses which
 * section its permissions are checked against.
 */
export async function resolveField(fieldId: string): Promise<ResolvedField> {
  const field = await prisma.sheetField.findUnique({
    where: { id: fieldId },
    select: { id: true, section: { select: { code: true, document: true } } },
  });
  if (!field) throw new OwnershipError('項目が見つからない');
  return {
    fieldId: field.id,
    sectionCode: field.section.code,
    sectionDocument: field.section.document,
  };
}

/** Confirm a stored value belongs to this person, and say which field it is. */
export async function assertValueBelongsToPerson(
  valueId: string,
  personId: string,
): Promise<ResolvedField & { versionId: string }> {
  const value = await prisma.fieldValue.findUnique({
    where: { id: valueId },
    select: {
      versionId: true,
      version: { select: { skillSheet: { select: { personId: true } } } },
      field: { select: { id: true, section: { select: { code: true, document: true } } } },
    },
  });
  if (!value || value.version.skillSheet.personId !== personId) {
    throw new OwnershipError('この項目は対象者のものではない');
  }
  return {
    versionId: value.versionId,
    fieldId: value.field.id,
    sectionCode: value.field.section.code,
    sectionDocument: value.field.section.document,
  };
}

/** Confirm a history entry belongs to this person, and say which field it is. */
export async function assertHistoryBelongsToPerson(
  historyId: string,
  personId: string,
): Promise<ResolvedField & { versionId: string }> {
  const entry = await prisma.fieldValueHistory.findUnique({
    where: { id: historyId },
    select: { fieldValueId: true },
  });
  if (!entry) throw new OwnershipError('履歴が見つからない');
  return assertValueBelongsToPerson(entry.fieldValueId, personId);
}

/** Confirm a repeating record belongs to this person. */
export async function assertRecordBelongsToPerson(
  recordId: string,
  personId: string,
): Promise<{ recordId: string; kind: string }> {
  const record = await prisma.sheetRecord.findUnique({
    where: { id: recordId },
    select: { id: true, kind: true, skillSheet: { select: { personId: true } } },
  });
  if (!record || record.skillSheet.personId !== personId) {
    throw new OwnershipError('このレコードは対象者のものではない');
  }
  return { recordId: record.id, kind: record.kind };
}

/** Confirm a version belongs to this person. */
export async function assertVersionBelongsToPerson(
  versionId: string,
  personId: string,
): Promise<{ versionId: string; status: string }> {
  const version = await prisma.sheetVersion.findUnique({
    where: { id: versionId },
    select: { id: true, status: true, skillSheet: { select: { personId: true } } },
  });
  if (!version || version.skillSheet.personId !== personId) {
    throw new OwnershipError('この版は対象者のものではない');
  }
  return { versionId: version.id, status: version.status };
}
