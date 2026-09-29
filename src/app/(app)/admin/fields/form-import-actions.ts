'use server';

import { revalidatePath } from 'next/cache';
import type { QuestionType, ValueType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { recordAudit } from '@/lib/audit';
import {
  cleanSectionLabel,
  toCatalogue,
  type ParsedForm,
  type ParsedQuestion,
} from '@/lib/form/parse-apps-script';
import { expandSourceCodes } from '@/lib/sheet/question-coverage';
import { generateUniqueCode } from '@/lib/sheet/generate-code';

/**
 * In-app replacement for `npm run form:parse` + `npm run db:seed`'s
 * seedFormRevision step, and — since 2026-09-29 — for the manual "add each
 * field by hand" step too. Sano-san's review: on first import there is no
 * existing definition to preserve, so a question with nowhere to go should
 * just get one automatically, not sit unassigned until someone retypes it
 * into an add-field form. Reviewing and reorganising after the fact (renaming,
 * moving between sections, changing how a field is processed) is still done
 * from this same screen, same as any other field.
 *
 * What stays untouched on import: any question code that already feeds some
 * field — including through a repeating section's wildcard source ("E-x-6"
 * covers E-1-6, E-2-6, …; see expandSourceCodes) — is left exactly as it is.
 * Only a genuinely new question gets a new field, grouped into a new section
 * named after the .gs script's own page-break heading for it. That section is
 * plain (a fresh, single-instance one) even where the source form's heading
 * describes something naturally repeating (multiple internships, etc.) —
 * turning a set of flat questions into a proper repeating section (with
 * per-record grouping) is a structural decision this does not attempt;
 * that still goes through the normal add-section/add-field screen, and the
 * server actions there have no other way to create a REPEATING section either.
 */

async function guard() {
  const user = await requireUser();
  if (!can(user, 'definition.manage')) throw new Error('項目定義を変更する権限がない');
  return user;
}

export type FormImportState = {
  step: 'idle' | 'preview' | 'done';
  catalogue?: ParsedForm;
  /** Question codes this revision doesn't have yet — new since last import, if any. */
  newCodes?: string[];
  /** Question codes already known under this revision code — will be updated in place. */
  knownCodeCount?: number;
  /** Of `newCodes`, how many have no field anywhere yet and would get one created. */
  toCreateCount?: number;
  message?: string;
  error?: string;
};

async function readGsFile(formData: FormData): Promise<{ fileName: string; text: string }> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('.gs ファイルを選択してください');
  }
  return { fileName: file.name, text: await file.text() };
}

function defaultRevisionCode(fileName: string): string {
  return fileName.match(/(\d{4})/)?.[1] ?? String(new Date().getFullYear());
}

function parse(text: string, revisionCode: string, fileName: string): ParsedForm {
  const catalogue = toCatalogue(text, revisionCode, fileName);
  if (catalogue.questions.length === 0) {
    throw new Error(
      '設問が1件も見つからなかった。createForm() を定義した正しい.gsファイルか確認すること。',
    );
  }
  return catalogue;
}

async function questionsNeedingAField(catalogue: ParsedForm): Promise<ParsedQuestion[]> {
  const sources = await prisma.sheetFieldSource.findMany({ select: { questionCode: true } });
  const covered = expandSourceCodes(sources.map((s) => s.questionCode));
  return catalogue.questions.filter((q) => !covered.has(q.code));
}

const VALUE_TYPE_BY_QUESTION_TYPE: Record<ParsedQuestion['type'], ValueType> = {
  TEXT: 'STRING',
  PARAGRAPH: 'TEXT',
  RADIO: 'STRING',
  CHECKBOX: 'STRING_LIST',
  LIST: 'STRING',
  GRID: 'GRID',
  DATE: 'DATE',
  SCALE: 'NUMBER',
  UNKNOWN: 'STRING',
};

/** Reads the file and shows what would be imported — nothing is saved yet. */
export async function previewFormScriptAction(
  _prev: FormImportState,
  formData: FormData,
): Promise<FormImportState> {
  try {
    await guard();
    const { fileName, text } = await readGsFile(formData);
    const revisionCode =
      String(formData.get('revisionCode') ?? '').trim() || defaultRevisionCode(fileName);
    const catalogue = parse(text, revisionCode, fileName);

    const existing = await prisma.formQuestion.findMany({
      where: { formRevision: { code: revisionCode } },
      select: { code: true },
    });
    const knownCodes = new Set(existing.map((q) => q.code));
    const newCodes = catalogue.questions
      .filter((q) => !knownCodes.has(q.code))
      .map((q) => q.code);
    const toCreate = await questionsNeedingAField(catalogue);

    return {
      step: 'preview',
      catalogue,
      newCodes,
      knownCodeCount: catalogue.questions.length - newCodes.length,
      toCreateCount: toCreate.length,
    };
  } catch (e) {
    return { step: 'idle', error: e instanceof Error ? e.message : '解析に失敗した' };
  }
}

/**
 * Parses the same file again, writes the revision + questions, then creates
 * a field (grouped into a new section per .gs page-break heading) for every
 * question that has nowhere to go yet.
 */
