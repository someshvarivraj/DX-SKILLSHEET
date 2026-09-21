/**
 * What appears on the printed sheet.
 *
 * Kept separate from `model.ts` because that module opens a database
 * connection on import, and this rule is worth testing on its own.
 *
 * The rule is Sano-san's, and it is deliberately not "hide what is empty":
 *
 *   Every person keeps every field, so that a field can be filled in later —
 *   someone with no GitHub account today may create one next month, and if the
 *   field does not exist there is nowhere to put it. What prints is decided by
 *   the field's display checkbox, which an operator sets per person. The
 *   importer starts empty fields unticked, and the operator adjusts by hand.
 *
 * So a ticked-but-empty field still prints its label, and an unticked field
 * never prints even when it has content.
 */

export type PrintableField = {
  code: string;
  includeInPdf: boolean;
  isDisplayed: boolean;
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
  return field.isDisplayed;
}
