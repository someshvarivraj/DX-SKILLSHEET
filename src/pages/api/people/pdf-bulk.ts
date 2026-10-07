/**
 * Several people's PDFs in one download (spec §11.4), as a ZIP.
 *
 * Each person goes through the same export as the single download — finalised
 * versions only (§11.1), one PDF at a time (§11.3, the render queue), and each
 * file recorded in the export history with its copy kept (§11.7). People
 * without a finalised version are left out and named in a short text file in
 * the ZIP, so nothing is missed silently.
 *
 * A Pages Router route for the same reason as ./[personId]/pdf.ts.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/db';
import { getUserFromToken, SESSION_COOKIE } from '@/lib/auth/session';
import { can, canAccessPerson } from '@/lib/auth/permissions';
import { exportSkillSheet } from '@/lib/pdf/render';
import { sendDownloadProblem } from '@/lib/pdf/error-page';
import { withBasePath } from '@/lib/base-path';
import { makeZip } from '@/lib/zip';

export const config = { api: { responseLimit: false } };

const MAX_PEOPLE = 50;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const token = req.cookies[SESSION_COOKIE];
  const user = token ? await getUserFromToken(token) : null;
  if (!user) {
    sendDownloadProblem(req, res, {
      status: 401,
      title: 'ログインが必要である',
      backHref: withBasePath('/login'),
      backLabel: 'ログイン画面へ',
    });
    return;
  }
  if (!can(user, 'sheet.export') || user.role === 'ENGINEER') {
    sendDownloadProblem(req, res, { status: 403, title: 'PDFを出力する権限がない' });
    return;
  }

  const raw = req.query.id;
  const ids = [...new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((v) => v.split(',')).filter(Boolean))];
  if (ids.length === 0 || ids.length > MAX_PEOPLE) {
    sendDownloadProblem(req, res, {
      status: 400,
      title: ids.length === 0 ? '対象者が選ばれていません' : `一度に出力できるのは${MAX_PEOPLE}人までです`,
      backHref: withBasePath('/people'),
      backLabel: '対象者一覧に戻る',
    });
    return;
  }

  const people = await prisma.person.findMany({ where: { id: { in: ids } } });
  const files: Array<{ name: string; data: Buffer }> = [];
  const skipped: string[] = [];
  const used = new Set<string>();

  // In the order chosen, one at a time.
  for (const id of ids) {
    const person = people.find((p) => p.id === id);
    if (!person || !canAccessPerson(user, id)) continue;
    const label = person.fullNameKatakana
      ? `${person.fullNameKatakana}（${person.fullNameEnglish}）`
      : person.fullNameEnglish;
    const sheet = await prisma.skillSheet.findUnique({ where: { personId: id } });
    if (!sheet) {
      skipped.push(`${label} — スキルシートがありません`);
      continue;
    }
    // One person failing (a rendering error) must not lose everyone else's PDF.
    const result = await exportSkillSheet({ personId: id, userId: user.id }).catch((error: unknown) => {
      console.error('bulk PDF export failed', id, error);
      return null;
    });
    if (!result) {
      skipped.push(`${label} — PDFの作成に失敗しました（個別にもう一度お試しください）`);
      continue;
    }
    if (!result.ok) {
      skipped.push(`${label} — 確定版がありません`);
      continue;
    }
    // Two people with the same name on the same day must not overwrite each other.
    let name = result.fileName;
    for (let n = 2; used.has(name); n++) name = result.fileName.replace(/\.pdf$/, `_${n}.pdf`);
    used.add(name);
    files.push({ name, data: result.buffer });
  }

  if (files.length === 0) {
    sendDownloadProblem(req, res, {
      status: 409,
      title: '出力できるスキルシートがありません',
      detail: `PDFは確定した版だけを出力できます。${skipped.join('、')}`,
      backHref: withBasePath('/people'),
      backLabel: '対象者一覧に戻る',
    });
    return;
  }

  if (skipped.length > 0) {
    files.push({
      name: '出力できなかった人.txt',
      data: Buffer.from(`次の人のPDFは含まれていません。\r\n\r\n${skipped.join('\r\n')}\r\n`, 'utf8'),
    });
  }

  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const zip = makeZip(files, now);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="skillsheets_${stamp}.zip"`);
  res.setHeader('Content-Length', String(zip.length));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(zip);
}
