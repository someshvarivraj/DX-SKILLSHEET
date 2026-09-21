/**
 * What each role may do.  Specification ch.12 and ch.14.
 *
 * Roles exist from phase 1 even though only the administrator is active at
 * first, because the specification asks for the user/role concept to be in the
 * phase-1 design so that self-service editing can be added without retrofitting
 * ownership onto existing data (ch.14).
 */

import type { Role } from '@prisma/client';
import type { SessionUser } from './session';

export type Capability =
  | 'sheet.view'
  | 'sheet.edit'
  | 'sheet.editOwnExperience'
  | 'sheet.submitForReview'
  | 'sheet.finalise'
  | 'sheet.export'
  | 'sheet.selectRecords'
  | 'import.run'
  | 'definition.manage'
  | 'glossary.manage'
  | 'user.manage'
  | 'audit.view';

const MATRIX: Record<Role, Capability[]> = {
  ADMIN: [
    'sheet.view',
    'sheet.edit',
    'sheet.editOwnExperience',
    'sheet.submitForReview',
    'sheet.finalise',
    'sheet.export',
    'sheet.selectRecords',
    'import.run',
    'definition.manage',
    'glossary.manage',
    'user.manage',
    'audit.view',
  ],
  // Sales adjust sheets for the company they are submitting to (Sano-san's
  // requirement), but do not manage definitions or users.
  SALES: [
    'sheet.view',
    'sheet.edit',
    'sheet.selectRecords',
    'sheet.export',
    'glossary.manage',
  ],
  // Engineers maintain their own experience and submit it for review.
  ENGINEER: ['sheet.view', 'sheet.editOwnExperience', 'sheet.submitForReview'],
  // The shared demo account is read-only (§12.3).
  VIEWER: ['sheet.view'],
};

export function can(user: SessionUser | null, capability: Capability): boolean {
  if (!user) return false;
  return MATRIX[user.role].includes(capability);
}

/** Engineers may only touch their own sheet. */
export function canAccessPerson(user: SessionUser | null, personId: string): boolean {
  if (!user) return false;
  if (user.role === 'ENGINEER') return user.personId === personId;
  return true;
}

/**
 * Which sections an engineer may edit on their own sheet.
 *
 * `work_japan` is here on Sano-san's instruction (reply to D-1): once someone
 * has joined and finished at a customer site, they add that experience
 * themselves rather than asking an administrator to type it in.
 */
export const ENGINEER_EDITABLE_SECTIONS = [
  'internships',
  'projects',
  'work_japan',
] as const;

export function canEditSection(
  user: SessionUser | null,
  personId: string,
  sectionCode: string,
): boolean {
  if (!user) return false;
  if (!canAccessPerson(user, personId)) return false;
  if (can(user, 'sheet.edit')) return true;
  if (user.role === 'ENGINEER') {
    return (ENGINEER_EDITABLE_SECTIONS as readonly string[]).includes(sectionCode);
  }
  return false;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: '管理者',
  SALES: '営業',
  ENGINEER: '技術者（本人）',
  VIEWER: '閲覧のみ（デモ）',
};
