import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { FieldDefinitionTable } from '@/components/admin/field-definition-table';

export const dynamic = 'force-dynamic';

/**
 * §5.3 — the section and field definitions are edited here, not in code.
 * The screen also lists questions that no field consumes, so a change to next
 * year's form cannot be missed.
 */
export default async function FieldDefinitionPage() {
  const user = await requireUser();
  if (!can(user, 'definition.manage')) notFound();

  const [sections, revision] = await Promise.all([
    prisma.sheetSection.findMany({
      orderBy: { order: 'asc' },
      include: {
        fields: {
          orderBy: { order: 'asc' },
          include: { sources: { orderBy: { order: 'asc' } } },
        },
      },
    }),
    prisma.formRevision.findFirst({ where: { isActive: true } }),
  ]);

  // How many people have something entered in each field (in their current
  // version), so deleting a field can say how much entered data goes with it.
  // A repeating section holds one value per record, so values are grouped by
  // field and version first and then counted per field.
  const filledRows = await prisma.fieldValue.groupBy({
    by: ['fieldId', 'versionId'],
    where: { valueJa: { not: '' }, version: { currentFor: { isNot: null } } },
  });
  const filledByField = new Map<string, number>();
  for (const row of filledRows) {
    filledByField.set(row.fieldId, (filledByField.get(row.fieldId) ?? 0) + 1);
  }

  const questions = revision
    ? await prisma.formQuestion.findMany({
        where: { formRevisionId: revision.id },
        orderBy: { order: 'asc' },
      })
    : [];

  const usedCodes = new Set(
    sections.flatMap((s) => s.fields.flatMap((f) => f.sources.map((src) => src.questionCode))),
  );

  // "E-x-6" covers E-1-6 and E-2-6: expand the placeholders before comparing.
  const expanded = new Set(usedCodes);
  for (const code of usedCodes) {
    if (!code.includes('-x-')) continue;
    const [head, tail] = code.split('-x-');
    for (const index of [1, 2, 3, 4, 5]) {
      expanded.add(`${head}-${index}-${tail}`);
    }
  }

  const unassigned = questions.filter((q) => !expanded.has(q.code));

  const rows = sections.map((section) => ({
    id: section.id,
    code: section.code,
    nameJa: section.nameJa,
    nameEn: section.nameEn,
    order: section.order,
    kind: section.kind,
    isVisible: section.isVisible,
    hideWhenEmpty: section.hideWhenEmpty,
    maxDisplayed: section.maxDisplayed,
    description: section.description,
    fields: section.fields.map((f) => ({
      id: f.id,
      code: f.code,
      nameJa: f.nameJa,
      nameEn: f.nameEn,
      order: f.order,
      processing: f.processing,
      editing: f.editing,
      valueType: f.valueType,
      includeInPdf: f.includeInPdf,
      displayToggle: f.displayToggle,
      isRequired: f.isRequired,
      isActive: f.isActive,
      generationPrompt: f.generationPrompt,
      targetLengthMin: f.targetLengthMin,
      targetLengthMax: f.targetLengthMax,
      glossaryCategory: f.glossaryCategory,
      ruleKey: f.ruleKey,
      helpText: f.helpText,
      sourceCodes: f.sources.map((s) => s.questionCode),
      filledCount: filledByField.get(f.id) ?? 0,
    })),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">項目定義</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-500">
          どの設問がスキルシートのどの位置に入るかは、この画面の設定で決まります。
          来年フォームが変わったときは、ここに行を追加するか取得元の設問IDを直すだけで対応でき、
          プログラムの修正や再デプロイは必要ありません。生成プロンプトもここで調整できます。
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-700">
          <li>並び替え：行の左端をドラッグするか、↑↓ボタン</li>
          <li>表示・非表示：「表示」のスイッチ</li>
          <li>削除：ゴミ箱のボタン</li>
          <li>詳しい設定：行の右端の ＞</li>
        </ul>
      </div>

      {unassigned.length > 0 ? (
        <div className="card border-draft-line bg-draft-bg p-4">
          <h2 className="text-sm font-semibold text-draft-ink">
            未割当の設問（{unassigned.length}件）
          </h2>
          <p className="mt-1 text-xs text-draft-ink">
            フォームには存在するが、どの項目にも割り当てられていない設問です。
            スキルシートに載せる必要があれば、該当セクションに項目を追加して取得元に設定してください。
          </p>
          <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-0.5 text-xs text-draft-ink md:grid-cols-2">
            {unassigned.map((q) => (
              <li key={q.id}>
                <code className="font-semibold">{q.code}</code> {q.titleJa}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="card border-final-line bg-final-bg p-3 text-xs text-final-ink">
          フォームのすべての設問が項目に割り当てられています。
        </div>
      )}

      <FieldDefinitionTable
        sections={rows}
        questionCodes={questions.map((q) => q.code)}
      />
    </div>
  );
}
