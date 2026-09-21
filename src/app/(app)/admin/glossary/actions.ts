'use server';

import { revalidatePath } from 'next/cache';
import type { GlossaryCategory } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { recordAudit } from '@/lib/audit';
import { runAction, OperatorError, type ActionResult } from '@/lib/actions/result';

async function guard() {
  const user = await requireUser();
  if (!can(user, 'glossary.manage')) {
    throw new OperatorError('対訳辞書を編集する権限がない');
  }
  return user;
}

export type GlossaryResult = ActionResult;

export async function saveGlossaryEntryAction(input: {
  id?: string;
  category: GlossaryCategory;
  english: string;
  aliases: string;
  japanese: string;
  gloss?: string;
  region?: string;
  note?: string;
  isActive?: boolean;
}): Promise<GlossaryResult> {
  return runAction(async () => {
  const user = await guard();
  const aliases = input.aliases
    .split(/[;,、]/)
    .map((a) => a.trim())
    .filter(Boolean);

  if (!input.english.trim() || !input.japanese.trim()) {
    throw new OperatorError('英語表記と日本語表記は必須である');
  }

  const data = {
    category: input.category,
    english: input.english.trim(),
    aliases,
    japanese: input.japanese.trim(),
    gloss: input.gloss?.trim() || null,
    region: input.region?.trim() || null,
    note: input.note?.trim() || null,
    isActive: input.isActive ?? true,
  };

  // Adding a term that already exists used to upsert, which quietly replaced
  // the existing row's aliases, gloss and note with the blank fields of the new
  // form — destroying work with no indication. A duplicate is now reported.
  if (!input.id) {
    const existing = await prisma.glossaryEntry.findUnique({
      where: { category_english: { category: data.category, english: data.english } },
      select: { id: true, japanese: true, isActive: true },
    });
    if (existing) {
      throw new OperatorError(
        `「${data.english}」はこの分類にすでに登録されている（現在の訳: ${existing.japanese}` +
          `${existing.isActive ? '' : '／無効化済み'}）。既存の行を編集すること。`,
      );
    }
  }

  const saved = input.id
    ? await prisma.glossaryEntry.update({ where: { id: input.id }, data })
    : await prisma.glossaryEntry.create({ data });

  await recordAudit({
    userId: user.id,
    action: 'glossary.update',
    entityType: 'GlossaryEntry',
    entityId: saved.id,
    summary: `${data.english} → ${data.japanese}`,
  });

  revalidatePath('/admin/glossary');
  return { ok: true, message: '保存した' };
  });
}

export async function deleteGlossaryEntryAction(id: string): Promise<GlossaryResult> {
  const user = await guard();
  await prisma.glossaryEntry.update({ where: { id }, data: { isActive: false } });
  await recordAudit({
    userId: user.id,
    action: 'glossary.update',
    entityType: 'GlossaryEntry',
    entityId: id,
    summary: '無効にした',
  });
  revalidatePath('/admin/glossary');
  return { ok: true, message: '無効にした' };
}
