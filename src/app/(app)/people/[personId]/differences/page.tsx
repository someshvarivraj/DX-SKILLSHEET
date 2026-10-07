import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { can, canAccessPerson } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { loadImportDiffs } from '@/lib/sheet/import-diff';
import { PageHeader } from '@/components/page-header';
import { ImportDiffList } from '@/components/editor/import-diff-list';
import { MoraBot } from '@/components/morabot';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/**
 * 取り込みの差分 — spec §5.2. After answers are imported again (or submitted
 * again on マイページ), every field whose answer has changed is listed with the
 * old and the new answer side by side, and the operator takes the new answer or
 * keeps the current value, field by field. Nothing changes until they choose.
 */
export default async function DifferencesPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const user = await requireUser();
  const t = await getT();
  if (!canAccessPerson(user, personId) || !can(user, 'sheet.edit') || user.role === 'ENGINEER') notFound();

  const person = await prisma.person.findUnique({ where: { id: personId } });
  if (!person) notFound();
  const diffs = await loadImportDiffs(personId);
  const name = person.fullNameKatakana ?? person.fullNameEnglish;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('取り込みの差分: {name}', { name })}
        lead={t('前回スキルシートを作ったときの回答と、新しく取り込んだ回答が違う項目です。項目ごとに、新しい回答を取り込むか、現在の値を維持するかを選んでください。選ぶまで、スキルシートは変わりません。')}
        actions={
          <Link href={`/people/${personId}`} className="btn btn-secondary">
            {t('編集画面に戻る')}
          </Link>
        }
      />
      {diffs.length === 0 ? (
        <div className="card flex items-center gap-4 p-6">
          <MoraBot mood="approved" size={64} title="" />
          <p className="text-sm text-ink-700">{t('新しい回答との差分はありません。スキルシートは最新の回答と一致しています。')}</p>
        </div>
      ) : (
        <ImportDiffList personId={personId} diffs={diffs} />
      )}
    </div>
  );
}
