/**
 * PDF output.  Specification chapter 11.
 *
 * §11.1 Only a FINAL version can be exported. No watermarks or "draft" labels.
 * §11.2 Headless Chromium prints the same HTML the preview uses, inside AWS.
 * §11.3 One at a time; the browser process is always closed; a small instance
 *       cannot afford leaked processes.
 * §11.5 A4 portrait, header note, footer with company name, date and "n / N".
 * §11.6 File name carries the Latin name and the creation date.
 * §11.7 Every export is recorded and the file is kept in object storage.
 */

// Next.js's App Router forbids importing 'react-dom/server' (in any form,
// including the newer 'react-dom/static') from anything bundled under app/
// — route handlers included — because that whole tree runs under React's
// "react-server" condition, where the module resolves to a stub that throws
// at runtime ("not supported in React Server Components"). This file is only
// ever imported from the Pages Router endpoint (src/pages/api/.../pdf.ts),
// which sits outside that layer, so the plain API is safe to use here.
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { getStorage } from '@/lib/storage';
import { buildExportKey } from '@/lib/storage-keys';
import { recordAudit } from '@/lib/audit';
import { loadSheetModel, toPrintableModel, type SheetModel } from '@/lib/sheet/model';
import { SHEET_STYLES, SkillSheetDocument } from '@/components/sheet-document';

export function buildSheetHtml(model: SheetModel, photoDataUrl?: string | null): string {
  const body = renderToStaticMarkup(
    createElement(SkillSheetDocument, { model, photoUrl: photoDataUrl }),
  );
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(model.person.fullNameEnglish)}</title>
<style>${SHEET_STYLES}</style>
</head>
<body>${body}</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/** Latin name + creation date, no employee number (§11.6). */
export function buildFileName(model: SheetModel, when = new Date()): string {
  const name = model.person.fullNameEnglish
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .split(/\s+/)
    .join('_');
  const date = `${when.getFullYear()}${String(when.getMonth() + 1).padStart(2, '0')}${String(
    when.getDate(),
  ).padStart(2, '0')}`;
  return `${name || 'skillsheet'}_${date}.pdf`;
}

// §11.3 — never render more than one PDF at a time.
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function launchBrowser() {
  const env = getEnv();
  const { chromium } = await import('playwright-core');
  return chromium.launch({
    executablePath: env.CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
}

export async function renderPdf(
  html: string,
  /**
   * The date printed in the footer. Sano-san asked for the date the sheet was
   * last updated, followed by 更新 — not the day the file happened to be
   * generated, which told the reader nothing about the content's age.
   */
  updatedAt: Date = new Date(),
): Promise<Buffer> {
  const env = getEnv();
  return enqueue(async () => {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      await page.emulateMedia({ media: 'print' });
      const dateLabel = `${formatStamp(updatedAt, env.PDF_FOOTER_SHOW_TIME)}更新`;
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="width:100%;font-size:8px;padding:0 14mm;display:flex;justify-content:space-between;color:#444;font-family:sans-serif;">
            <span>${escapeHtml(env.COMPANY_NAME)}</span>
            <span>${dateLabel}</span>
            <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
          </div>`,
        margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
      });
      return Buffer.from(pdf);
    } finally {
      // §11.3 — always close, even on failure.
      await browser.close().catch(() => undefined);
    }
  });
}

function formatStamp(d: Date, withTime: boolean): string {
  const date = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  if (!withTime) return date;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${date} ${hh}:${mm}`;
}

export type ExportResult =
  | { ok: true; fileName: string; storageKey: string; bytes: number; buffer: Buffer }
  | { ok: false; reason: 'not-final'; unreviewed: Array<{ fieldName: string; sectionName: string }> };

/** Export one person's sheet. Refuses anything that is not FINAL (§11.1). */
export async function exportSkillSheet(params: {
  personId: string;
  userId: string;
  presetId?: string | null;
}): Promise<ExportResult> {
  const sheet = await prisma.skillSheet.findUniqueOrThrow({
    where: { personId: params.personId },
  });

  const finalVersion = await prisma.sheetVersion.findFirst({
    where: { skillSheetId: sheet.id, status: 'FINAL' },
    orderBy: { versionNo: 'desc' },
  });

  if (!finalVersion) {
    const draft = await loadSheetModel(params.personId, { presetId: params.presetId });
    return {
      ok: false,
      reason: 'not-final',
      unreviewed:
        draft?.sections
          .flatMap((s) => [
            ...s.fields.map((f) => ({ section: s, field: f })),
            ...s.records.flatMap((r) => r.fields.map((f) => ({ section: s, field: f }))),
          ])
          .filter(({ field }) => field.valueJa && !field.isReviewed)
          .map(({ section, field }) => ({
            sectionName: section.nameJa,
            fieldName: field.nameJa,
          })) ?? [],
    };
  }

  const model = await loadSheetModel(params.personId, {
    presetId: params.presetId,
    versionId: finalVersion.id,
  });
  if (!model) throw new Error('スキルシートを読み込めなかった');

  const printable = toPrintableModel(model, true);
  const photoDataUrl = await loadPhotoDataUrl(model.person.photoKey);
  const html = buildSheetHtml(printable, photoDataUrl);
  const buffer = await renderPdf(html, finalVersion.finalisedAt ?? finalVersion.updatedAt);

  const fileName = buildFileName(model);
  const storageKey = buildExportKey(params.personId, fileName);
  await getStorage().put(storageKey, buffer, 'application/pdf');

  await prisma.exportHistory.create({
    data: {
      versionId: finalVersion.id,
      presetId: params.presetId ?? model.preset?.id ?? null,
      exportedById: params.userId,
      fileName,
      storageKey,
      byteSize: buffer.byteLength,
    },
  });

  await recordAudit({
    userId: params.userId,
    action: 'sheet.export_pdf',
    entityType: 'SheetVersion',
    entityId: finalVersion.id,
    personId: params.personId,
    summary: `${fileName} を出力した`,
  });

  return { ok: true, fileName, storageKey, bytes: buffer.byteLength, buffer };
}

async function loadPhotoDataUrl(key: string | null): Promise<string | null> {
  if (!key) return null;
  try {
    const buffer = await getStorage().get(key);
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}
