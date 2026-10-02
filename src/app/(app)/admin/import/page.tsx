import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { ImportForm } from '@/components/admin/import-form';
import { PageHeader } from '@/components/page-header';
import { MoraBot } from '@/components/morabot';
import { GenerationBanner } from '@/components/generation-progress';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const user = await requireUser();
  const t = await getT();
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
    <div className="space-y-5">
      {/* Kept for the next developer: import is always an explicit action
          (no automatic sync), the raw answers are stored untouched, and a
          second import never overwrites — it produces differences to review. */}
      <PageHeader
        title={t('回答の取り込み')}
        lead={t('Googleフォームの回答（CSVまたはExcel）を取り込みます。2回目以降は、変わった部分だけを確認してから反映できます。')}
      />
      {revision ? null : (
        <p className=" border border-accent-500/40 bg-accent-50 px-4 py-3 text-sm text-[#b03a22]">
          {t('取り込み先のフォームがまだ登録されていません。先に「項目定義」画面でGoogleフォームのスクリプトを取り込んでください。')}
        </p>
      )}

      <ImportForm />

      <GenerationBanner />

      <section className="card overflow-hidden">
        <h2 className="panel-head panel-title">{t('取り込み履歴')}</h2>
        {batches.length === 0 ? (
          <div className="flex items-center justify-center gap-3 px-4 py-6 text-sm text-ink-500">
            <MoraBot mood="explain" size={48} title="" />
            {t('履歴はまだありません。最初のファイルを上から取り込んでください。')}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table !min-w-[40rem]">
              <thead>
                <tr>
                  <th>{t('日時')}</th>
                  <th>{t('ファイル')}</th>
                  <th>{t('件数')}</th>
                  <th>{t('未割当の列')}</th>
                  <th>{t('実行者')}</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td className="text-ink-700">
                      {new Date(batch.createdAt).toLocaleString(t('ja-JP'))}
                    </td>
                    <td>{batch.fileName}</td>
                    <td>{batch.rowCount}</td>
                    <td className="text-sm text-ink-500">
                      {batch.unmappedHeaders.length > 0
                        ? t('{n}件', { n: batch.unmappedHeaders.length })
                        : t('なし')}
                    </td>
                    <td className="text-ink-700">{batch.importedBy?.displayName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
