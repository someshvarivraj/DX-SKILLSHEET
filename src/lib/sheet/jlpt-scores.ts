/**
 * JLPT scores entered on the editing screen (日本語能力 > 各スコア).
 *
 * The 2026 form asks only the level, so the section scores come from the
 * company's own records instead. Sano-san (2026-10-13) asked for them to be
 * entered as a table — level and one column per scored section, as on the
 * official result notice — rather than as one text box.
 *
 * The scores are stored on the person's JlptResult, which is what the rules and
 * the AI read for 取得資格と時期 and 日本語力について; the 各スコア field keeps a
 * text copy for the history and for anyone who chooses to print it.
 *
 * Pure: shared by the table on screen and the server. The database side is in
 * jlpt-scores-db.ts.
 */

import { isThreeSection, type JlptLevel } from '@/lib/rules/jlpt';

export const JLPT_LEVELS: JlptLevel[] = ['N1', 'N2', 'N3', 'N4', 'N5'];

export type ScoreInput = {
  level: JlptLevel;
  languageKnowledge: number | null;
  reading: number | null;
  languageAndReading: number | null;
  listening: number | null;
};

export type StoredScores = ScoreInput & { total: number | null };

/** The scored sections, in the order of the result notice. */
export const SCORE_COLUMNS = [
  { key: 'languageKnowledge', label: '言語知識（文字・語彙・文法）', max: 60, threeSection: true },
  { key: 'reading', label: '読解', max: 60, threeSection: true },
  { key: 'languageAndReading', label: '言語知識・読解', max: 120, threeSection: false },
  { key: 'listening', label: '聴解', max: 60, threeSection: null },
] as const;

export type ScoreKey = (typeof SCORE_COLUMNS)[number]['key'];

/** Whether a section is scored at this level (N1–N3 and N4–N5 differ). */
export function appliesTo(column: (typeof SCORE_COLUMNS)[number], level: JlptLevel): boolean {
  return column.threeSection === null || column.threeSection === isThreeSection(level);
}

/**
 * Drop the sections the level does not have and check the ranges. The total
 * is the sum of the sections once all of them are filled in; until then it is
 * unknown, so nothing is judged from a partial result.
 */
export function normaliseScores(input: ScoreInput): StoredScores | { error: string } {
  if (!JLPT_LEVELS.includes(input.level)) return { error: '級を選択すること' };
  const out: StoredScores = {
    level: input.level,
    languageKnowledge: null,
    reading: null,
    languageAndReading: null,
    listening: null,
    total: null,
  };
  let sum = 0;
  let complete = true;
  for (const column of SCORE_COLUMNS) {
    if (!appliesTo(column, input.level)) continue;
    const value = input[column.key];
    if (value === null || value === undefined) {
      complete = false;
      continue;
    }
    if (!Number.isInteger(value) || value < 0 || value > column.max) {
      return { error: `${column.label}は0〜${column.max}の整数で入力すること` };
    }
    out[column.key] = value;
    sum += value;
  }
  out.total = complete ? sum : null;
  return out;
}

/** The text copy kept in the 各スコア field, one score per line. */
export function scoreRows(scores: StoredScores): Array<{ row: string; value: string }> {
  const rows: Array<{ row: string; value: string }> = [];
  if (scores.total !== null) rows.push({ row: '総合点', value: `${scores.total}点（180点満点）` });
  for (const column of SCORE_COLUMNS) {
    const value = scores[column.key];
    if (value !== null) rows.push({ row: column.label, value: `${value}点（${column.max}点満点）` });
  }
  return rows;
}
