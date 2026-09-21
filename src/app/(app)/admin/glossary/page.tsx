import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { GlossaryManager } from '@/components/admin/glossary-manager';

export const dynamic = 'force-dynamic';

export default async function GlossaryPage() {
  const user = await requireUser();
  if (!can(user, 'glossary.manage')) notFound();

  const entries = await prisma.glossaryEntry.findMany({
    where: { isActive: true },
    orderBy: [{ category: 'asc' }, { english: 'asc' }],
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">対訳辞書</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-500">
          自由記述で書かれた専攻名・出身地・使用技術は、AIに都度翻訳させると表記がぶれます。
          この表を参照して機械的に置き換えるため、同じ語は必ず同じ日本語になります。
          新しい専攻やツールが出てきたときは、開発者を介さずここから追加してください。
          「初出時の補足」は、本文で最初にその用語が出てきたときに括弧書きで添える説明文です。
        </p>
      </div>
      <GlossaryManager entries={entries} />
    </div>
  );
}
