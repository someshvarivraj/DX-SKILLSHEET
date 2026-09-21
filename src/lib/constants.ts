/**
 * Values that more than one module needs to agree on.
 *
 * A literal that appears in two files is a literal that will eventually appear
 * differently in two files. Anything here is a decision, not a detail: change it
 * once and every screen follows.
 */

/**
 * Stands in for a recruit whose form response carried no name.
 *
 * Never fall back to the email address: 氏名 is printed on the customer-facing
 * skill sheet, and the client requires that a recruit's private address never
 * appears there.
 */
export const UNNAMED_PERSON = '（氏名未登録）';

/** Paper geometry, shared by the on-screen preview and the PDF. */
export const A4_WIDTH_MM = 210;
export const PAGE_MARGIN_MM = 14;
/** A4 width in CSS pixels, at the CSS reference resolution of 96dpi. */
export const A4_WIDTH_PX = (A4_WIDTH_MM * 96) / 25.4;

/** How many rows a list screen shows before paging. */
export const AUDIT_PAGE_SIZE = 50;
/** How many past versions of one field the history panel loads. */
export const FIELD_HISTORY_LIMIT = 30;
/** How many notes the editor loads for one person. */
export const MEMO_LIMIT = 50;

/** Preview zoom. `MAX_FIT` caps "fit to width" — see PreviewStage. */
export const ZOOM_STEPS = [0.5, 0.65, 0.8, 1, 1.25, 1.5, 2] as const;
export const ZOOM_MAX_FIT = 1.4;
export const ZOOM_MIN = 0.35;

/**
 * Answers that mean "nothing to report" on a 有無 question.
 *
 * Kept as one list because the same wordings arrive from several questions, and
 * a rule that recognises 「なし」 but not 「なし／None」 prints the English half
 * onto a Japanese sheet.
 */
export const NONE_ANSWERS = ['なし', 'none', 'n/a', '特になし', '該当なし'] as const;

/** The three states a sheet version moves through, in order. */
export const SHEET_STATUSES = ['DRAFT', 'AWAITING_REVIEW', 'FINAL'] as const;
export type SheetStatusName = (typeof SHEET_STATUSES)[number];
