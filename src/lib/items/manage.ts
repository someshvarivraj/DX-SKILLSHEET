/**
 * Editing the item master, groups and question sets from the admin screens
 * (phase 2 of the design approved 2026-10-02).
 *
 * The rules that keep past sheets intact:
 *   - an item that has answers is hidden or replaced, never deleted (the
 *     database refuses too: answers -> items is ON DELETE RESTRICT);
 *   - replacing moves the answers to the other item and marks the old one;
 *   - a category or subcategory is deleted only when it is empty.
 */

import { Prisma, type ItemType, type QuestionSetStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { groupNameKey } from './group-name';

export type ShowIf = { itemKey: string; anyOf: string[] } | null;

export type ItemInput = {
  titleJa: string;
  titleEn?: string | null;
  helpJa?: string | null;
  helpEn?: string | null;
  exampleJa?: string | null;
  exampleEn?: string | null;
  type: ItemType;
  options: string[];
  allowOther: boolean;
  gridRows: string[];
  gridColumns: string[];
  validation: { integer?: boolean; min?: number | null; max?: number | null; maxLength?: number | null } | null;
  groupTypeIds: string[];
};

const clean = (s: string | null | undefined) => (s ?? '').trim() || null;
const lines = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);

function cleanValidation(v: ItemInput['validation']): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (!v) return { } as Prisma.InputJsonValue;
  const out: Record<string, unknown> = {};
  if (v.integer) out.integer = true;
  for (const k of ['min', 'max', 'maxLength'] as const) {
    const n = v[k];
    if (n !== null && n !== undefined && Number.isFinite(Number(n))) out[k] = Number(n);
  }
  return out as Prisma.InputJsonValue;
}

function itemData(input: ItemInput) {
  if (!input.titleJa.trim()) throw new Error('設問の名前（日本語）を入力してください');
  const options = lines(input.options);
  if (['RADIO', 'LIST', 'CHECKBOX'].includes(input.type) && options.length === 0) {
    throw new Error('選択肢を1つ以上入力してください');
  }
  if (input.type === 'GRID' && (lines(input.gridRows).length === 0 || lines(input.gridColumns).length === 0)) {
    throw new Error('表形式の設問には、行と列を1つ以上入力してください');
  }
  return {
    titleJa: input.titleJa.trim(),
    titleEn: clean(input.titleEn),
    helpJa: clean(input.helpJa),
    helpEn: clean(input.helpEn),
    exampleJa: clean(input.exampleJa),
    exampleEn: clean(input.exampleEn),
    type: input.type,
    options,
    allowOther: input.allowOther,
    gridRows: lines(input.gridRows),
    gridColumns: lines(input.gridColumns),
    validation: cleanValidation(input.validation),
  };
}

/** A key for an item made on screen: never shown, never reused. */
async function newItemKey(subcategoryKey: string, repeating: boolean): Promise<string> {
  const base = repeating ? `${subcategoryKey.replace(/-x$/, '')}-x-n` : `${subcategoryKey}-n`;
  for (;;) {
    const key = `${base}${Math.random().toString(36).slice(2, 7)}`;
    if (!(await prisma.item.findUnique({ where: { key }, select: { id: true } }))) return key;
  }
}

export async function createItem(subcategoryId: string, input: ItemInput) {
  const sub = await prisma.itemSubcategory.findUniqueOrThrow({ where: { id: subcategoryId } });
  const last = await prisma.item.findFirst({ where: { subcategoryId }, orderBy: { order: 'desc' } });
  return prisma.item.create({
    data: {
      ...itemData(input),
      key: await newItemKey(sub.key, sub.isRepeating),
      subcategoryId,
      order: (last?.order ?? 0) + 10,
      groupTypes: { create: input.groupTypeIds.map((groupTypeId) => ({ groupTypeId })) },
    },
  });
}

