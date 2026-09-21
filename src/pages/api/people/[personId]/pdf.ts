/**
 * PDF download (§11.4). Refuses anything that is not a finalised version.
 *
 * Deliberately a Pages Router API route, not an App Router route handler.
 * `src/lib/pdf/render.ts` renders the skill sheet to an HTML string with
 * `react-dom/server` before handing it to Playwright — the App Router
 * bundles everything under `src/app` (route handlers included) with React's
 * "react-server" condition active, under which `react-dom/server` resolves
 * to a stub that throws at runtime. The Pages Router has no such
 * restriction, so this one endpoint lives here instead.
 *
 * Because Pages Router API routes can't use `next/headers`, the session
 * cookie is read directly from the request rather than through
 * `getCurrentUser()`.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getUserFromToken, SESSION_COOKIE } from '@/lib/auth/session';
import { can, canAccessPerson } from '@/lib/auth/permissions';
import { exportSkillSheet } from '@/lib/pdf/render';
import { sendDownloadProblem } from '@/lib/pdf/error-page';

export const config = {
  api: {
    // Skill sheet PDFs (with a photo) can exceed the default 4mb warning.
    responseLimit: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const personId = req.query.personId;
  if (typeof personId !== 'string') {
    sendDownloadProblem(req, res, { status: 400, title: '不正なリクエストである' });
    return;
  }

  const token = req.cookies[SESSION_COOKIE];
  const user = token ? await getUserFromToken(token) : null;
  if (!user) {
    sendDownloadProblem(req, res, {
      status: 401,
      title: 'ログインが必要である',
      backHref: '/login',
      backLabel: 'ログイン画面へ',
    });
    return;
  }

  if (!canAccessPerson(user, personId) || !can(user, 'sheet.export')) {
    sendDownloadProblem(req, res, { status: 403, title: 'PDFを出力する権限がない' });
    return;
  }

  const presetParam = req.query.preset;
  const presetId = typeof presetParam === 'string' ? presetParam : null;

  const result = await exportSkillSheet({ personId, userId: user.id, presetId });

  if (!result.ok) {
    sendDownloadProblem(req, res, {
      status: 409,
      title: '確定版がないため、PDFを出力できません。',
      detail:
        'PDFは確定した版だけを出力できます。編集画面で未確認の項目を確認し、「確定する」を実行してから、もう一度お試しください。',
      items: result.unreviewed,
      backHref: `/people/${personId}`,
      backLabel: '編集画面に戻る',
      json: { unreviewed: result.unreviewed },
    });
    return;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
  res.setHeader('Content-Length', String(result.bytes));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(result.buffer);
}
