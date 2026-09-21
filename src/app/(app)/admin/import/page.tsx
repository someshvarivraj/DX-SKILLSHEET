import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { ImportForm } from '@/components/admin/import-form';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const user = await requireUser();
  if (!can(user, 'import.run')) notFound();

  const [revision, batches] = await Promise.all([
    prisma.formRevision.findFirst({ where: { isActive: true } }),
    prisma.importBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { importedBy: { select: { displayName: true } } },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">アンケート回答の取り込み</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-500">
          Googleフォームの回答をCSVまたはXLSXで書き出し、このページから取り込みます。
          取り込みは担当者が明示的に実行する操作で、自動同期は行いません。
          取り込んだ回答は原本としてそのまま保存され、あとから書き換わることはありません。
          2回目以降の取り込みでは、既存の内容は自動で上書きされず、差分の確認対象になります。
        </p>
        {revision ? (
          <p className="mt-2 text-xs text-ink-700">
            対象フォーム: <strong>{revision.name}</strong>（{revision.code}）
          </p>
        ) : (
          <p className="mt-2 rounded-md bg-accent-50 px-3 py-2 text-xs text-[#b03a22]">
            有効なフォーム改訂が登録されていません。先に
            <code className="mx-1">npm run form:parse</code>
            と<code className="mx-1">npm run db:seed</code>を実行してください。
          </p>
        )}
      </div>

      <ImportForm />

      <section className="card overflow-hidden">
        <h2 className="border-b border-ink-100 bg-sand-50 px-4 py-2 text-sm font-semibold">
          取り込み履歴
        </h2>
        {batches.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-400">履歴はまだありません。</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white text-xs text-ink-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">日時</th>
                <th className="px-4 py-2 text-left font-medium">ファイル</th>
                <th className="px-4 py-2 text-left font-medium">件数</th>
                <th className="px-4 py-2 text-left font-medium">未割当の列</th>
                <th className="px-4 py-2 text-left font-medium">実行者</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {batches.map((batch) => (
                <tr key={batch.id}>
                  <td className="px-4 py-1.5 text-ink-700">
                    {new Date(batch.createdAt).toLocaleString('ja-JP')}
                  </td>
                  <td className="px-4 py-1.5">{batch.fileName}</td>
                  <td className="px-4 py-1.5">{batch.rowCount}</td>
                  <td className="px-4 py-1.5 text-xs text-draft-ink">
                    {batch.unmappedHeaders.length > 0
                      ? `${batch.unmappedHeaders.length}件`
                      : 'なし'}
                  </td>
                  <td className="px-4 py-1.5 text-ink-700">
                    {batch.importedBy?.displayName ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
