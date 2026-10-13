/**
 * What appears on the printed sheet.
 *
 * Kept separate from `model.ts` because that module opens a database
 * connection on import, and this rule is worth testing on its own.
 *
 * The rule (2026-10-01; it replaces "printing follows the display checkbox,
 * not emptiness"):
 *
 *  - A REQUIRED field always prints — even empty, as its label with a blank
 *    to fill in — so the reader sees that the item exists and is missing.
 *  - Any other field prints only when it has a value and is ticked for
 *    display. Empty optional items no longer leave blank rows on the sheet.
 *  - A section with nothing left to print drops out by itself, which made the
 *    per-section "hide when empty" setting unnecessary.
 *
 * Not printing an empty field does not remove it: every person keeps every
 * field, so it can still be filled in later and will then print.
 *
 * `includeInPdf` and the per-recipient preset still apply to every field.
 *
 * Not asked (2026-10-06): a field built only from questions the person's
 * question set did not ask (JLPT for a Japanese candidate) does not print,
 * even when it is required — unless someone has typed a value into it.
 */

export type PrintableField = {
  code: string;
  includeInPdf: boolean;
  isDisplayed: boolean;
  /**
   * Whether the field has a "PDFに載せる／載せない" switch. Without one nobody
   * can change `isDisplayed`, so it is ignored: a field that was first written
   * empty (and so stored as not displayed) and filled in later must still
   * print — 日本語力について did not (Sano-san, 2026-10-13).
   */
  displayToggle?: boolean;
  isRequired: boolean;
  valueJa: string;
  notAsked?: boolean;
};

export type PrintOptions = {
  /** True when building the PDF; false for the on-screen editor preview. */
  forPdf: boolean;
  /** Field codes switched off for this recipient by the display preset. */
  hiddenFieldCodes: ReadonlySet<string>;
};

export function isFieldPrintable(field: PrintableField, opts: PrintOptions): boolean {
  if (opts.forPdf && !field.includeInPdf) return false;
  if (opts.hiddenFieldCodes.has(field.code)) return false;
  if (field.notAsked && field.valueJa.trim() === '') return false;
  if (field.isRequired) return true;
  const displayed = field.displayToggle === false ? true : field.isDisplayed;
  return displayed && field.valueJa.trim() !== '';
}
