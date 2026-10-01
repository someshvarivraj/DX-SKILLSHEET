/**
 * A GRID value — e.g. the JLPT 各スコア field — is a list of labelled rows.
 *
 * It is stored twice: as `valueJson` ([{ row, value }], what the printed sheet
 * draws as a small table) and as `valueJa` ("ラベル：値" lines, what search,
 * history and the plain-text views use). These helpers convert between the two
 * so both always say the same thing.
 */

export type GridRow = { row: string; value: string };

/** Rows from "ラベル：値" lines. A line without a colon becomes a row with no label. */
export function parseGridText(text: string): GridRow[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const at = line.search(/[：:]/);
      return at === -1
        ? { row: '', value: line }
        : { row: line.slice(0, at).trim(), value: line.slice(at + 1).trim() };
    });
}

/** "ラベル：値" lines from rows; a row whose value is blank is left out. */
export function composeGridText(rows: GridRow[]): string {
  return rows
    .filter((r) => r.value.trim() !== '')
    .map((r) => (r.row ? `${r.row}：${r.value.trim()}` : r.value.trim()))
    .join('\n');
}

/** The rows of a stored value: the structured copy if there is one, else the text. */
export function gridRowsOf(valueJson: unknown, valueJa: string): GridRow[] {
  if (Array.isArray(valueJson)) {
    return valueJson
      .filter((r): r is GridRow => r && typeof r === 'object' && 'row' in r && 'value' in r)
      .map((r) => ({ row: String(r.row), value: String(r.value ?? '') }));
  }
  return parseGridText(valueJa);
}
