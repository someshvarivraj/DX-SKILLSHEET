/**
 * Free-text search on the people list.
 *
 * Operators type names the way they happen to remember them: "arjun",
 * "Arjun Reddy", "あるじゅん", "アルジュン", "レッディ・アルジュン", or the
 * employee number. All of those should find the same person, so both the query
 * and the searched text are folded to one form before comparing.
 */

export interface SearchablePerson {
  fullNameEnglish: string;
  fullNameKatakana: string | null;
  employeeNumber: string | null;
  email: string | null;
  cohort: string | null;
}

/**
 * NFKC (full-width → half-width, half-width kana → full-width), lower case,
 * hiragana → katakana, and drop spaces and name separators (・ and the like).
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[\s・･.,、。\-_]/g, '');
}

/** Every whitespace-separated term must match somewhere, in any order. */
export function matchesPersonQuery(person: SearchablePerson, query: string): boolean {
  const terms = query
    .split(/[\s　]+/)
    .map(normalizeSearchText)
    .filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = [
    person.fullNameEnglish,
    person.fullNameKatakana,
    person.employeeNumber,
    person.email,
    person.cohort,
  ]
    .filter((v): v is string => Boolean(v))
    .map(normalizeSearchText)
    .join('\n');

  return terms.every((term) => haystack.includes(term));
}
