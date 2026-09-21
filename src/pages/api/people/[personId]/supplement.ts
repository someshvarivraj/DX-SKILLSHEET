/**
 * 補足資料 download — the sales-facing supplementary document.
 *
 * A Pages Router route for the same reason as the skill sheet PDF: it renders
 * with `react-dom/server`, which the App Router forbids. See the note at the
 * top of src/lib/pdf/render.ts.
 *
 * Unlike the skill sheet this does not require a finalised version — the
 * document is internal and its notes change between meetings — but it does
 * require the export permission, so a VIEWER cannot pull internal notes.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getUserFromToken, SESSION_COOKIE } from '@/lib/auth/session';
import { can, canAccessPerson } from '@/lib/auth/permissions';
import { sendDownloadProblem } from '@/lib/pdf/error-page';
import { exportSupplement } from '@/lib/pdf/supplement';

export const config = {
  api: {
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

  // The supplementary document holds internal notes, so the engineer whose
  // sheet it is must not be able to read it either — only staff who may export.
  if (!canAccessPerson(user, personId) || !can(user, 'sheet.export')) {
    sendDownloadProblem(req, res, { status: 403, title: '補足資料を出力する権限がない' });
    return;
  }
  if (user.role === 'ENGINEER') {
    sendDownloadProblem(req, res, {
      status: 403,
      title: '補足資料は社内用の資料である',
      detail: '技術者本人には公開されません。',
    });
    return;
  }

  const result = await exportSupplement({ personId, userId: user.id });
  if (!result) {
    sendDownloadProblem(req, res, { status: 404, title: '対象者が見つからない' });
    return;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
  res.setHeader('Content-Length', String(result.bytes));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(result.buffer);
}
