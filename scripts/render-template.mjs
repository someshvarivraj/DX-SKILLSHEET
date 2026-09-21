/**
 * Render the generated 項目定義書 HTML to PDF with headless Chromium.
 *
 * Run via `npm run template:fields`, which generates the HTML first.
 * Output: docs/項目定義書_FieldDefinitions.pdf
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'tmp-field-template.html');
const outDir = path.join(root, 'docs');
const out = path.join(outDir, '項目定義書_FieldDefinitions.pdf');

if (!fs.existsSync(source)) {
  console.error(`${source} が見つからない。先に make-field-template.ts を実行すること。`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const stamp = new Date();
const dateLabel = `${stamp.getFullYear()}年${stamp.getMonth() + 1}月${stamp.getDate()}日`;

const browser = await chromium.launch({
  // Falls back to whatever Playwright has installed when this env var is unset.
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  await page.goto(`file://${source}`, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;font-size:8px;padding:0 12mm;display:flex;justify-content:space-between;color:#666;font-family:sans-serif;">
      <span>IITスキルシート生成システム　項目定義書</span><span>${dateLabel}</span>
      <span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' },
  });
  fs.writeFileSync(out, pdf);
  console.log(`wrote ${out} (${pdf.length} bytes)`);
} finally {
  await browser.close().catch(() => undefined);
}
