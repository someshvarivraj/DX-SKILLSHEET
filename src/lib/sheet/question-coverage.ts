/**
 * Which form question codes already feed some field, given that a field's
 * source can be a wildcard: a repeating section's field stores one code like
 * "E-x-6" to mean "this record's own instance of E-1-6 / E-2-6 / …", not one
 * concrete code per record.
 *
 * Shared by the "未割当の設問" panel on the field-definition screen and the
 * Google Form import (form-import-actions.ts), which both need to answer the
 * same question: does this question code already have a field, accounting
 * for wildcards?
 */
export function expandSourceCodes(rawCodes: Iterable<string>): Set<string> {
  const expanded = new Set(rawCodes);
  for (const code of expanded) {
    if (!code.includes('-x-')) continue;
    const [head, tail] = code.split('-x-');
    for (const index of [1, 2, 3, 4, 5]) {
      expanded.add(`${head}-${index}-${tail}`);
    }
  }
  return expanded;
}
