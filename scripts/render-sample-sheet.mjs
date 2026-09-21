/**
 * Render the sample skill sheet HTML to an A4 PDF, using the same print
 * settings as the real export (src/lib/pdf/render.ts).
 *   npm run sample:sheet
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const JOBS = [
  { src: path.join(root, 'tmp-sample-sheet.html'), out: path.join(root, 'docs', 'スキルシート_サンプル.pdf') },
  { src: path.join(root, 'tmp-sample-supplement.html'), out: path.join(root, 'docs', '補足資料_サンプル.pdf') },
];
const source = JOBS[0].src;
const out = JOBS[0].out;

if (!fs.existsSync(source)) {
  console.error('先に make-sample-sheet.tsx を実行すること。');
  process.exit(1);
}
fs.mkdirSync(path.dirname(out), { recursive: true });

const d = new Date();
// Matches the real export: the date the sheet was last updated, plus 更新.
const dateLabel = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日更新`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
});
try {
  for (const job of JOBS) {
  if (!fs.existsSync(job.src)) continue;
  const page = await browser.newPage();
  await page.goto(`file://${job.src}`, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;font-size:8px;padding:0 14mm;display:flex;justify-content:space-between;color:#444;font-family:sans-serif;">
      <span>株式会社モルブ阪神工業</span><span>${dateLabel}</span>
      <span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
  });
  fs.writeFileSync(job.out, pdf);
  console.log(`wrote ${job.out} (${pdf.length} bytes)`);
  }
} finally {
  await browser.close().catch(() => undefined);
}
