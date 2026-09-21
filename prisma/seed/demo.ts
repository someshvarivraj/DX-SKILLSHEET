/**
 * Demo data, for a trial instance.
 *
 *   npm run db:demo
 *
 * Loads the two sample response files through the real importer, so the demo
 * sheets are built exactly the way a real one will be — same column matching,
 * same field rules, same generation path. Inventing rows directly in the
 * database would produce a demo that does not prove anything about the import.
 *
 * Never run this against an instance holding real recruits: the people it
 * creates are fictional and would sit alongside them in the same list.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { runImport } from '../../src/lib/import/run';
import { finaliseVersion } from '../../src/lib/sheet/version';

const prisma = new PrismaClient();

const FILES = ['data/sample-responses.csv', 'data/sample-responses-2.csv'];

async function main() {
  const revision = await prisma.formRevision.findFirst({ where: { isActive: true } });
  if (!revision) {
    throw new Error('有効なフォーム改訂がない。先に npm run db:seed を実行すること');
  }

  const operator = await prisma.user.findFirst({
    where: { isActive: true, role: { in: ['ADMIN', 'SALES'] } },
    orderBy: { createdAt: 'asc' },
  });
  if (!operator) {
    throw new Error(
      '操作者となる利用者がいない。SEED_ADMIN_EMAIL を設定して npm run db:seed を実行すること',
    );
  }

  for (const file of FILES) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) {
      console.warn(`  ! ${file} が見つからないため読み飛ばした`);
      continue;
    }
    const outcome = await runImport({
      fileName: file.split('/').pop() ?? file,
      buffer: readFileSync(path).buffer as ArrayBuffer,
      formRevisionId: revision.id,
      source: 'CSV',
      userId: operator.id,
      generateOnFirstImport: true,
    });
    console.log(
      `  ${file}: 新規${outcome.created}件、既存${outcome.updated}件を取り込んだ`,
    );
  }

  // One sheet is taken all the way to 確定 so that PDF export can be tried
  // immediately. The rest are left as drafts, which is what the 確認 → 確定
  // flow is meant to be tried on.
  const first = await prisma.person.findFirst({
    where: { isActive: true },
    orderBy: { fullNameEnglish: 'asc' },
    include: { skillSheet: true },
  });
  if (first?.skillSheet?.currentVersionId) {
    await prisma.fieldValue.updateMany({
      where: { versionId: first.skillSheet.currentVersionId },
      data: { isReviewed: true },
    });
    const result = await finaliseVersion(first.skillSheet.currentVersionId, operator.id);
    console.log(
      result.ok
        ? `  ${first.fullNameEnglish} の版を確定した（PDF出力を試せる）`
        : `  ! ${first.fullNameEnglish} を確定できなかった`,
    );
  }

  const count = await prisma.person.count({ where: { isActive: true } });
  console.log(`デモデータを投入した（対象者 ${count}名）`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