export async function updateItem(itemId: string, input: ItemInput) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.item.update({ where: { id: itemId }, data: itemData(input) });
    await tx.itemGroupType.deleteMany({ where: { itemId } });
    if (input.groupTypeIds.length > 0) {
      await tx.itemGroupType.createMany({
        data: input.groupTypeIds.map((groupTypeId) => ({ itemId, groupTypeId })),
      });
    }
    return item;
  });
}

export async function setItemHidden(itemId: string, hidden: boolean) {
  const item = await prisma.item.findUniqueOrThrow({ where: { id: itemId } });
  if (item.status === 'REPLACED') throw new Error('置き換え済みの設問は変更できません');
  return prisma.item.update({ where: { id: itemId }, data: { status: hidden ? 'HIDDEN' : 'ACTIVE' } });
}

/**
 * Move every answer of `fromId` to `toId` and mark `fromId` replaced. An answer
 * the person already has for the target item (same response and entry) is
 * kept, and the old one is dropped, so nothing is ever duplicated.
 */
export async function replaceItem(fromId: string, toId: string) {
  if (fromId === toId) throw new Error('同じ設問には置き換えられません');
  return prisma.$transaction(async (tx) => {
    const [from, to] = await Promise.all([
      tx.item.findUniqueOrThrow({ where: { id: fromId } }),
      tx.item.findUniqueOrThrow({ where: { id: toId } }),
    ]);
    if (to.status === 'REPLACED') throw new Error('置き換え先の設問は既に置き換え済みです');
    const answers = await tx.answer.findMany({ where: { itemId: fromId } });
    let moved = 0;
    for (const a of answers) {
      const clash = await tx.answer.findUnique({
        where: { responseId_itemId_entry: { responseId: a.responseId, itemId: toId, entry: a.entry } },
      });
      if (clash) await tx.answer.delete({ where: { id: a.id } });
      else {
        await tx.answer.update({ where: { id: a.id }, data: { itemId: toId } });
        moved++;
      }
    }
    // Sets that asked the old item now ask the new one (unless they already do).
    const setLinks = await tx.questionSetItem.findMany({ where: { itemId: fromId } });
    for (const link of setLinks) {
      const has = await tx.questionSetItem.findUnique({ where: { setId_itemId: { setId: link.setId, itemId: toId } } });
      await tx.questionSetItem.delete({ where: { setId_itemId: { setId: link.setId, itemId: fromId } } });
      if (!has) {
        await tx.questionSetItem.create({
          data: {
            setId: link.setId,
            itemId: toId,
            order: link.order,
            isRequired: link.isRequired,
            showIf: (link.showIf ?? undefined) as never,
            formCodes: link.formCodes,
            formHeaders: link.formHeaders,
            wording: (link.wording ?? undefined) as never,
          },
        });
      }
    }
    // Conditions that depended on the old item now depend on the new one.
    const conditional = await tx.questionSetItem.findMany({ where: { showIf: { path: ['itemKey'], equals: from.key } } });
    for (const c of conditional) {
      await tx.questionSetItem.update({
        where: { setId_itemId: { setId: c.setId, itemId: c.itemId } },
        data: { showIf: { ...(c.showIf as object), itemKey: to.key } as never },
      });
    }
    // Skill sheet fields read the new item too.
    await tx.sheetFieldSource.updateMany({ where: { questionCode: from.key }, data: { questionCode: to.key } });
    await tx.item.update({ where: { id: fromId }, data: { status: 'REPLACED', replacedById: toId } });
    return { moved, from: from.titleJa, to: to.titleJa };
  });
}

export async function deleteItem(itemId: string) {
  const count = await prisma.answer.count({ where: { itemId } });
  if (count > 0) throw new Error(`この設問には回答が${count}件あるため削除できません。「非表示」か「置き換え」を使ってください。`);
  await prisma.$transaction([
    prisma.questionSetItem.deleteMany({ where: { itemId } }),
    prisma.item.delete({ where: { id: itemId } }),
  ]);
}

