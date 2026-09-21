/**
 * Measure how much AI usage one skill sheet actually costs.
 *
 *   npm run ai:measure
 *
 * This builds the real prompts — the same `buildMessages()` the application
 * calls, the same field definitions, and real answers parsed from the sample
 * response CSV — and counts what goes over the wire. Nothing here is a guess
 * about the application's behaviour; the only estimate is characters→tokens,
 * and that is done per script (Japanese and Latin tokenize very differently)
 * with the ratios stated below so the figures can be checked.
 *
 * Output: data/ai-usage.json, consumed by the cost report.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseCsv } from '../src/lib/import/parse';
import {
  matchColumns,
  isSystemColumn,
  rowToAnswers,
  type QuestionRef,
} from '../src/lib/import/match';
import { buildMessages } from '../src/lib/processing/prompt';
import { SECTIONS } from '../prisma/seed/sheet-definition';

const ROOT = path.join(__dirname, '..');

/**
 * Characters → tokens.
 *
 * Modern BPE vocabularies encode most kana and kanji as one token each, while
 * Latin text averages roughly four characters per token. Counting the two
 * scripts separately is far closer than any single blended ratio. Exact counts
 * differ a little per vendor, so the report also shows a ±20% band.
 */
const TOKENS_PER_CJK_CHAR = 1.0;
const TOKENS_PER_LATIN_CHAR = 0.25;

const CJK = /[　-〿぀-ゟ゠-ヿ一-鿿＀-￯]/;

function countChars(s: string): { cjk: number; latin: number; total: number } {
  let cjk = 0;
  for (const ch of s) if (CJK.test(ch)) cjk++;
  return { cjk, latin: [...s].length - cjk, total: [...s].length };
}

function toTokens(c: { cjk: number; latin: number }): number {
  return Math.round(c.cjk * TOKENS_PER_CJK_CHAR + c.latin * TOKENS_PER_LATIN_CHAR);
}

// ---------------------------------------------------------------- real answers
const catalogue = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'prisma/seed/form-questions-2026.json'), 'utf-8'),
) as { questions: Array<{ code: string; titleJa: string; titleEn: string | null; type: string; gridRows?: string[] }> };

const questions: QuestionRef[] = catalogue.questions.map((q) => ({
  code: q.code,
  fullTitle: `${q.code}. ${q.titleJa}`,
  titleJa: q.titleJa,
  titleEn: q.titleEn ?? null,
  type: q.type,
  gridRows: q.gridRows ?? [],
}));

const csv = fs.readFileSync(path.join(ROOT, 'data/sample-responses.csv'), 'utf-8');
const { headers, rows } = parseCsv(csv);
const matches = matchColumns(headers.filter((h) => !isSystemColumn(h)), questions);
const questionTypes = new Map(questions.map((q) => [q.code, q.type]));
/** Every sample person, so the report can show a range rather than one point. */
const people = rows.map((r) => rowToAnswers(r, matches, questionTypes));
let answers: Record<string, unknown> = people[0];

