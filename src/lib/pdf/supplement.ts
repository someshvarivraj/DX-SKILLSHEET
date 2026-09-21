/**
 * 補足資料 PDF export.
 *
 * Kept apart from the skill sheet export because the two documents answer to
 * different rules. The skill sheet may only be exported once a version is FINAL
 * (§11.1) — it is what a customer sees. The supplementary document is internal
 * to sales, carries notes that change between meetings, and would be useless if
 * it could only be produced from a frozen version, so it exports from whatever
 * the current version holds.
 *
 * Like `render.ts`, this renders with `react-dom/server` and must therefore be
 * imported only from the Pages Router.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { loadSheetModel, toPrintableModel, type SheetModel } from '@/lib/sheet/model';
import {
  SUPPLEMENT_STYLES,
  SupplementDocument,
  type MemoView,
} from '@/components/supplement-document';
import { renderPdf } from './render';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export function buildSupplementHtml(model: SheetModel, memos: MemoView[]): string {
  const body = renderToStaticMarkup(createElement(SupplementDocument, { model, memos }));
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(model.person.fullNameEnglish)} — 補足資料</title>
<style>${SUPPLEMENT_STYLES}</style>
</head>
<body>${body}</body>
</html>`;
}

/** Latin name, the word "supplement" and the date, mirroring §11.6. */
export function buildSupplementFileName(model: SheetModel, when = new Date()): string {
  const name = model.person.fullNameEnglish
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .split(/\s+/)
    .join('_');
  const date = `${when.getFullYear()}${String(when.getMonth() + 1).padStart(2, '0')}${String(
    when.getDate(),
  ).padStart(2, '0')}`;
  return `${name || 'person'}_supplement_${date}.pdf`;
}

export type SupplementResult = {
  fileName: string;
  bytes: number;
  buffer: Buffer;
};

export async function exportSupplement(params: {
  personId: string;
  userId: string;
}): Promise<SupplementResult | null> {
  const model = await loadSheetModel(params.personId);
  if (!model) return null;

  const printable = toPrintableModel(model, true, 'SUPPLEMENT');

  const rows = await prisma.personMemo.findMany({
    where: { personId: params.personId },
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { displayName: true } } },
  });
  const memos: MemoView[] = rows.map((m) => ({
    id: m.id,
    body: m.body,
    createdAt: m.createdAt,
    authorName: m.createdBy?.displayName ?? null,
  }));

  const html = buildSupplementHtml(printable, memos);
  const buffer = await renderPdf(html, model.version.updatedAt);
  const fileName = buildSupplementFileName(model);

  await recordAudit({
    userId: params.userId,
    action: 'supplement.export_pdf',
    entityType: 'Person',
    entityId: params.personId,
    personId: params.personId,
    summary: `${fileName} を出力した`,
  });

  return { fileName, bytes: buffer.byteLength, buffer };
}
