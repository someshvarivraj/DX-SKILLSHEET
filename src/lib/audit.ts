/**
 * Audit log.  Specification §12.4 — record logins, views, edits, finalisations
 * and PDF exports with timestamp, user, action and subject.
 *
 * Writing to the log must never break the operation it records, so failures are
 * swallowed and reported to the server log only.
 */

import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { clientIp } from '@/lib/auth/session';

export type AuditAction =
  | 'auth.login_link_requested'
  | 'auth.login'
  | 'auth.logout'
  | 'auth.login_failed'
  | 'sheet.view'
  | 'sheet.field_edit'
  | 'sheet.field_generate'
  | 'sheet.field_revert'
  | 'sheet.field_lock'
  | 'sheet.record_create'
  | 'sheet.record_delete'
  | 'sheet.record_display'
  | 'sheet.version_create'
  | 'sheet.submit_for_review'
  | 'sheet.finalise'
  | 'sheet.export_pdf'
  | 'person.photo_upload'
  | 'person.photo_remove'
  /** 補足資料 — the sales-facing document and the notes it carries. */
  | 'supplement.export_pdf'
  | 'supplement.memo_add'
  | 'import.run'
  | 'import.apply'
  | 'definition.update'
  | 'glossary.update'
  | 'user.create'
  | 'user.update';

export async function recordAudit(params: {
  userId?: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  personId?: string;
  summary?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    let ip: string | undefined;
    try {
      ip = clientIp(await headers());
    } catch {
      ip = undefined;
    }
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        personId: params.personId,
        summary: params.summary,
        meta: params.meta as never,
        ip,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('audit log write failed', error);
  }
}

export const AUDIT_LABELS: Record<string, string> = {
  'auth.login_link_requested': 'ログインリンク発行',
  'auth.login': 'ログイン',
  'auth.logout': 'ログアウト',
  'auth.login_failed': 'ログイン失敗',
  'sheet.view': 'スキルシート閲覧',
  'sheet.field_edit': '項目の手修正',
  'sheet.field_generate': '項目のAI生成',
  'sheet.field_revert': '項目を過去の版に戻した',
  'sheet.field_lock': '項目のロック変更',
  'sheet.record_create': 'レコード追加',
  'sheet.record_delete': 'レコード削除',
  'sheet.record_display': '表示レコードの変更',
  'sheet.version_create': '版の作成',
  'sheet.submit_for_review': '確認依頼',
  'sheet.finalise': '確定',
  'sheet.export_pdf': 'PDF出力',
  'person.photo_upload': '写真の登録',
  'person.photo_remove': '写真の削除',
  'import.run': '取り込み実行',
  'import.apply': '取り込み内容の反映',
  'definition.update': '項目定義の変更',
  'glossary.update': '対訳辞書の変更',
  'user.create': '利用者の追加',
  'user.update': '利用者の変更',
};
