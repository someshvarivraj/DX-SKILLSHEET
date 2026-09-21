/**
 * Matching response-sheet columns to form questions.
 *
 * Matching is by question text, not column position, so reordering the form
 * does not break the import. Any column that cannot be matched is reported as
 * an unassigned question rather than silently dropped (§5.3).
 */

export type QuestionRef = {
  code: string;
  fullTitle: string;
  titleJa: string;
  titleEn: string | null;
  type: string;
  gridRows: string[];
};

export type ColumnMatch = {
  header: string;
  code: string | null;
  /** For grid questions the column carries one row label in brackets. */
  gridRow?: string | null;
  confidence: 'code' | 'exact' | 'normalised' | 'prefix' | 'none';
};

/** Collapse whitespace and drop decoration so wording tweaks still match. */
export function normaliseHeader(h: string): string {
  return h
    .replace(/　/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[※＊*]/g, '')
    .replace(/[（(][^）)]*[）)]\s*$/, '')
    .trim()
    .toLowerCase();
}

/** "G-1-7. 専攻外... [機械専攻 → 土木]" -> row label "機械専攻 → 土木" */
export function splitGridSuffix(header: string): { base: string; row: string | null } {
  const m = header.match(/^(.*?)\s*\[(.+)\]\s*$/);
  if (!m) return { base: header, row: null };
  return { base: m[1].trim(), row: m[2].trim() };
}

const CODE_RE = /^([A-Z]-\d+-\d+(?:\([A-Z]\)|[A-Z])?)\s*[.．]/;

export function matchColumns(
  headers: string[],
  questions: QuestionRef[],
): ColumnMatch[] {
  const byCode = new Map(questions.map((q) => [q.code, q]));
  const byExact = new Map(questions.map((q) => [q.fullTitle.trim(), q]));
  const byNormalised = new Map(
    questions.map((q) => [normaliseHeader(q.fullTitle), q]),
  );
  const byJapanese = new Map(questions.map((q) => [normaliseHeader(q.titleJa), q]));

  return headers.map((header) => {
    const { base, row } = splitGridSuffix(header);

    // 1. The header starts with the question code — the most reliable signal.
    const codeMatch = base.match(CODE_RE);
    if (codeMatch && byCode.has(codeMatch[1])) {
      return { header, code: codeMatch[1], gridRow: row, confidence: 'code' };
    }

    // 2. Exact title match.
    const exact = byExact.get(base.trim());
    if (exact) return { header, code: exact.code, gridRow: row, confidence: 'exact' };

    // 3. Whitespace and decoration insensitive match.
    const norm = normaliseHeader(base);
    const normalised = byNormalised.get(norm) ?? byJapanese.get(norm);
    if (normalised) {
      return { header, code: normalised.code, gridRow: row, confidence: 'normalised' };
    }

    // 4. Prefix match, for headers truncated by the spreadsheet export.
    if (norm.length >= 12) {
      const prefix = questions.find((q) =>
        normaliseHeader(q.fullTitle).startsWith(norm.slice(0, 24)),
      );
      if (prefix) {
        return { header, code: prefix.code, gridRow: row, confidence: 'prefix' };
      }
    }

    return { header, code: null, gridRow: row, confidence: 'none' };
  });
}

/** Columns the importer handles itself rather than mapping to a question. */
export const SYSTEM_COLUMNS = [
  'タイムスタンプ',
  'timestamp',
  'メールアドレス',
  'email address',
  'email',
  'スコア',
  'score',
];

export function isSystemColumn(header: string): boolean {
  const h = normaliseHeader(header);
  return SYSTEM_COLUMNS.some((c) => h === c || h.startsWith(c));
}

/**
 * Turn one spreadsheet row into an answers object keyed by question code.
 * Multi-select answers become arrays; grid answers become { row: value }.
 */
export function rowToAnswers(
  row: Record<string, string>,
  matches: ColumnMatch[],
  questionTypes: Map<string, string>,
): Record<string, unknown> {
  const answers: Record<string, unknown> = {};

  for (const match of matches) {
    if (!match.code) continue;
    const raw = (row[match.header] ?? '').trim();
    if (!raw) continue;

    const type = questionTypes.get(match.code);

    if (type === 'GRID' && match.gridRow) {
      const current = (answers[match.code] as Record<string, string>) ?? {};
      current[match.gridRow] = raw;
      answers[match.code] = current;
      continue;
    }

    if (type === 'CHECKBOX') {
      // Google joins multi-select answers with ", " — split on commas that are
      // not inside full-width parentheses, which the option labels use.
      const items = splitMultiSelect(raw);
      const existing = (answers[match.code] as string[]) ?? [];
      answers[match.code] = [...existing, ...items];
      continue;
    }

    answers[match.code] = raw;
  }

  return answers;
}

export function splitMultiSelect(raw: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of raw) {
    if (ch === '（' || ch === '(') depth++;
    if (ch === '）' || ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out.filter(Boolean);
}
