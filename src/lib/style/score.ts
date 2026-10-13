/**
 * 学歴 › 成績, labelled so the reader knows what the figure is (Sano-san,
 * 2026-10-13): a bare 「6.8」 or 「91%」 meant nothing on the sheet.
 *
 *   "6.8"                                  → "CGPA: 6.8"
 *   "91%" / "91 percent"                   → "Percentage: 91%"
 *   "CGPA: 7.52 / Percentage: 75.20%"      → "CGPA: 7.52"   (one figure is enough)
 *   "cpi 8.1"                              → "CPI: 8.1"
 *
 * Anything else (a grade letter, a sentence) is returned unchanged. Applying
 * it twice gives the same result.
 */
export function formatAcademicScore(raw: string): string {
  const text = raw.normalize('NFKC').trim();
  if (!text) return '';

  // A grade-point figure wins: it is what the reader expects for a university.
  const gradePoint = text.match(/\b(CGPA|SGPA|CPI|GPA)\b\s*[:=：]?\s*(\d+(?:\.\d+)?)/i);
  if (gradePoint) return `${gradePoint[1].toUpperCase()}: ${gradePoint[2]}`;

  const percent =
    text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/i) ??
    text.match(/percentage\s*[:=：]?\s*(\d+(?:\.\d+)?)/i);
  if (percent) return `Percentage: ${percent[1]}%`;

  // A bare number: on a 10-point scale it is a CGPA, otherwise a percentage.
  const bare = text.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) {
    const n = Number(bare[1]);
    if (n <= 10) return `CGPA: ${bare[1]}`;
    if (n <= 100) return `Percentage: ${bare[1]}%`;
  }
  return text;
}