// ------------------------------------------------------- source text per field
/** Same rule the pipeline uses to turn source answers into prompt text. */
function sourceTextFor(codes: string[], prefix: string | null): string {
  let use = codes;
  if (prefix) {
    const direct = codes.filter((c) => c.startsWith(`${prefix}-`));
    if (direct.length > 0) use = direct;
  }
  return use
    .map((code) => {
      const resolved = code.includes('-x-') && prefix ? `${prefix}-${code.split('-x-')[1]}` : code;
      const value = answers[resolved];
      if (value === undefined || value === null || String(value).trim() === '') return null;
      const text = Array.isArray(value)
        ? (value as unknown[]).join(', ')
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value).trim();
      return `[${resolved}] ${text}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

/** How many records of each repeating kind a typical sheet carries. */
const RECORDS: Record<string, string[]> = {
  internships: ['E-1', 'E-2'],
  projects: ['F-1', 'F-2'],
};

type Row = {
  section: string;
  field: string;
  nameJa: string;
  record: string | null;
  inputTokens: number;
  outputTokens: number;
  inputChars: number;
};

function measurePerson(): Row[] {
const rowsOut: Row[] = [];

for (const section of SECTIONS) {
  const aiFields = section.fields.filter(
    (f) => f.processing === 'GENERATE' || f.processing === 'TRANSLATE',
  );
  if (aiFields.length === 0) continue;

  const prefixes = RECORDS[section.code] ?? [null];

  for (const prefix of prefixes) {
    for (const f of aiFields) {
      const sourceText = sourceTextFor(f.sources ?? [], prefix);
      if (!sourceText) continue; // §8.3 — an empty answer makes no AI call at all.

      const messages = buildMessages({
        fieldNameJa: f.nameJa,
        instruction: f.generationPrompt ?? null,
        sourceText,
        targetLengthMin: f.targetLengthMin ?? null,
        targetLengthMax: f.targetLengthMax ?? null,
        translateOnly: f.processing === 'TRANSLATE',
      });

      const joined = messages.map((m) => m.content).join('\n');
      const inChars = countChars(joined);

      // Output: the field's own upper length guide, which is what the prompt
      // instructs the model to respect. Japanese, so ~1 token per character.
      const outChars = f.targetLengthMax ?? 150;

      rowsOut.push({
        section: section.code,
        field: f.code,
        nameJa: f.nameJa,
        record: prefix,
        inputTokens: toTokens(inChars),
        outputTokens: Math.round(outChars * TOKENS_PER_CJK_CHAR),
        inputChars: inChars.total,
      });
    }
  }
}

  return rowsOut;
}

const perPerson = people.map((a) => {
  answers = a;
  return measurePerson();
});
const rowsOut = perPerson[0];

const totals = perPerson.map((rs) => ({
  calls: rs.length,
  input: rs.reduce((n, r) => n + r.inputTokens, 0),
  output: rs.reduce((n, r) => n + r.outputTokens, 0),
}));

const calls = Math.round(totals.reduce((n, t) => n + t.calls, 0) / totals.length);
const inputTokens = Math.round(totals.reduce((n, t) => n + t.input, 0) / totals.length);
const outputTokens = Math.round(totals.reduce((n, t) => n + t.output, 0) / totals.length);

const summary = {
  measuredFrom: `data/sample-responses.csv (${people.length} people, averaged)`,
  perPerson: totals,
  range: {
    calls: [Math.min(...totals.map((t) => t.calls)), Math.max(...totals.map((t) => t.calls))],
    input: [Math.min(...totals.map((t) => t.input)), Math.max(...totals.map((t) => t.input))],
    output: [Math.min(...totals.map((t) => t.output)), Math.max(...totals.map((t) => t.output))],
  },
  tokenRatios: { cjk: TOKENS_PER_CJK_CHAR, latin: TOKENS_PER_LATIN_CHAR },
  callsPerSheet: calls,
  inputTokensPerSheet: inputTokens,
  outputTokensPerSheet: outputTokens,
  totalTokensPerSheet: inputTokens + outputTokens,
  avgInputTokensPerCall: Math.round(inputTokens / calls),
  avgOutputTokensPerCall: Math.round(outputTokens / calls),
  bySection: Object.fromEntries(
    [...new Set(rowsOut.map((r) => r.section))].map((code) => {
      const rs = rowsOut.filter((r) => r.section === code);
      return [
        code,
        {
          calls: rs.length,
          inputTokens: rs.reduce((n, r) => n + r.inputTokens, 0),
          outputTokens: rs.reduce((n, r) => n + r.outputTokens, 0),
        },
      ];
    }),
  ),
  rows: rowsOut,
};

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, 'data/ai-usage.json'),
  JSON.stringify(summary, null, 2),
  'utf-8',
);

console.log('per person:', totals.map((t) => `${t.calls} calls / ${t.input} in / ${t.output} out`).join('  |  '));
console.log(`calls per sheet (avg)    ${calls}`);
console.log(`input tokens per sheet   ${inputTokens.toLocaleString()}`);
console.log(`output tokens per sheet  ${outputTokens.toLocaleString()}`);
console.log(`avg input per call       ${summary.avgInputTokensPerCall.toLocaleString()}`);
console.log(`avg output per call      ${summary.avgOutputTokensPerCall.toLocaleString()}`);
console.log('\nby section:');
for (const [code, s] of Object.entries(summary.bySection)) {
  const v = s as { calls: number; inputTokens: number; outputTokens: number };
  console.log(`  ${code.padEnd(20)} ${String(v.calls).padStart(3)} calls  ${String(v.inputTokens).padStart(7)} in  ${String(v.outputTokens).padStart(6)} out`);
}
console.log('\nwrote data/ai-usage.json');
