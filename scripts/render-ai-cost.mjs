import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'tmp-ai-cost.html');
const out = path.join(root, 'docs', 'AIサービス選定と費用試算.pdf');
fs.mkdirSync(path.dirname(out), { recursive: true });
const d = new Date();
const label = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(`file://${src}`, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({
    format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;font-size:8px;padding:0 13mm;display:flex;justify-content:space-between;color:#666;font-family:sans-serif;">
      <span>AIサービスの選定と費用試算</span><span>${label}</span>
      <span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: '15mm', bottom: '16mm', left: '13mm', right: '13mm' },
  });
  fs.writeFileSync(out, pdf);
  console.log(`wrote ${out} (${pdf.length} bytes)`);
} finally { await browser.close().catch(() => undefined); }
