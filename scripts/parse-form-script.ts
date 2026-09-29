/**
 * CLI wrapper around `src/lib/form/parse-apps-script.ts` — see that file for
 * why this exists and how the parsing works. This command remains for anyone
 * who prefers a local file to the in-app upload on the field-definition
 * screen (Googleフォームのスクリプトを取り込む), which does the same parsing
 * and writes straight to the database instead of a JSON file.
 *
 * Usage:
 *   npm run form:parse -- <path-to-.gs> [revision-code] [output-path]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { toCatalogue } from '../src/lib/form/parse-apps-script';

export {
  extractCode,
  splitTitle,
  parseAppsScript,
  toCatalogue,
  type ParsedForm,
  type ParsedQuestion,
} from '../src/lib/form/parse-apps-script';

// --- CLI -------------------------------------------------------------------
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  /parse-form-script\.(ts|js)$/.test(process.argv[1]);

if (isMain) {
  const [, , inputArg, revisionArg, outputArg] = process.argv;
  if (!inputArg) {
    console.error('Usage: npm run form:parse -- <path-to-.gs> [revision-code] [output-path]');
    process.exit(1);
  }
  const inputPath = resolve(inputArg);
  const revision = revisionArg ?? (inputPath.match(/(\d{4})/)?.[1] ?? 'unknown');
  const outputPath = resolve(outputArg ?? `prisma/seed/form-questions-${revision}.json`);

  const source = readFileSync(inputPath, 'utf8');
  const catalogue = toCatalogue(source, revision, inputPath.split('/').pop()!);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(catalogue, null, 2) + '\n', 'utf8');

  console.log(
    `Parsed ${catalogue.questions.length} questions from ${inputPath}\n` +
      `Revision: ${revision}\nWritten to: ${outputPath}`,
  );
  const byType = catalogue.questions.reduce<Record<string, number>>((acc, q) => {
    acc[q.type] = (acc[q.type] ?? 0) + 1;
    return acc;
  }, {});
  console.log('By type:', byType);
}
