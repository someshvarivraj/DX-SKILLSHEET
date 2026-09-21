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
export function cleanChoiceList(raw: string[] | string | null | undefined): string[] {
  if (raw === null || raw === undefined) return [];
  const list = Array.isArray(raw)
    ? raw
    : String(raw)
        .split(/[,、]\s*(?![^（]*）)/)
        .map((s) => s.trim());

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
