/**
 * Choice-answer handling.  Specification §4.1.
 *
 * Google Form options are written bilingually, e.g.
 *     "A1. システムエンジニア（要件定義・設計）／System Engineer"
 * The skill sheet shows only the Japanese part, so the leading marker and the
 * English part are stripped.
 *
 * The naive "take everything before ／" is wrong in three real cases found in
 * create_iit_form_2026.gs:
 *     "Git／GitHub"                  — two tool names, not a translation pair
 *     "IIT Jodhpur／IITジョドプール"   — the Japanese is on the RIGHT
 *     "DSC／TGA（熱分析）／Thermal Analysis" — three segments
 * So the rule is: keep the side that contains Japanese; if both sides or
 * neither side contain Japanese, keep the string unchanged.
 */

import { hasJapanese } from './text';

/** Leading enumeration markers used in the form, e.g. "A1. ", "①". */
const LEADING_MARKER = /^(?:[A-G]\d{1,2}[.．]\s*|[①-⑳]\s*)/;

/** Options that mean "nothing applies" and should not be printed. */
const NONE_MARKERS = [
  '使用経験なし',
  '経験なし',
  'なし／None',
  '特になし',
  '受験していない',
  '取得していない',
  'Not certified',
  'None',
];

export function stripLeadingMarker(option: string): string {
  return option.replace(LEADING_MARKER, '').trim();
}

/** Return the Japanese half of a bilingual option string. */
export function japaneseSideOfOption(option: string): string {
  const s = stripLeadingMarker(option).trim();
  if (!s.includes('／')) return s;

  const parts = s.split('／');

  // Japanese on the left: find the longest head with Japanese and a tail without.
  for (let i = parts.length - 1; i >= 1; i--) {
    const head = parts.slice(0, i).join('／');
    const tail = parts.slice(i).join('／');
    if (hasJapanese(head) && !hasJapanese(tail)) return head.trim();
  }

  // Japanese on the right (university and similar lists).
  for (let i = 1; i < parts.length; i++) {
    const head = parts.slice(0, i).join('／');
    const tail = parts.slice(i).join('／');
    if (!hasJapanese(head) && hasJapanese(tail)) return tail.trim();
  }

  // Both or neither side is Japanese — it is not a translation pair.
  return s;
}

export function isNoneOption(option: string): boolean {
  const s = stripLeadingMarker(option).trim();
  if (!s) return true;
  return NONE_MARKERS.some((m) => s === m || s.startsWith(m));
}

/**
 * Convert a raw multi-select answer into the list printed on the sheet.
 * Filters "none" markers and de-duplicates while preserving order.
 */
/**
 * Split a list typed or exported as one string — "SQL;MySQL、Git, Python" —
 * at , 、 ; ； and line breaks, but never inside brackets: option labels such
 * as "Linux（Ubuntu, CentOS など）" keep their own commas.
 */
export function splitListText(text: string, separators = ',、;；\n'): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if ('（(「【'.includes(ch)) depth++;
    else if ('）)」】'.includes(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0 && separators.includes(ch)) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/**
 * A multi-select answer as Japanese items, ready to join with 「、」. Each
 * chosen option is one item, but an option's own text (an "Other" answer, or
 * an export that joined with semicolons) may hold several: "SQL;MySQL;GIS"
 * becomes three, so the sheet never shows a 「;」 between items (Sano-san's
 * review, 2026-10-08).
 */
export function cleanChoiceList(raw: string[] | string | null | undefined): string[] {
  if (raw === null || raw === undefined) return [];
  const list = Array.isArray(raw)
    ? raw.flatMap((item) => splitListText(String(item), ';；\n'))
    : splitListText(String(raw));

  const out: string[] = [];
  for (const item of list) {
    if (!item) continue;
    if (isNoneOption(item)) continue;
    const ja = japaneseSideOfOption(item);
    if (ja && !out.includes(ja)) out.push(ja);
  }
  return out;
}

/** Single-choice answer. */
export function cleanChoice(raw: string | null | undefined): string {
  if (!raw) return '';
  if (isNoneOption(raw)) return '';
  return japaneseSideOfOption(raw);
}

/**
 * Grid answers arrive as { "row label": "column label" }. Both sides are
 * bilingual option strings, so both are reduced to their Japanese half.
 */
export function cleanGrid(
  raw: Record<string, string> | null | undefined,
): Array<{ row: string; value: string }> {
  if (!raw) return [];
  return Object.entries(raw)
    .filter(([, v]) => Boolean(v))
    .map(([row, value]) => ({
      row: japaneseSideOfOption(row),
      value: japaneseSideOfOption(value),
    }));
}

/**
 * Free-text "no answer" — "N/A", "None", "-", "なし" typed into a details box.
 * Such an answer means there is nothing to report (§8.3), not content to print.
 */
const NO_ANSWER_TEXT = /^(?:n\/?a|na|none|nil|nothing|not applicable|no|-+|―|ー|なし|無し|特になし|該当なし)\.?$/i;

export function isNoAnswerText(value: string): boolean {
  return NO_ANSWER_TEXT.test(value.trim());
}

/**
 * Several links typed on one line ("github: https://… portfolio:https://…")
 * are put one to a line, each with its label. Text with fewer than two links
 * is returned unchanged.
 */
export function oneLinkPerLine(text: string): string {
  if ((text.match(/https?:\/\//g) ?? []).length < 2) return text;
  return text
    .replace(/(?<![:：])\s+(?=(?:[A-Za-z][\w .-]{0,30}?\s*[:：]\s*)?https?:\/\/)/g, '\n')
    .replace(/^([A-Za-z][\w .-]{0,30}?)\s*[:：]\s*(?=https?:\/\/)/gm, '$1: ');
}
