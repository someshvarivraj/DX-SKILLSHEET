/**
 * Compare a .gs plan with the item master, and write it (design §"Uploading a
 * .gs", 2026-10-02):
 *   - items not in the master are added;
 *   - items already in the master are kept as they are, never removed — the
 *     new set keeps its own copy of the wording and options it asks with
 *     (QuestionSetItem.wording), so another group's form or a later year's
 *     rewording never changes what the master or an earlier set says;
 *   - a new question set is created for the upload;
 *   - items not in the script are simply not in that set.
 *
 * A question whose code already exists but whose title has clearly changed is
 * not assumed to be the same item: the preview lists it and the operator says
 * "same item, reworded" or "different question". A different question becomes
 * a new item, so a renumbered form cannot file answers under the wrong item.
 */

import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import type { GsPlan, PlannedItem, ShowIf } from './gs-plan';

export type ItemChange = {
  key: string;
  oldTitle: string;
  newTitle: string;
};

export type GsPreview = {
  title: string | null;
  itemCount: number;
  newCategories: string[];
  newSubcategories: string[];
  newItems: Array<{ key: string; title: string; subcategory: string }>;
  keptCount: number;
  /** Reworded (one language unchanged, or close): the same item, asked in the new words. */
  reworded: ItemChange[];
  /** Clearly different under the same code: the operator decides. */
  needsDecision: ItemChange[];
  /** Active items in the master that this script does not ask. */
  notAsked: Array<{ key: string; title: string }>;
};

export type ItemDecision = 'same' | 'different';

const title = (ja: string, en: string | null | undefined) => (en ? `${ja}／${en}` : ja);

function bigrams(s: string): Map<string, number> {
  const t = s.toLowerCase().replace(/\s+/g, ' ').trim();
  const out = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** Dice similarity of two strings, 0..1. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const x = bigrams(a);
  const y = bigrams(b);
  let overlap = 0;
  let total = 0;
  for (const n of x.values()) total += n;
  for (const n of y.values()) total += n;
  for (const [g, n] of x) overlap += Math.min(n, y.get(g) ?? 0);
  return total === 0 ? 0 : (2 * overlap) / total;
}

/**
 * Same item if either language is unchanged or close; clearly different only
 * when both languages moved (a reused code), so a translation fix or a typo
 * never asks the operator anything.
 */
export function classifyTitleChange(
  stored: { titleJa: string; titleEn: string | null },
  planned: { titleJa: string; titleEn: string | null },
): 'unchanged' | 'reworded' | 'different' {
  if (stored.titleJa === planned.titleJa && (stored.titleEn ?? '') === (planned.titleEn ?? '')) {
    return 'unchanged';
  }
  const ja = similarity(stored.titleJa, planned.titleJa);
  const en =
    stored.titleEn && planned.titleEn ? similarity(stored.titleEn, planned.titleEn) : ja;
  return ja >= 0.5 || en >= 0.5 ? 'reworded' : 'different';
}

export async function previewGsPlan(plan: GsPlan): Promise<GsPreview> {
  const [categories, subcategories, items] = await Promise.all([
    prisma.itemCategory.findMany({ select: { key: true } }),
    prisma.itemSubcategory.findMany({ select: { key: true } }),
    prisma.item.findMany({
      where: { status: { not: 'REPLACED' } },
      select: { key: true, titleJa: true, titleEn: true, status: true },
    }),
  ]);
  const catKeys = new Set(categories.map((c) => c.key));
  const subKeys = new Set(subcategories.map((s) => s.key));
  const itemsByKey = new Map(items.map((i) => [i.key, i]));
  const planned = new Set(plan.items.map((i) => i.key));

  const preview: GsPreview = {
    title: plan.title,
    itemCount: plan.items.length,
    newCategories: [],
    newSubcategories: [],
    newItems: [],
    keptCount: 0,
    reworded: [],
    needsDecision: [],
    notAsked: items
      .filter((i) => i.status === 'ACTIVE' && !planned.has(i.key))
      .map((i) => ({ key: i.key, title: title(i.titleJa, i.titleEn) })),
  };

  for (const cat of plan.categories) {
    if (!catKeys.has(cat.key)) preview.newCategories.push(cat.nameJa);
    for (const sub of cat.subcategories) {
      if (!subKeys.has(sub.key)) preview.newSubcategories.push(sub.nameJa);
      for (const item of sub.items) {
        const stored = itemsByKey.get(item.key);
        if (!stored) {
          preview.newItems.push({ key: item.key, title: title(item.titleJa, item.titleEn), subcategory: sub.nameJa });
          continue;
        }
        preview.keptCount++;
        const change = classifyTitleChange(stored, item);
        const entry = {
          key: item.key,
          oldTitle: title(stored.titleJa, stored.titleEn),
          newTitle: title(item.titleJa, item.titleEn),
        };
        if (change === 'reworded') preview.reworded.push(entry);
        if (change === 'different') preview.needsDecision.push(entry);
      }
    }
  }
  return preview;
}

