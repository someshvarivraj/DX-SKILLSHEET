import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { GlossaryManager } from '@/components/admin/glossary-manager';
import { PageHeader } from '@/components/page-header';

export const dynamic = 'force-dynamic';

export default async function GlossaryPage() {
  const user = await requireUser();
  if (!can(user, 'glossary.manage')) notFound();

  const entries = await prisma.glossaryEntry.findMany({
    where: { isActive: true },
    orderBy: [{ category: 'asc' }, { english: 'asc' }],
  });

  return (
    <div>
      {/* Why this exists (kept for the next developer, not the operator):
          free-text majors, places and tools translated by the AI each time
          come out spelled differently; this table replaces them mechanically
          so the same word is always the same Japanese. */}
      <PageHeader
        title="対訳辞書"
        lead="専攻名・地名・ツール名などの決まった日本語訳を登録します。登録した訳が常に使われます。"
      />
      <GlossaryManager entries={entries} />
    </div>
  );
}
