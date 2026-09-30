import Link from 'next/link';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { STATUS_LABELS } from '@/lib/sheet/version';
import { matchesPersonQuery } from '@/lib/people-search';
import { PageHeader } from '@/components/page-header';
import { MoraBot } from '@/components/morabot';
import { GenerationBanner, GenerationRowBadge } from '@/components/generation-progress';

export const dynamic = 'force-dynamic';

const STATUS_CLASS: Record<string, string> = {
  DRAFT: 'badge-draft',
  AWAITING_REVIEW: 'badge-review',
  FINAL: 'badge-final',
};

const FILTERS = [
  { key: 'all', label: 'すべて' },
  { key: 'DRAFT', label: '下書き' },
  { key: 'AWAITING_REVIEW', label: '確認待ち' },
  { key: 'FINAL', label: '確定' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

/**
 * The list of people. Redesigned 2026-09-29: the three figure cards became
 * the status tabs above the list (each tab shows its count, and choosing one
 * filters the list), so the same numbers are there without a separate row of
 * boxes. A row opens that person's sheet.
 */
export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const query = (params.q ?? '').trim();
  const status: FilterKey = FILTERS.some((f) => f.key === params.status)
    ? (params.status as FilterKey)
    : 'all';
  // Hiding the menu item is not a permission check. An engineer or the
  // read-only demo account could type the address and read every recruit's
  // details, so the page itself refuses.
  if (!can(user, 'sheet.edit') && !can(user, 'sheet.export')) notFound();

  const people = await prisma.person.findMany({
    where: { isActive: true },
    orderBy: [{ cohort: 'desc' }, { fullNameEnglish: 'asc' }],
    include: {
      skillSheet: { include: { currentVersion: true } },
      jlptResults: { orderBy: [{ examYear: 'desc' }, { examMonth: 'desc' }], take: 1 },
    },
  });

  const unreviewedCounts = await prisma.fieldValue.groupBy({
    by: ['versionId'],
    // Non-blank values of fields still in use, not on a deleted record — the
    // same ones the editing screen counts, so the number here matches the one
    // on the person's own screen.
    where: {
      isReviewed: false,
      NOT: [{ valueJa: null }, { valueJa: '' }, { record: { deletedAt: { not: null } } }],
      field: { isActive: true },
    },
    _count: { _all: true },
  });
  const unreviewedByVersion = new Map(unreviewedCounts.map((c) => [c.versionId, c._count._all]));

  const statusOf = (p: (typeof people)[number]) => p.skillSheet?.currentVersion?.status ?? 'DRAFT';
  const searched = query ? people.filter((p) => matchesPersonQuery(p, query)) : people;
  const counts: Record<FilterKey, number> = {
    all: searched.length,
    DRAFT: searched.filter((p) => statusOf(p) === 'DRAFT').length,
    AWAITING_REVIEW: searched.filter((p) => statusOf(p) === 'AWAITING_REVIEW').length,
    FINAL: searched.filter((p) => statusOf(p) === 'FINAL').length,
  };
  const shown = status === 'all' ? searched : searched.filter((p) => statusOf(p) === status);

  const href = (next: { q?: string; status?: FilterKey }) => {
    const sp = new URLSearchParams();
    const q = next.q ?? query;
    const s = next.status ?? status;
    if (q) sp.set('q', q);
    if (s !== 'all') sp.set('status', s);
    return sp.size > 0 ? `/people?${sp}` : '/people';
  };

  return (
    <div className="rise">
      <PageHeader
        title="対象者一覧"
        lead="名前を押すと、その人のスキルシートを開きます。"
        actions={
          can(user, 'import.run') ? (
            <Link href="/admin/import" className="btn btn-primary">
              ＋ 回答を取り込む
            </Link>
          ) : null
        }
      />

      <GenerationBanner />

      {people.length === 0 ? (
        <div className="card flex flex-col items-center p-12 text-center">
          <MoraBot mood="explain" size={110} title="" />
          <p className="mt-4 font-bold text-ink-900">まだ対象者がいません。</p>
          <p className="mt-1 text-sm text-ink-500">
            Googleフォームの回答ファイルを取り込むと、ここに一覧で表示されます。
          </p>
          <Link href="/admin/import" className="btn btn-primary mt-5">
            ＋ 回答を取り込む
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-3">
            <nav className="filter-tabs border-0" aria-label="状態で絞り込む">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={href({ status: f.key })}
                  className="filter-tab"
                  aria-current={status === f.key ? 'true' : undefined}
                >
                  {f.label}
                  <span className="filter-tab-count tabular">{counts[f.key]}</span>
                </Link>
              ))}
            </nav>
            {/* A plain GET form: works without JavaScript, and the address
                (/people?q=...) can be bookmarked or shared. */}
            <form method="get" role="search" className="mb-2 flex items-center gap-2">
              {status !== 'all' ? <input type="hidden" name="status" value={status} /> : null}
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="名前・社員番号・メールで検索"
                aria-label="対象者を検索"
                className="input w-64"
              />
              <button type="submit" className="btn btn-secondary">
                検索
              </button>
              {query ? (
                <Link href={href({ q: '' })} className="btn btn-quiet">
                  クリア
                </Link>
              ) : null}
            </form>
          </div>

          {shown.length === 0 ? (
            <div className="flex flex-col items-center border-t border-ink-100 p-12 text-center">
              <MoraBot mood="think" size={90} title="" />
              <p className="mt-3 text-ink-700">
                {query ? `「${query}」に一致する対象者はいません。` : '該当する対象者はいません。'}
              </p>
              <Link href="/people" className="btn btn-secondary mt-4">
                すべて表示
              </Link>
            </div>
          ) : (
            <div className="table-scroll border-t border-ink-100">
              <table className="data-table !min-w-[44rem]">
                <thead>
                  <tr>
                    <th>氏名</th>
                    <th>期</th>
                    <th>日本語</th>
                    <th>状態</th>
                    <th>未確認</th>
                    <th className="!text-right">最終更新</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((person) => {
                    const version = person.skillSheet?.currentVersion;
                    const unreviewed = version ? (unreviewedByVersion.get(version.id) ?? 0) : 0;
                    const jlpt = person.jlptResults[0];
                    return (
                      <tr key={person.id} className="relative">
                        <td>
                          {/* The link covers the whole row (see the ::after
                              below), so anywhere on the row opens the sheet. */}
                          <Link
                            href={`/people/${person.id}`}
                            className="font-bold text-ink-900 after:absolute after:inset-0 hover:text-brand-500"
                          >
                            {person.fullNameKatakana ?? person.fullNameEnglish}
                          </Link>
                          <GenerationRowBadge personId={person.id} />
                          <div className="text-xs text-ink-500">{person.fullNameEnglish}</div>
                        </td>
                        <td className="tabular text-ink-700">{person.cohort ?? '—'}</td>
                        <td className="text-ink-700">{jlpt ? jlpt.level : '—'}</td>
                        <td>
                          {version ? (
                            <span className={`badge ${STATUS_CLASS[version.status]}`}>
                              {STATUS_LABELS[version.status]}
                            </span>
                          ) : (
                            <span className="badge badge-draft">未作成</span>
                          )}
                        </td>
                        <td>
                          {unreviewed > 0 ? (
                            <span className="badge badge-warn badge-plain">{unreviewed}項目</span>
                          ) : (
                            <span className="text-sm text-ink-400">—</span>
                          )}
                        </td>
                        <td className="tabular text-right text-sm text-ink-500">
                          {version ? new Date(version.updatedAt).toLocaleDateString('ja-JP') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
