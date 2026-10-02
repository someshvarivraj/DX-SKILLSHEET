/**
 * Move answers imported before the item master into it.
 *
 *   npm run items:convert-legacy
 *
 * Answer files used to be stored whole, keyed by the 2026 form's codes
 * (form_responses). Each one becomes a submitted response to the default
 * question set, one answer per item and entry — the same thing an import does
 * today. Run once, after `npm run db:seed` has built the item master; a row
 * already converted (same person, same import batch) is skipped, so running it
 * again does nothing.
 *
 * Every code must find its item: one that does not is listed and the script
 * stops before writing anything, rather than dropping the answer.
 */

import { prisma } from '../src/lib/db';
import { loadSetQuestions, saveImportedResponse, toItemAnswers } from '../src/lib/items/answers';

async function main() {
  const set = await prisma.questionSet.findFirst({ where: { isDefault: true } });
  if (!set) throw new Error('取り込み先の質問セットがない。先に npm run db:seed を実行すること');
  const { codes } = await loadSetQuestions(set.id);

  const legacy = await prisma.formResponse.findMany({ where: { personId: { not: null } }, orderBy: { createdAt: 'asc' } });
  if (legacy.length === 0) {
    console.log('移行する回答はない。');
    return;
  }

  const unknown = new Set<string>();
  for (const row of legacy) {
    for (const [code, value] of Object.entries(row.answers as Record<string, unknown>)) {
      if (!codes.has(code) && value !== null && String(value).trim() !== '') unknown.add(code);
    }
  }
  if (unknown.size > 0) {
    throw new Error(`質問セット「${set.name}」にない設問の回答がある: ${[...unknown].sort().join(', ')}`);
  }

  let converted = 0;
  for (const row of legacy) {
    const exists = await prisma.response.findFirst({
      where: { personId: row.personId!, importBatchId: row.importBatchId },
      select: { id: true },
    });
    if (exists) continue;
    const response = await saveImportedResponse({
      setId: set.id,
      personId: row.personId!,
      importBatchId: row.importBatchId,
      submittedAt: row.submittedAt,
      answers: toItemAnswers(row.answers as Record<string, unknown>, codes),
    });
    // Keep the original order: the newest import must stay the latest.
    await prisma.response.update({ where: { id: response.id }, data: { createdAt: row.createdAt } });
    converted++;
  }
  console.log(`${legacy.length}件中${converted}件を質問セット「${set.name}」の回答として移行した。`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
