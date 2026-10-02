/**
 * Seed: initial configuration only.
 *
 * Everything written here is editable from the admin screens afterwards. The
 * seed is idempotent, so it can be re-run after a schema change without losing
 * operator edits (existing rows are updated, not replaced).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient, type GlossaryCategory } from '@prisma/client';
import { SECTIONS } from './sheet-definition';
import { hashPassword } from '../../src/lib/auth/crypto';
import { planFromGs } from '../../src/lib/items/gs-plan';
import { applyGsPlan } from '../../src/lib/items/gs-apply';
import { repairItemMaster } from '../../src/lib/items/repair';

const prisma = new PrismaClient();

/**
 * The item master and the first question set, built from the 2026 form's .gs
 * exactly as an upload on the 設問マスタ screen would build them. Skipped once
 * any question set exists: after that the master is maintained on screen.
 */
async function seedItemMaster() {
  if ((await prisma.questionSet.count()) > 0) {
    console.log('  質問セットが既にあるため、設問マスタの初期登録は行わない');
    return;
  }
  const path = resolve(process.cwd(), 'data/create_iit_form_2026.gs');
  if (!existsSync(path)) {
    console.warn('! data/create_iit_form_2026.gs が見つからないため、設問マスタを登録していない');
    return;
  }
  const group = await prisma.groupType.upsert({
    where: { key: 'india_new_grad' },
    create: { key: 'india_new_grad', nameJa: 'インド新卒', nameEn: 'Indian new graduate', order: 10 },
    update: {},
  });
  const plan = planFromGs(readFileSync(path, 'utf8'));
  const result = await applyGsPlan({
    plan,
    setName: '2026 インド新卒',
    groupTypeId: group.id,
    sourceFile: 'create_iit_form_2026.gs',
    userId: null,
  });
  console.log(`  設問マスタに ${result.createdItems} 件を登録し、質問セット「2026 インド新卒」を作成した`);
}

async function seedDefinition() {
  for (const section of SECTIONS) {
    const created = await prisma.sheetSection.upsert({
      where: { code: section.code },
      create: {
        code: section.code,
        nameJa: section.nameJa,
        nameEn: section.nameEn,
        order: section.order,
        kind: section.kind,
        document: section.document ?? 'SKILL_SHEET',
        recordKind: section.recordKind ?? null,
        isVisible: section.isVisible ?? true,
        hideWhenEmpty: section.hideWhenEmpty ?? false,
        maxDisplayed: section.maxDisplayed ?? 3,
        description: section.description,
      },
      update: {
        nameJa: section.nameJa,
        nameEn: section.nameEn,
        order: section.order,
        kind: section.kind,
        // Which document a section prints on is a definition decision, so a
        // re-seed re-applies it rather than leaving an old value in place.
        document: section.document ?? 'SKILL_SHEET',
        recordKind: section.recordKind ?? null,
        maxDisplayed: section.maxDisplayed ?? 3,
        description: section.description,
      },
    });

    for (const field of section.fields) {
      const savedField = await prisma.sheetField.upsert({
        where: { code: field.code },
        create: {
          sectionId: created.id,
          code: field.code,
          nameJa: field.nameJa,
          nameEn: field.nameEn,
          order: field.order,
          processing: field.processing,
          editing: field.editing ?? 'MANUAL_ONLY',
          valueType: field.valueType ?? 'STRING',
          includeInPdf: field.includeInPdf ?? true,
          displayToggle: field.displayToggle ?? false,
          isRequired: field.isRequired ?? false,
          generationPrompt: field.generationPrompt,
          targetLengthMin: field.targetLengthMin,
          targetLengthMax: field.targetLengthMax,
          glossaryCategory: (field.glossaryCategory as GlossaryCategory) ?? null,
          ruleKey: field.ruleKey,
          helpText: field.helpText,
        },
        update: {
          sectionId: created.id,
          nameJa: field.nameJa,
          nameEn: field.nameEn,
          order: field.order,
          // processing / prompts are operator-editable: only set on creation.
        },
      });

      // Sources name items by key ("A-1-7", "E-x-6"), never by a form's code.
      for (const [index, code] of (field.sources ?? []).entries()) {
        await prisma.sheetFieldSource.upsert({
          where: {
            fieldId_questionCode: { fieldId: savedField.id, questionCode: code },
          },
          create: { fieldId: savedField.id, questionCode: code, order: index },
          update: { order: index },
        });
      }
    }
  }

  const sectionCount = SECTIONS.length;
  const fieldCount = SECTIONS.reduce((n, s) => n + s.fields.length, 0);
  console.log(`  セクション ${sectionCount} 件、項目 ${fieldCount} 件を登録した`);

  await reconcileDefinition();
}

/**
 * Reconcile an existing database with the definition.
 *
 * Two things a plain upsert cannot do:
 *
 *  1. Remove what the definition no longer has. A field or section dropped on
 *     the client's instruction stays in the database otherwise, and keeps
 *     printing. Rows that hold no value are deleted; rows that do are reported
 *     rather than deleted, because a seed script must never destroy a person's
 *     data on its own.
 *
 *  2. Change `processing` or `ruleKey` on a field that already exists. Those
 *     are operator-editable from the admin screen, so the seed deliberately
 *     sets them only on creation (see the upsert above). When the definition
 *     and the database disagree, that is reported here so nobody has to
 *     discover it from a wrong PDF.
 */
