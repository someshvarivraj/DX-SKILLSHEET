/**
 * One-off repairs to item master data, safe to run any number of times
 * (`npm run db:seed` runs them).
 *
 *  1. Titles split at the wrong solidus. "英語（TOEFL／IELTS）／English" used to
 *     be split at the first ／, inside the brackets; it is re-split at the
 *     right one (bilingualSplitIndex).
 *  2. Sets created before 2026-10-06 stored a full copy of every question's
 *     wording, so a fix made to the master never reached them. Only what
 *     differs from the master is kept.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { bilingualSplitIndex } from '@/lib/form/parse-apps-script';

function resplit(ja: string, en: string | null): { ja: string; en: string | null } {
  const full = en ? `${ja}／${en}` : ja;
  const idx = bilingualSplitIndex(full);
  if (idx === -1) return { ja: full.trim(), en: null };
  return { ja: full.slice(0, idx).trim(), en: full.slice(idx + 1).trim() || null };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function repairItemMaster(): Promise<{ titles: number; wordings: number }> {
  let titles = 0;
  let wordings = 0;

  const items = await prisma.item.findMany();
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const item of items) {
    const fixed = resplit(item.titleJa, item.titleEn);
    if (fixed.ja !== item.titleJa || fixed.en !== item.titleEn) {
      await prisma.item.update({ where: { id: item.id }, data: { titleJa: fixed.ja, titleEn: fixed.en } });
      byId.set(item.id, { ...item, titleJa: fixed.ja, titleEn: fixed.en });
      titles++;
    }
  }

  const links = await prisma.questionSetItem.findMany({ where: { NOT: { wording: { equals: Prisma.DbNull } } } });
  for (const link of links) {
    if (link.wording === null || link.wording === undefined) {
      // A JSON null left by an earlier run: store "no wording" properly.
      await prisma.questionSetItem.update({
        where: { setId_itemId: { setId: link.setId, itemId: link.itemId } },
        data: { wording: Prisma.DbNull },
      });
      continue;
    }
    const item = byId.get(link.itemId);
    if (!item) continue;
    const w = { ...((link.wording ?? {}) as Record<string, unknown>) };
    if (typeof w.titleJa === 'string') {
      const fixed = resplit(w.titleJa, (w.titleEn as string | null) ?? null);
      w.titleJa = fixed.ja;
      w.titleEn = fixed.en;
    }
    const master: Record<string, unknown> = {
      titleJa: item.titleJa,
      titleEn: item.titleEn,
      help: item.helpJa,
      options: item.options,
      allowOther: item.allowOther,
      gridRows: item.gridRows,
      gridColumns: item.gridColumns,
    };
    for (const k of Object.keys(w)) if (k in master && same(w[k], master[k])) delete w[k];
    const next = Object.keys(w).length > 0 ? w : null;
    if (!same(next, link.wording)) {
      await prisma.questionSetItem.update({
        where: { setId_itemId: { setId: link.setId, itemId: link.itemId } },
        data: { wording: next ? (next as Prisma.InputJsonValue) : Prisma.DbNull },
      });
      wordings++;
    }
  }
  return { titles, wordings };
}