export async function importFormScriptAction(
  _prev: FormImportState,
  formData: FormData,
): Promise<FormImportState> {
  try {
    const user = await guard();
    const { fileName, text } = await readGsFile(formData);
    const revisionCode =
      String(formData.get('revisionCode') ?? '').trim() || defaultRevisionCode(fileName);
    const catalogue = parse(text, revisionCode, fileName);
    const needsField = await questionsNeedingAField(catalogue);

    const { revision, createdSections, createdFields } = await prisma.$transaction(
      async (tx) => {
      // Only one revision is ever active at a time — the 取り込み screen
      // picks it with `findFirst({ where: { isActive: true } })`, so any
      // other revision must be deactivated when a new one comes in.
      await tx.formRevision.updateMany({
        where: { code: { not: revisionCode } },
        data: { isActive: false },
      });
      const rev = await tx.formRevision.upsert({
        where: { code: revisionCode },
        create: {
          code: revisionCode,
          name: `${revisionCode}年度 IITアンケート`,
          sourceFile: fileName,
          isActive: true,
        },
        update: { sourceFile: fileName, isActive: true },
      });

      for (const q of catalogue.questions) {
        const data = {
          titleJa: q.titleJa,
          titleEn: q.titleEn,
          helpText: q.helpText,
          type: q.type as QuestionType,
          sectionLabel: q.sectionLabel,
          options: q.options,
          gridRows: q.gridRows,
          gridColumns: q.gridColumns,
          responseHeader: q.fullTitle,
          isRequired: q.isRequired,
          order: q.order,
        };
        await tx.formQuestion.upsert({
          where: { formRevisionId_code: { formRevisionId: rev.id, code: q.code } },
          create: { formRevisionId: rev.id, code: q.code, ...data },
          update: data,
        });
      }

      // Group the still-unassigned questions by the .gs script's own
      // page-break heading, in the order they first appear, and give each
      // group a fresh section.
      const byLabel = new Map<string, ParsedQuestion[]>();
      for (const q of needsField) {
        const key = q.sectionLabel ?? '__none__';
        (byLabel.get(key) ?? byLabel.set(key, []).get(key)!).push(q);
      }

      const lastSection = await tx.sheetSection.findFirst({ orderBy: { order: 'desc' } });
      let sectionOrder = lastSection?.order ?? 0;
      let sectionsCreated = 0;
      let fieldsCreated = 0;

      for (const [label, groupQuestions] of byLabel) {
        const { ja, en } =
          label === '__none__'
            ? { ja: '未分類（自動取り込み）', en: null }
            : cleanSectionLabel(label);
        sectionOrder += 10;
        const sectionCode = await generateUniqueCode(
          'section',
          async (c) => (await tx.sheetSection.findUnique({ where: { code: c } })) !== null,
        );
        const section = await tx.sheetSection.create({
          data: { code: sectionCode, nameJa: ja || '未分類（自動取り込み）', nameEn: en, order: sectionOrder },
        });
        sectionsCreated += 1;

        let fieldOrder = 0;
        for (const q of groupQuestions) {
          fieldOrder += 10;
          const fieldCode = await generateUniqueCode(
            'field',
            async (c) => (await tx.sheetField.findUnique({ where: { code: c } })) !== null,
          );
          await tx.sheetField.create({
            data: {
              sectionId: section.id,
              code: fieldCode,
              nameJa: q.titleJa,
              nameEn: q.titleEn,
              order: fieldOrder,
              processing: 'COPY',
              editing: 'MANUAL_ONLY',
              valueType: VALUE_TYPE_BY_QUESTION_TYPE[q.type],
              isRequired: q.isRequired,
              sources: { create: [{ questionCode: q.code, order: 0 }] },
            },
          });
          fieldsCreated += 1;
        }
      }

        return { revision: rev, createdSections: sectionsCreated, createdFields: fieldsCreated };
      },
      // A first-time bootstrap import can create on the order of 100 fields,
      // each needing its own code-uniqueness check — comfortably past
      // Prisma's 5s default interactive-transaction timeout.
      { timeout: 60_000 },
    );

    await recordAudit({
      userId: user.id,
      action: 'definition.update',
      entityType: 'FormRevision',
      entityId: revision.id,
      summary:
        `Googleフォームのスクリプト「${fileName}」から設問${catalogue.questions.length}件を取り込んだ` +
        `（${revisionCode}年度）。新規セクション${createdSections}件・項目${createdFields}件を自動作成した`,
    });

    revalidatePath('/admin/fields');
    revalidatePath('/admin/import');
    revalidatePath('/people');

    return {
      step: 'done',
      message:
        createdFields > 0
          ? `${catalogue.questions.length}件の設問を取り込み、新しいセクション${createdSections}件に項目${createdFields}件を自動作成しました。内容を確認し、必要に応じて表示順や処理方法を調整してください。`
          : `${catalogue.questions.length}件の設問を取り込みました（新規に作成した項目はありません — すべて既存の項目で扱われています）。`,
    };
  } catch (e) {
    return { step: 'idle', error: e instanceof Error ? e.message : '取り込みに失敗した' };
  }
}