// ---------------------------------------------------------------------------
// Categories and subcategories
// ---------------------------------------------------------------------------

export async function createCategory(nameJa: string, nameEn?: string | null) {
  if (!nameJa.trim()) throw new Error('カテゴリの名前を入力してください');
  const last = await prisma.itemCategory.findFirst({ orderBy: { order: 'desc' } });
  return prisma.itemCategory.create({
    data: { key: `cat-${Date.now().toString(36)}`, nameJa: nameJa.trim(), nameEn: clean(nameEn), order: (last?.order ?? 0) + 10 },
  });
}

export async function renameCategory(id: string, nameJa: string, nameEn?: string | null) {
  if (!nameJa.trim()) throw new Error('カテゴリの名前を入力してください');
  return prisma.itemCategory.update({ where: { id }, data: { nameJa: nameJa.trim(), nameEn: clean(nameEn) } });
}

export async function deleteCategory(id: string) {
  const subs = await prisma.itemSubcategory.count({ where: { categoryId: id } });
  if (subs > 0) throw new Error('サブカテゴリがあるカテゴリは削除できません');
  await prisma.itemCategory.delete({ where: { id } });
}

export async function createSubcategory(categoryId: string, input: { nameJa: string; nameEn?: string | null; isRepeating: boolean; maxEntries?: number }) {
  if (!input.nameJa.trim()) throw new Error('サブカテゴリの名前を入力してください');
  const cat = await prisma.itemCategory.findUniqueOrThrow({ where: { id: categoryId } });
  const last = await prisma.itemSubcategory.findFirst({ where: { categoryId }, orderBy: { order: 'desc' } });
  const stem = `${cat.key}-s${Date.now().toString(36)}`;
  return prisma.itemSubcategory.create({
    data: {
      categoryId,
      key: input.isRepeating ? `${stem}-x` : stem,
      nameJa: input.nameJa.trim(),
      nameEn: clean(input.nameEn),
      isRepeating: input.isRepeating,
      maxEntries: Math.max(1, Math.min(20, input.maxEntries ?? 10)),
      order: (last?.order ?? 0) + 10,
    },
  });
}

export async function updateSubcategory(id: string, input: { nameJa: string; nameEn?: string | null; maxEntries?: number }) {
  if (!input.nameJa.trim()) throw new Error('サブカテゴリの名前を入力してください');
  return prisma.itemSubcategory.update({
    where: { id },
    data: {
      nameJa: input.nameJa.trim(),
      nameEn: clean(input.nameEn),
      ...(input.maxEntries ? { maxEntries: Math.max(1, Math.min(20, input.maxEntries)) } : {}),
    },
  });
}

