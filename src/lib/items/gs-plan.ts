/**
 * Turn a Google Apps Script form definition (.gs) into the shape of the item
 * master: Category -> Subcategory -> Item, plus the question set it describes.
 *
 * Pure — no database. `gs-apply.ts` compares the plan with the stored master
 * and writes it.
 *
 * How the hierarchy is read from the script (design, 2026-10-02):
 *   - category    = the letter of the code              "C-2-6" -> "C"
 *   - subcategory = the first two parts                 "C-2-6" -> "C-2"
 *   - item        = the whole code                      "C-2-6"
 * A part asked more than once with the same questions (Internship part 1 / part
 * 2: E-1-x and E-2-x) is ONE repeating subcategory "E-x" whose items are
 * "E-x-1", "E-x-2", ...; each part becomes an entry (1, 2, ...).
 *
 * Branching: a choice built with createChoice(label, page) shows that page only
 * when the choice is picked, so every question on the page gets
 * showIf = { itemKey: <the choosing question>, anyOf: [labels leading there] }.
 */

import { cleanSectionLabel, extractCode, parseAppsScript, splitTitle, type Recorded } from '@/lib/form/parse-apps-script';
import type { ItemType } from '@prisma/client';

export type ShowIf = { itemKey: string; anyOf: string[] };

export type PlannedItem = {
  key: string;
  titleJa: string;
  titleEn: string | null;
  help: string | null;
  type: ItemType;
  options: string[];
  allowOther: boolean;
  gridRows: string[];
  gridColumns: string[];
  isRequired: boolean;
  /** One per entry: the code and the full question title in this form. */
  formCodes: string[];
  formHeaders: string[];
  showIf: ShowIf | null;
  /** Position in the form, for the set's order. */
  order: number;
};

export type PlannedSubcategory = {
  key: string;
  nameJa: string;
  nameEn: string | null;
  isRepeating: boolean;
  items: PlannedItem[];
};

export type PlannedCategory = {
  key: string;
  nameJa: string;
  nameEn: string | null;
  subcategories: PlannedSubcategory[];
};

export type GsPlan = {
  title: string | null;
  categories: PlannedCategory[];
  /** Every item, in form order. */
  items: PlannedItem[];
};

const TYPE_MAP: Record<Recorded['type'], ItemType> = {
  TEXT: 'TEXT',
  PARAGRAPH: 'PARAGRAPH',
  RADIO: 'RADIO',
  CHECKBOX: 'CHECKBOX',
  LIST: 'LIST',
  GRID: 'GRID',
  DATE: 'DATE',
  SCALE: 'NUMBER',
  UNKNOWN: 'TEXT',
};

type Question = { rec: Recorded; code: string; letter: string; group: string; rest: string; order: number };

/** "E-1-6" -> letter "E", group "E-1", rest "6"; "B-1-4-2" -> rest "4-2". */
function splitCode(code: string): { letter: string; group: string; rest: string } {
  const parts = code.split('-');
  return { letter: parts[0]!, group: `${parts[0]}-${parts[1]}`, rest: parts.slice(2).join('-') };
}

/** "E. インターン・就業経験 パート1／… Part 1" -> without the part number. */
function stripPartNumber(label: { ja: string; en: string | null }) {
  return {
    ja: label.ja.replace(/\s*パート\s*\d+\s*$/, '').trim(),
    en: label.en?.replace(/\s*Part\s*\d+\s*$/i, '').trim() || null,
  };
}

