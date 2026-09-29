/**
 * `code` (SheetSection.code / SheetField.code) is an internal, unique slug —
 * a handful of built-in codes are read by name elsewhere (e.g. `full_name`,
 * `internships`), but for anything created here it means nothing beyond
 * "unique row identifier". Sano-san's review (2026-09-25, item 6): asking the
 * operator to invent an English code to create a section or field was pure
 * friction with no payoff for them, so it is generated here instead and
 * never shown as something to fill in. `exists` is injected so this stays
 * testable without a database.
 *
 * Shared by the field-definition screen's own add-section/add-field actions
 * and the Google Form import, which creates sections and fields the same way.
 */
export async function generateUniqueCode(
  prefix: 'section' | 'field',
  exists: (code: string) => Promise<boolean>,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
    if (!(await exists(code))) return code;
  }
  throw new Error('一意なコードを生成できなかった。もう一度試すこと。');
}
