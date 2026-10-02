/**
 * Rebuild every person's sheet from their stored form answers.
 *
 *   npm run sheets:regenerate              # everyone who has answers
 *   npm run sheets:regenerate -- <personId> [<personId> …]
 *
 * For when the working layer has been lost but the import layer has not —
 * e.g. the item definitions were deleted and re-created (deleting a section
 * deletes every value written into its fields), so the sheets are empty while
 * the stored answers (`responses`) are intact. Re-uploading the answer
 * file does not help there: a person who already has answers is treated as a
 * re-import and only gets a difference review, not a fresh generation.
 *
 * Runs the same generation as a first import (`generateAllSections`, with
 * `displayFromValue` so empty fields start unticked). Locked fields are
 * skipped, everything else is overwritten. One person at a time; each
 * person's fields go AI_CONCURRENCY at a time.
 */

import { prisma } from '../src/lib/db';
import { generateAllSections } from '../src/lib/sheet/fields';
import { getEditableVersion, getOrCreateSkillSheet } from '../src/lib/sheet/version';

async function main() {
  const ids = process.argv.slice(2);

  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) throw new Error('有効な管理者ユーザーがいない');

  const people = await prisma.person.findMany({
    where: { itemResponses: { some: { status: 'SUBMITTED' } }, ...(ids.length > 0 ? { id: { in: ids } } : {}) },
    orderBy: { createdAt: 'asc' },
    select: { id: true, fullNameEnglish: true },
  });
  if (people.length === 0) {
    console.log('回答が保存されている人がいない。何もしない。');
    return;
  }

  console.log(`${people.length}人のシートを作り直す（管理者: ${admin.email}）`);
  let failedPeople = 0;

  for (const [i, person] of people.entries()) {
    const label = `[${i + 1}/${people.length}] ${person.fullNameEnglish}`;
    const started = Date.now();
    try {
      const sheet = await getOrCreateSkillSheet(person.id);
      const version = await getEditableVersion(sheet.id, admin.id);
      let lastShown = -1;
      const outcome = await generateAllSections({
        versionId: version.id,
        personId: person.id,
        userId: admin.id,
        displayFromValue: true,
        onProgress: (done, total) => {
          const step = Math.floor((done / Math.max(total, 1)) * 10);
          if (step !== lastShown) {
            lastShown = step;
            console.log(`${label}: ${done}/${total}`);
          }
        },
      });
      const secs = Math.round((Date.now() - started) / 1000);
      console.log(
        `${label}: 完了 ${secs}秒 — 生成${outcome.generated}・スキップ${outcome.skipped}・失敗${outcome.failed}`,
      );
      for (const warning of outcome.warnings) console.log(`  ! ${warning}`);
    } catch (error) {
      failedPeople++;
      console.error(`${label}: 失敗 — ${(error as Error).message}`);
    }
  }

  if (failedPeople > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