async function reconcileDefinition() {
  const definedFields = new Map(
    SECTIONS.flatMap((s) => s.fields.map((f) => [f.code, f] as const)),
  );
  const definedSections = new Set(SECTIONS.map((s) => s.code));

  const stored = await prisma.sheetField.findMany({
    include: { _count: { select: { values: true } } },
  });

  for (const field of stored) {
    if (!definedFields.has(field.code)) {
      if (field._count.values === 0) {
        await prisma.sheetField.delete({ where: { id: field.id } });
        console.log(`  - 定義から削除された項目を削除した: ${field.code}`);
      } else {
        console.warn(
          `  ! ${field.code}（${field.nameJa}）は定義にないが値が${field._count.values}件ある。` +
            '管理画面で確認のうえ手動で削除すること',
        );
      }
      continue;
    }

    const defined = definedFields.get(field.code)!;
    if (field.processing !== defined.processing || (field.ruleKey ?? null) !== (defined.ruleKey ?? null)) {
      console.warn(
        `  ! ${field.code}（${field.nameJa}）の処理方法が定義と異なる: ` +
          `DB=${field.processing}/${field.ruleKey ?? '—'} 定義=${defined.processing}/${defined.ruleKey ?? '—'}。` +
          '既存項目の処理方法は管理画面で変更すること',
      );
    }
  }

  const storedSections = await prisma.sheetSection.findMany({
    include: { _count: { select: { fields: true } } },
  });
  for (const section of storedSections) {
    if (definedSections.has(section.code)) continue;
    if (section._count.fields === 0) {
      await prisma.sheetSection.delete({ where: { id: section.id } });
      console.log(`  - 定義から削除されたセクションを削除した: ${section.code}`);
    } else {
      console.warn(
        `  ! セクション ${section.code}（${section.nameJa}）は定義にないが項目が残っている`,
      );
    }
  }
}

async function seedGlossary() {
  const path = resolve(process.cwd(), 'prisma/seed/glossary.json');
  const data = JSON.parse(readFileSync(path, 'utf8')) as {
    entries: Array<{
      category: string;
      english: string;
      aliases?: string[];
      japanese: string;
      gloss?: string;
      region?: string;
      note?: string;
    }>;
  };

  for (const entry of data.entries) {
    await prisma.glossaryEntry.upsert({
      where: {
        category_english: {
          category: entry.category as GlossaryCategory,
          english: entry.english,
        },
      },
      create: {
        category: entry.category as GlossaryCategory,
        english: entry.english,
        aliases: entry.aliases ?? [],
        japanese: entry.japanese,
        gloss: entry.gloss,
        region: entry.region,
        note: entry.note,
      },
      update: {
        aliases: entry.aliases ?? [],
        japanese: entry.japanese,
        gloss: entry.gloss,
        region: entry.region,
        note: entry.note,
      },
    });
  }
  console.log(`  対訳辞書 ${data.entries.length} 件を登録した`);
}

async function seedUsers() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (adminEmail) {
    await prisma.user.upsert({
      where: { email: adminEmail.toLowerCase() },
      create: {
        email: adminEmail.toLowerCase(),
        displayName: process.env.SEED_ADMIN_NAME ?? '管理者',
        role: 'ADMIN',
      },
      update: { role: 'ADMIN', isActive: true },
    });
    console.log(`  管理者アカウント ${adminEmail} を登録した`);
  } else {
    console.log('  SEED_ADMIN_EMAIL が未設定のため管理者アカウントは作成していない');
  }

  const demoEmail = process.env.DEMO_ACCOUNT_EMAIL;
  const demoPassword = process.env.DEMO_ACCOUNT_PASSWORD;

  /**
   * The shared account signs in with a password instead of an emailed link.
   *
   * It exists so someone can be given the system to try without a mail server.
   * It is VIEWER unless DEMO_ACCOUNT_ROLE says otherwise — raise it only for a
   * trial on dummy data, and never on an instance holding real recruits: a
   * shared password is not an audit trail, and the log will attribute every
   * change to one account.
   */
  const demoRole = (process.env.DEMO_ACCOUNT_ROLE ?? 'VIEWER').toUpperCase();
  const allowedRoles = ['ADMIN', 'SALES', 'ENGINEER', 'VIEWER'];
  if (demoEmail && demoPassword) {
    if (!allowedRoles.includes(demoRole)) {
      throw new Error(`DEMO_ACCOUNT_ROLE が不正である: ${demoRole}`);
    }
    const label =
      demoRole === 'VIEWER' ? 'デモ利用者（閲覧のみ）' : `体験用アカウント（${demoRole}）`;
    await prisma.user.upsert({
      where: { email: demoEmail.toLowerCase() },
      create: {
        email: demoEmail.toLowerCase(),
        displayName: label,
        role: demoRole as 'ADMIN',
        passwordHash: await hashPassword(demoPassword),
      },
      update: {
        role: demoRole as 'ADMIN',
        displayName: label,
        passwordHash: await hashPassword(demoPassword),
        isActive: true,
      },
    });
    console.log(`  共有アカウント ${demoEmail} を登録した（${demoRole}）`);
    if (demoRole !== 'VIEWER') {
      console.warn(
        '  ! 共有アカウントに閲覧以外の権限を与えている。実データを入れる環境では VIEWER に戻すこと',
      );
    }
  }
}

async function main() {
  console.log('初期データを投入する...');
  await seedItemMaster();
  const repaired = await repairItemMaster();
  if (repaired.titles || repaired.wordings) {
    console.log(`  設問マスタを修正した（タイトル${repaired.titles}件、質問セットの文言${repaired.wordings}件）`);
  }
  await seedDefinition();
  await seedGlossary();
  await seedUsers();
  console.log('完了。');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