export async function deleteSubcategory(id: string) {
  const items = await prisma.item.count({ where: { subcategoryId: id } });
  if (items > 0) throw new Error('設問があるサブカテゴリは削除できません');
  await prisma.$transaction([
    prisma.questionSetSubcategory.deleteMany({ where: { subcategoryId: id } }),
    prisma.itemSubcategory.delete({ where: { id } }),
  ]);
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export async function createGroup(nameJa: string, nameEn?: string | null) {
  const name = nameJa.trim();
  if (!name) throw new Error('グループの名前を入力してください');
  const all = await prisma.groupType.findMany();
  if (all.some((g) => groupNameKey(g.nameJa) === groupNameKey(name))) throw new Error(`「${name}」は既にあります`);
  return prisma.groupType.create({
    data: { key: `group_${Date.now().toString(36)}`, nameJa: name, nameEn: clean(nameEn), order: (all.length + 1) * 10 },
  });
}

export async function renameGroup(id: string, nameJa: string, nameEn?: string | null) {
  const name = nameJa.trim();
  if (!name) throw new Error('グループの名前を入力してください');
  const all = await prisma.groupType.findMany({ where: { id: { not: id } } });
  if (all.some((g) => groupNameKey(g.nameJa) === groupNameKey(name))) throw new Error(`「${name}」は既にあります`);
  return prisma.groupType.update({ where: { id }, data: { nameJa: name, nameEn: clean(nameEn) } });
}

export async function deleteGroup(id: string) {
  const sets = await prisma.questionSet.count({ where: { groupTypeId: id } });
  if (sets > 0) throw new Error('質問セットで使われているグループは削除できません');
  await prisma.groupType.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Question sets
// ---------------------------------------------------------------------------

/** A new set for a group: every active item of that group pre-ticked, in master order. */
export async function createSetForGroup(name: string, groupTypeId: string) {
  if (!name.trim()) throw new Error('質問セットの名前を入力してください');
  const items = await prisma.item.findMany({
    where: { status: 'ACTIVE', groupTypes: { some: { groupTypeId } } },
    orderBy: [{ subcategory: { category: { order: 'asc' } } }, { subcategory: { order: 'asc' } }, { order: 'asc' }],
    include: { subcategory: true },
  });
  return prisma.$transaction(async (tx) => {
    const hasDefault = (await tx.questionSet.count({ where: { isDefault: true } })) > 0;
    const set = await tx.questionSet.create({ data: { name: name.trim(), groupTypeId, isDefault: !hasDefault } });
    const subIds = [...new Set(items.map((i) => i.subcategoryId))];
    await tx.questionSetSubcategory.createMany({
      data: subIds.map((subcategoryId, i) => ({ setId: set.id, subcategoryId, order: (i + 1) * 10 })),
    });
    await tx.questionSetItem.createMany({
      data: items.map((item, i) => ({ setId: set.id, itemId: item.id, order: (i + 1) * 10 })),
    });
    return set;
  });
}

/** "Copy set": same items, order, required flags, conditions and wording. */
export async function copySet(setId: string, name: string) {
  if (!name.trim()) throw new Error('質問セットの名前を入力してください');
  const source = await prisma.questionSet.findUniqueOrThrow({
    where: { id: setId },
    include: { items: true, subcategories: true },
  });
  return prisma.$transaction(async (tx) => {
    const set = await tx.questionSet.create({
      data: { name: name.trim(), groupTypeId: source.groupTypeId, copiedFromId: source.id, deadline: source.deadline },
    });
    await tx.questionSetSubcategory.createMany({
      data: source.subcategories.map((s) => ({
        setId: set.id,
        subcategoryId: s.subcategoryId,
        order: s.order,
        showIf: (s.showIf ?? undefined) as never,
      })),
    });
    await tx.questionSetItem.createMany({
      data: source.items.map((i) => ({
        setId: set.id,
        itemId: i.itemId,
        order: i.order,
        isRequired: i.isRequired,
        showIf: (i.showIf ?? undefined) as never,
        formCodes: i.formCodes,
        formHeaders: i.formHeaders,
        wording: (i.wording ?? undefined) as never,
      })),
    });
    return set;
  });
}

export async function updateSet(
  setId: string,
  input: { name: string; groupTypeId: string; status: QuestionSetStatus; deadline: Date | null },
) {
  if (!input.name.trim()) throw new Error('質問セットの名前を入力してください');
  return prisma.questionSet.update({
    where: { id: setId },
    data: { name: input.name.trim(), groupTypeId: input.groupTypeId, status: input.status, deadline: input.deadline },
  });
}

export async function deleteSet(setId: string) {
  const set = await prisma.questionSet.findUniqueOrThrow({ where: { id: setId }, include: { _count: { select: { responses: true } } } });
  if (set._count.responses > 0) throw new Error('回答がある質問セットは削除できません');
  if (set.isDefault) throw new Error('回答ファイルの取り込み先のセットは削除できません。先に別のセットを取り込み先にしてください');
  await prisma.questionSet.delete({ where: { id: setId } });
}

/** Tick or untick an item in a set. Ticking adds it at the end of its subcategory's run. */
export async function setItemAsked(setId: string, itemId: string, asked: boolean) {
  if (!asked) {
    await prisma.questionSetItem.deleteMany({ where: { setId, itemId } });
    return;
  }
  const item = await prisma.item.findUniqueOrThrow({ where: { id: itemId } });
  const siblings = await prisma.questionSetItem.findMany({
    where: { setId, item: { subcategoryId: item.subcategoryId } },
    orderBy: { order: 'desc' },
    take: 1,
  });
  const last = siblings[0]?.order ?? (await prisma.questionSetItem.findFirst({ where: { setId }, orderBy: { order: 'desc' } }))?.order ?? 0;
  await prisma.$transaction([
    prisma.questionSetItem.upsert({
      where: { setId_itemId: { setId, itemId } },
      create: { setId, itemId, order: last + 5 },
      update: {},
    }),
    prisma.questionSetSubcategory.upsert({
      where: { setId_subcategoryId: { setId, subcategoryId: item.subcategoryId } },
      create: { setId, subcategoryId: item.subcategoryId, order: 9999 },
      update: {},
    }),
  ]);
  await renumberSet(setId);
}

export async function setItemRequired(setId: string, itemId: string, isRequired: boolean) {
  await prisma.questionSetItem.update({ where: { setId_itemId: { setId, itemId } }, data: { isRequired } });
}

export async function setItemCondition(setId: string, itemId: string, showIf: ShowIf) {
  await prisma.questionSetItem.update({
    where: { setId_itemId: { setId, itemId } },
    data: { showIf: showIf && showIf.anyOf.length > 0 ? (showIf as Prisma.InputJsonValue) : Prisma.DbNull },
  });
}

/** Move an item up or down within the set. */
export async function moveSetItem(setId: string, itemId: string, direction: -1 | 1) {
  const all = await prisma.questionSetItem.findMany({ where: { setId }, orderBy: { order: 'asc' } });
  const index = all.findIndex((i) => i.itemId === itemId);
  const other = all[index + direction];
  if (index < 0 || !other) return;
  const me = all[index]!;
  await prisma.$transaction([
    prisma.questionSetItem.update({ where: { setId_itemId: { setId, itemId: me.itemId } }, data: { order: other.order } }),
    prisma.questionSetItem.update({ where: { setId_itemId: { setId, itemId: other.itemId } }, data: { order: me.order } }),
  ]);
}

async function renumberSet(setId: string) {
  const all = await prisma.questionSetItem.findMany({ where: { setId }, orderBy: { order: 'asc' } });
  await prisma.$transaction(
    all.map((i, n) =>
      prisma.questionSetItem.update({ where: { setId_itemId: { setId, itemId: i.itemId } }, data: { order: (n + 1) * 10 } }),
    ),
  );
}

/** The question as a set asks it: the set's own wording, else the master's. */
export type AskedWording = {
  titleJa: string;
  titleEn: string | null;
  help: string | null;
  options: string[];
  allowOther: boolean;
  gridRows: string[];
  gridColumns: string[];
};

export function askedWording(
  item: { titleJa: string; titleEn: string | null; helpJa: string | null; helpEn: string | null; options: string[]; allowOther: boolean; gridRows: string[]; gridColumns: string[] },
  wording: unknown,
): AskedWording {
  const w = (wording ?? {}) as Partial<AskedWording>;
  const help = [item.helpJa, item.helpEn].filter(Boolean).join('\n') || null;
  return {
    titleJa: w.titleJa ?? item.titleJa,
    titleEn: w.titleEn ?? item.titleEn,
    help: w.help ?? help,
    options: w.options?.length ? w.options : item.options,
    allowOther: w.allowOther ?? item.allowOther,
    gridRows: w.gridRows?.length ? w.gridRows : item.gridRows,
    gridColumns: w.gridColumns?.length ? w.gridColumns : item.gridColumns,
  };
}