export function planFromGs(source: string): GsPlan {
  const { title, items } = parseAppsScript(source);

  // Section headings: "C. 言語能力／…" names category C, "B-1. 最終学歴の詳細／…"
  // names subcategory B-1.
  const headingFor = new Map<string, { ja: string; en: string | null }>();
  for (const rec of items) {
    if (rec.type !== 'UNKNOWN' || !rec.title) continue;
    const m = rec.title.trim().match(/^([A-Z](?:-\d+)?)[.．]/);
    if (m && !headingFor.has(m[1]!)) headingFor.set(m[1]!, cleanSectionLabel(rec.title));
  }

  const questions: Question[] = [];
  let order = 0;
  for (const rec of items) {
    if (rec.type === 'UNKNOWN') continue;
    const code = extractCode(rec.title);
    if (!code) continue; // disclaimers and other unnumbered questions
    questions.push({ rec, code, ...splitCode(code), order: order++ });
  }

  // Which page each choice leads to, so the questions on it can be conditional.
  const pageCondition = new Map<Recorded, { chooser: string; labels: string[] }>();
  for (const q of questions) {
    for (const target of q.rec.choiceTargets ?? []) {
      if (!target.page) continue;
      const cond = pageCondition.get(target.page) ?? { chooser: q.code, labels: [] };
      cond.labels.push(target.label);
      pageCondition.set(target.page, cond);
    }
  }

  // Repeating parts: groups of one letter that ask the same questions.
  const groupsByLetter = new Map<string, Map<string, Question[]>>();
  for (const q of questions) {
    const groups = groupsByLetter.get(q.letter) ?? new Map<string, Question[]>();
    groups.set(q.group, [...(groups.get(q.group) ?? []), q]);
    groupsByLetter.set(q.letter, groups);
  }
  const repeatingLetters = new Set<string>();
  for (const [letter, groups] of groupsByLetter) {
    if (groups.size < 2) continue;
    const signature = (qs: Question[]) => qs.map((q) => `${q.rest}|${splitTitle(q.rec.title).ja}`).join('\n');
    const all = [...groups.values()].map(signature);
    if (all.every((sig) => sig === all[0])) repeatingLetters.add(letter);
  }

  // Item key per code. Branching needs it before the items are built.
  const keyOf = (q: Question) => (repeatingLetters.has(q.letter) ? `${q.letter}-x-${q.rest}` : q.code);
  const keyByCode = new Map(questions.map((q) => [q.code, keyOf(q)]));

  const categories: PlannedCategory[] = [];
  const categoryByKey = new Map<string, PlannedCategory>();
  const subByKey = new Map<string, PlannedSubcategory>();
  const itemByKey = new Map<string, PlannedItem>();
  const ordered: PlannedItem[] = [];

  for (const q of questions) {
    let category = categoryByKey.get(q.letter);
    if (!category) {
      const label = stripPartNumber(headingFor.get(q.letter) ?? { ja: q.letter, en: null });
      category = { key: q.letter, nameJa: label.ja, nameEn: label.en, subcategories: [] };
      categoryByKey.set(q.letter, category);
      categories.push(category);
    }

    const repeating = repeatingLetters.has(q.letter);
    const subKey = repeating ? `${q.letter}-x` : q.group;
    let sub = subByKey.get(subKey);
    if (!sub) {
      const groupCount = groupsByLetter.get(q.letter)!.size;
      const named = headingFor.get(q.group);
      const label = repeating || groupCount === 1 || !named
        ? repeating || groupCount === 1
          ? { ja: category.nameJa, en: category.nameEn }
          : { ja: `${category.nameJa}（${q.group}）`, en: category.nameEn ? `${category.nameEn} (${q.group})` : null }
        : named;
      sub = { key: subKey, nameJa: label.ja, nameEn: label.en, isRepeating: repeating, items: [] };
      subByKey.set(subKey, sub);
      category.subcategories.push(sub);
    }

    const key = keyOf(q);
    const existing = itemByKey.get(key);
    if (existing) {
      // A later entry of a repeating part: only its code and header are new.
      existing.formCodes.push(q.code);
      existing.formHeaders.push(q.rec.title);
      continue;
    }

    const { ja, en } = splitTitle(q.rec.title);
    const cond = q.rec.page ? pageCondition.get(q.rec.page) : undefined;
    const item: PlannedItem = {
      key,
      titleJa: ja,
      titleEn: en,
      help: q.rec.help,
      type: TYPE_MAP[q.rec.type],
      options: q.rec.options,
      allowOther: Boolean(q.rec.allowOther),
      gridRows: q.rec.rows,
      gridColumns: q.rec.columns,
      isRequired: q.rec.required,
      formCodes: [q.code],
      formHeaders: [q.rec.title],
      showIf: cond ? { itemKey: keyByCode.get(cond.chooser)!, anyOf: cond.labels } : null,
      order: q.order,
    };
    itemByKey.set(key, item);
    sub.items.push(item);
    ordered.push(item);
  }

  return { title, categories, items: ordered };
}
