import Link from 'next/link';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { STATUS_LABELS } from '@/lib/sheet/version';
import { matchesPersonQuery } from '@/lib/people-search';

export const dynamic = 'force-dynamic';

const STATUS_CLASS: Record<string, string> = {
  DRAFT: 'badge-draft',
  AWAITING_REVIEW: 'badge-review',
  FINAL: 'badge-final',
};

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const query = ((await searchParams).q ?? '').trim();
  // Hiding the nav link is not a permission check. An engineer or the read-only
  // demo account could type the address and read every recruit's name, employee
  // number, JLPT level and sheet status, with a link into each editor.
  if (!can(user, 'sheet.edit') && !can(user, 'sheet.export')) notFound();

  const people = await prisma.person.findMany({
    where: { isActive: true },
    orderBy: [{ cohort: 'desc' }, { fullNameEnglish: 'asc' }],
    include: {
      skillSheet: {
        include: {
          currentVersion: {
            include: { _count: { select: { values: true } } },
          },
        },
      },
      jlptResults: { orderBy: [{ examYear: 'desc' }, { examMonth: 'desc' }], take: 1 },
    },
  });

  const unreviewedCounts = await prisma.fieldValue.groupBy({
    by: ['versionId'],
    where: { isReviewed: false, NOT: { valueJa: null } },
    _count: { _all: true },
  });
  const unreviewedByVersion = new Map(
    unreviewedCounts.map((c) => [c.versionId, c._count._all]),
  );

  const totals = {
    all: people.length,
    final: people.filter((p) => p.skillSheet?.currentVersion?.status === 'FINAL').length,
    review: people.filter(
      (p) => p.skillSheet?.currentVersion?.status === 'AWAITING_REVIEW',
    ).length,
    unreviewed: people.reduce((n, p) => {
      const v = p.skillSheet?.currentVersion;
      return n + (v ? (unreviewedByVersion.get(v.id) ?? 0) : 0);
    }, 0),
  };

  // Filtered after the totals above, so the four figures always describe
  // everyone, not just the current search.
  const shown = query ? people.filter((p) => matchesPersonQuery(p, query)) : people;

  return (
    <div className="space-y-5 rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">対象者一覧</h1>
        <Link href="/admin/import" className="btn btn-primary">
          アンケート回答を取り込む
        </Link>
      </div>

      {/* The four numbers an operator opens this screen to find out. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="登録人数" value={`${totals.all}名`} tone="plain" />
        <Stat label="確認待ち" value={`${totals.review}件`} tone="review" />
        <Stat label="確定済み" value={`${totals.final}名`} tone="final" />
        <Stat
          label="未確認の項目"
          value={`${totals.unreviewed}項目`}
          tone={totals.unreviewed > 0 ? 'warn' : 'final'}
        />
      </div>

      {people.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-ink-500">まだ対象者がいません。</p>
          <Link href="/admin/import" className="btn btn-primary mt-4">
            アンケート回答を取り込む
          </Link>
        </div>
      ) : (
        <>
        {/* A plain GET form: works without JavaScript, and the URL
            (/people?q=...) can be bookmarked or shared. */}
        <form method="get" role="search" className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="氏名（英語・カタカナ・ひらがな）、社員番号、メールで検索"
            aria-label="対象者を検索"
            className="input w-full max-w-md"
          />
          <button type="submit" className="btn btn-secondary">
            検索
          </button>
          {query && (
            <>
              <Link href="/people" className="btn btn-quiet">
                クリア
              </Link>
              <span className="text-sm text-ink-500">
                {people.length}名中 {shown.length}名
              </span>
            </>
          )}
        </form>

        {shown.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-sm text-ink-500">
              「{query}」に一致する対象者はいません。
            </p>
            <Link href="/people" className="btn btn-secondary mt-4">
              すべて表示
            </Link>
          </div>
        ) : (
        <div className="card overflow-hidden">
          <div className="table-scroll">
            <table className="data-table">
            <thead>
              <tr>
                <th>氏名</th>
                <th>社員番号</th>
                <th>期</th>
                <th>日本語</th>
                <th>状態</th>
                <th>未確認</th>
                <th className="!text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((person) => {
                const version = person.skillSheet?.currentVersion;
                const unreviewed = version
                  ? (unreviewedByVersion.get(version.id) ?? 0)
                  : 0;
                const jlpt = person.jlptResults[0];
                return (
                  <tr key={person.id}>
                    <td>
                      <Link
                        href={`/people/${person.id}`}
                        className="font-semibold text-ink-900 hover:text-brand-500 hover:underline"
                      >
                        {person.fullNameKatakana ?? person.fullNameEnglish}
                      </Link>
                      <div className="text-xs text-ink-400">{person.fullNameEnglish}</div>
                    </td>
                    <td className="tabular text-ink-700">
                      {person.employeeNumber ?? <span className="text-ink-200">未設定</span>}
                    </td>
                    <td className="tabular text-ink-700">{person.cohort ?? '—'}</td>
                    <td className="text-ink-700">{jlpt ? `${jlpt.level}` : '—'}</td>
                    <td>
                      {version ? (
                        <span className={`badge ${STATUS_CLASS[version.status]}`}>
                          {STATUS_LABELS[version.status]}
                          <span className="font-normal opacity-70">
                            第{version.versionNo}版
                          </span>
                        </span>
                      ) : (
                        <span className="badge badge-draft">未作成</span>
                      )}
                    </td>
                    <td>
                      {unreviewed > 0 ? (
                        <span className="badge badge-warn">{unreviewed}項目</span>
                      ) : (
                        <span className="text-xs text-ink-400">なし</span>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/people/${person.id}`} className="btn btn-secondary">
                          編集
                        </Link>
                        <Link
                          href={`/people/${person.id}/preview`}
                          className="btn btn-quiet"
                        >
                          プレビュー
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
        </div>
        )}
        </>
      )}
    </div>
  );
}

const STAT_TONE: Record<string, string> = {
  plain: 'border-brand-400 text-ink-900',
  review: 'border-review-line text-review-ink',
  final: 'border-final-line text-final-ink',
  warn: 'border-accent-500/45 text-[#b03a22]',
};

/** One figure with its label. The top rule carries the status colour. */
function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: keyof typeof STAT_TONE;
}) {
  return (
    <div className={`card border-t-[3px] px-4 py-3 ${STAT_TONE[tone]}`}>
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className="tabular mt-0.5 text-xl font-bold">{value}</p>
    </div>
  );
}
