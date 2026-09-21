import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { AUDIT_PAGE_SIZE } from '@/lib/constants';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { AUDIT_LABELS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Spec §12.4 — logins, views, edits, finalisations and exports. */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, 'audit.view')) notFound();

  const { page } = await searchParams;
  // Number('abc') is NaN and Number('1e400') is Infinity; either reaches Prisma
  // as `skip` and throws, so the whole screen 500s on a mistyped address.
  const requested = Number(page ?? 1);
  const pageNo = Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : 1;
  const pageSize = AUDIT_PAGE_SIZE;

  const [logs, total, exports] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (pageNo - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { displayName: true, email: true } } },
    }),
    prisma.auditLog.count(),
    prisma.exportHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        exportedBy: { select: { displayName: true } },
        version: { include: { skillSheet: { include: { person: true } } } },
      },
    }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-ink-900">操作ログ</h1>

      <section className="card overflow-hidden">
        <h2 className="border-b border-ink-100 bg-sand-50 px-4 py-2 text-sm font-semibold">
          PDF出力履歴
        </h2>
        {exports.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-400">まだありません。</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-ink-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">日時</th>
                <th className="px-4 py-2 text-left font-medium">対象者</th>
                <th className="px-4 py-2 text-left font-medium">ファイル名</th>
                <th className="px-4 py-2 text-left font-medium">出力者</th>
                <th className="px-4 py-2 text-right font-medium">再ダウンロード</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {exports.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-1.5 text-ink-700">
                    {new Date(e.createdAt).toLocaleString('ja-JP')}
                  </td>
                  <td className="px-4 py-1.5">
                    {e.version.skillSheet.person.fullNameEnglish}
                  </td>
                  <td className="px-4 py-1.5 text-xs">{e.fileName}</td>
                  <td className="px-4 py-1.5 text-ink-700">
                    {e.exportedBy?.displayName ?? '—'}
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    <Link
                      href={`/api/files/${encodeURIComponent(e.storageKey)}`}
                      className="btn btn-secondary"
                    >
                      ダウンロード
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-ink-100 bg-sand-50 px-4 py-2 text-sm font-semibold">
          すべての操作（{total}件）
        </h2>
        <table className="w-full text-sm">
          <thead className="text-xs text-ink-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">日時</th>
              <th className="px-4 py-2 text-left font-medium">利用者</th>
              <th className="px-4 py-2 text-left font-medium">操作</th>
              <th className="px-4 py-2 text-left font-medium">内容</th>
              <th className="px-4 py-2 text-left font-medium">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="whitespace-nowrap px-4 py-1 text-xs text-ink-700">
                  {new Date(log.createdAt).toLocaleString('ja-JP')}
                </td>
                <td className="px-4 py-1 text-xs">{log.user?.displayName ?? '—'}</td>
                <td className="px-4 py-1 text-xs">{AUDIT_LABELS[log.action] ?? log.action}</td>
                <td className="px-4 py-1 text-xs text-ink-700">{log.summary ?? ''}</td>
                <td className="px-4 py-1 text-xs text-ink-400">{log.ip ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {total > pageSize ? (
          <div className="flex justify-between border-t border-ink-100 px-4 py-2 text-xs">
            {pageNo > 1 ? (
              <Link href={`/admin/audit?page=${pageNo - 1}`} className="text-brand-500 underline">
                前へ
              </Link>
            ) : (
              <span />
            )}
            <span className="text-ink-500">
              {pageNo} / {Math.ceil(total / pageSize)}
            </span>
            {pageNo * pageSize < total ? (
              <Link href={`/admin/audit?page=${pageNo + 1}`} className="text-brand-500 underline">
                次へ
              </Link>
            ) : (
              <span />
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
