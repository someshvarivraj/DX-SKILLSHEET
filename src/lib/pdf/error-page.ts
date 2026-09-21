/**
 * Error responses for the download endpoints.
 *
 * These endpoints are reached by a browser following a link, not by fetch(),
 * so a JSON body is shown to the operator as a wall of raw text — which is
 * what happened when a download was attempted before the sheet was finalised.
 * A browser gets a readable page; anything asking for JSON still gets JSON.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wantsHtml(req: NextApiRequest): boolean {
  const accept = req.headers.accept ?? '';
  return accept.includes('text/html');
}

export type DownloadProblem = {
  status: number;
  /** One sentence: what went wrong. */
  title: string;
  /** What to do about it. */
  detail?: string;
  /** Items the operator still has to deal with, e.g. unreviewed fields. */
  items?: Array<{ sectionName: string; fieldName: string }>;
  /** Where to go to fix it. */
  backHref?: string;
  backLabel?: string;
  /** Machine-readable payload kept for non-browser callers. */
  json?: Record<string, unknown>;
};

export function sendDownloadProblem(
  req: NextApiRequest,
  res: NextApiResponse,
  problem: DownloadProblem,
): void {
  if (!wantsHtml(req)) {
    res.status(problem.status).json({ error: problem.title, ...problem.json });
    return;
  }

  const items = problem.items ?? [];
  const list =
    items.length > 0
      ? `<p class="lead">確認が済んでいない項目（${items.length}件）</p>
         <ul>${items
           .map(
             (i) =>
               `<li><span class="sec">${escape(i.sectionName)}／</span>${escape(i.fieldName)}</li>`,
           )
           .join('')}</ul>`
      : '';

  const back = problem.backHref
    ? `<a class="btn" href="${escape(problem.backHref)}">${escape(problem.backLabel ?? '戻る')}</a>`
    : '';

  res.status(problem.status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!doctype html>
<html lang="ja"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>出力できません</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0; padding: 48px 24px;
    background: #FCF8EF; color: #102B54;
    font-family: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Hiragino Sans',
      'Yu Gothic', YuGothic, Meiryo, sans-serif;
    line-height: 1.8; line-break: strict;
  }
  .card {
    max-width: 720px; margin: 0 auto; background: #fff;
    border: 1px solid #E4EAF2; border-radius: 12px; padding: 28px 30px;
    box-shadow: 0 1px 3px rgba(16,43,84,.06);
  }
  h1 { margin: 0 0 8px; font-size: 1.125rem; }
  p { margin: 0 0 4px; font-size: .9375rem; }
  .detail { color: #33415C; }
  .lead { margin-top: 20px; font-weight: 600; font-size: .875rem; }
  ul {
    margin: 6px 0 0; padding: 0; list-style: none;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 0 24px; font-size: .8125rem;
  }
  .sec { color: #647591; }
  .btn {
    display: inline-block; margin-top: 22px; padding: 9px 16px;
    background: #044BA7; color: #fff; border-radius: 7px;
    font-size: .875rem; font-weight: 600; text-decoration: none;
  }
</style></head>
<body><div class="card">
  <h1>${escape(problem.title)}</h1>
  ${problem.detail ? `<p class="detail">${escape(problem.detail)}</p>` : ''}
  ${list}
  ${back}
</div></body></html>`);
}