/** "E-x-6" taken -> "E-x-6.2", "E-x-6.3", ... (keeps the "-x-" a repeating key needs). */
async function freshKey(base: string, taken: Set<string>): Promise<string> {
  for (let n = 2; ; n++) {
    const candidate = `${base}.${n}`;
    if (taken.has(candidate)) continue;
    const exists = await prisma.item.findUnique({ where: { key: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
}

export async function applyGsPlan(params: {
  plan: GsPlan;
  setName: string;
  groupTypeId: string;
  sourceFile: string;
  userId: string | null;
  /**
   * Make the new set the one answer files are imported into. Only on request
   * (or when there is none yet): switching it silently would file the next
   * answer file under the wrong questions.
   */
  makeDefault?: boolean;
  /** For each item in preview.needsDecision; a missing decision refuses the import. */
  decisions?: Record<string, ItemDecision>;
}): Promise<{ setId: string; createdItems: number; keptItems: number }> {
  const preview = await previewGsPlan(params.plan);
  const undecided = preview.needsDecision.filter((c) => !params.decisions?.[c.key]);
  if (undecided.length > 0) {
    throw new Error(
      `番号は同じでも内容が変わった設問がある。同じ設問か別の設問かを選んでください: ${undecided.map((c) => c.key).join('、')}`,
    );
  }

  // Keys for "different question" items are worked out first, so branching
  // conditions that point at them can be rewritten too.
  const keyFor = new Map<string, string>();
  const taken = new Set<string>();
  for (const item of params.plan.items) {
    if (params.decisions?.[item.key] === 'different') {
      const fresh = await freshKey(item.key, taken);
      taken.add(fresh);
      keyFor.set(item.key, fresh);
    } else {
      keyFor.set(item.key, item.key);
    }
  }
  const remapShowIf = (showIf: ShowIf | null): ShowIf | null =>
    showIf ? { ...showIf, itemKey: keyFor.get(showIf.itemKey) ?? showIf.itemKey } : null;

  return prisma.$transaction(
    async (tx) => {
      let createdItems = 0;
      let keptItems = 0;

      const lastCat = await tx.itemCategory.findFirst({ orderBy: { order: 'desc' } });
      let catOrder = lastCat?.order ?? 0;

      const subIdByKey = new Map<string, string>();
      const itemIdByPlanKey = new Map<string, string>();

      for (const cat of params.plan.categories) {
        let category = await tx.itemCategory.findUnique({ where: { key: cat.key } });
        if (!category) {
          catOrder += 10;
          category = await tx.itemCategory.create({
            data: { key: cat.key, nameJa: cat.nameJa, nameEn: cat.nameEn, order: catOrder },
          });
        }

        const lastSub = await tx.itemSubcategory.findFirst({
          where: { categoryId: category.id },
          orderBy: { order: 'desc' },
        });
        let subOrder = lastSub?.order ?? 0;
        for (const sub of cat.subcategories) {
          let subcategory = await tx.itemSubcategory.findUnique({ where: { key: sub.key } });
          if (!subcategory) {
            subOrder += 10;
            subcategory = await tx.itemSubcategory.create({
              data: {
                categoryId: category.id,
                key: sub.key,
                nameJa: sub.nameJa,
                nameEn: sub.nameEn,
                isRepeating: sub.isRepeating,
                order: subOrder,
              },
            });
          }
          subIdByKey.set(sub.key, subcategory.id);

          const lastItem = await tx.item.findFirst({
            where: { subcategoryId: subcategory.id },
            orderBy: { order: 'desc' },
          });
          let itemOrder = lastItem?.order ?? 0;
          for (const item of sub.items) {
            const key = keyFor.get(item.key)!;
            const stored = await tx.item.findUnique({ where: { key } });
            let id: string;
            if (stored) {
              // Asked again, so a hidden item comes back; its content is left
              // alone (the set carries its own wording).
              if (stored.status === 'HIDDEN') {
                await tx.item.update({ where: { id: stored.id }, data: { status: 'ACTIVE' } });
              }
              id = stored.id;
              keptItems++;
            } else {
              itemOrder += 10;
              const created = await tx.item.create({
                data: { ...itemContent(item), helpJa: item.help, key, subcategoryId: subcategory.id, type: item.type, order: itemOrder },
              });
              id = created.id;
              createdItems++;
            }
            itemIdByPlanKey.set(item.key, id);
            await tx.itemGroupType.upsert({
              where: { itemId_groupTypeId: { itemId: id, groupTypeId: params.groupTypeId } },
              create: { itemId: id, groupTypeId: params.groupTypeId },
              update: {},
            });
          }
        }
      }

      const hasDefault = (await tx.questionSet.count({ where: { isDefault: true } })) > 0;
      const makeDefault = Boolean(params.makeDefault) || !hasDefault;
      if (makeDefault) {
        await tx.questionSet.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }
      const set = await tx.questionSet.create({
        data: {
          name: params.setName,
          groupTypeId: params.groupTypeId,
          sourceFile: params.sourceFile,
          isDefault: makeDefault,
        },
      });

      let subPosition = 0;
      for (const cat of params.plan.categories) {
        for (const sub of cat.subcategories) {
          await tx.questionSetSubcategory.create({
            data: { setId: set.id, subcategoryId: subIdByKey.get(sub.key)!, order: (subPosition += 10) },
          });
        }
      }
      await tx.questionSetItem.createMany({
        data: params.plan.items.map((item, index) => ({
          setId: set.id,
          itemId: itemIdByPlanKey.get(item.key)!,
          order: (index + 1) * 10,
          isRequired: item.isRequired,
          showIf: (remapShowIf(item.showIf) ?? undefined) as never,
          formCodes: item.formCodes,
          formHeaders: item.formHeaders,
          wording: { ...itemContent(item), help: item.help } as never,
        })),
      });

      await recordAudit({
        userId: params.userId,
        action: 'definition.update',
        entityType: 'QuestionSet',
        entityId: set.id,
        summary: `「${params.sourceFile}」から質問セット「${params.setName}」を作成した（設問${params.plan.items.length}件、うち新規${createdItems}件）`,
      });

      return { setId: set.id, createdItems, keptItems };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

function itemContent(item: PlannedItem) {
  return {
    titleJa: item.titleJa,
    titleEn: item.titleEn,
    options: item.options,
    allowOther: item.allowOther,
    gridRows: item.gridRows,
    gridColumns: item.gridColumns,
  };
}
