import { notFound } from 'next/navigation';
import type { ItemType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { PageHeader } from '@/components/page-header';
import { GsUpload } from '@/components/admin/gs-upload';
import { SetDefaultButton } from '@/components/admin/set-default-button';
import { getLang, getT } from '@/lib/i18n/server';
import { pickName } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<ItemType, string> = {
  TEXT: '短文',
  PARAGRAPH: '長文',
  RADIO: '単一選択',
  LIST: 'プルダウン',
  CHECKBOX: '複数選択',
  DATE: '日付',
  GRID: '表形式',
  NUMBER: '数値',
};

/**
 * 設問マスタ (design, 2026-10-02): every question ever asked, as Category ->
 * Subcategory -> Item, and the question sets that select from it. Item keys
 * are internal and never shown.
 */
export default async function ItemMasterPage() {
  const user = await requireUser();
  const t = await getT();
  const lang = await getLang();
  if (!can(user, 'definition.manage')) notFound();

  const [categories, sets, groupTypes] = await Promise.all([
    prisma.itemCategory.findMany({
      orderBy: { order: 'asc' },
      include: {
        subcategories: {
          orderBy: { order: 'asc' },
          include: {
            items: {
              orderBy: { order: 'asc' },
              include: { groupTypes: { include: { groupType: true } }, _count: { select: { answers: true } } },
            },
          },
        },
      },
    }),
    prisma.questionSet.findMany({
      orderBy: { createdAt: 'desc' },
      include: { groupType: true, _count: { select: { items: true, responses: true } } },
    }),
    prisma.groupType.findMany({ orderBy: { order: 'asc' }, select: { id: true, nameJa: true } }),
  ]);

  const itemCount = categories.reduce(
    (n, c) => n + c.subcategories.reduce((m, s) => m + s.items.length, 0),
    0,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('設問マスタ')}
        lead={t('これまでに聞いたすべての設問を「カテゴリ › サブカテゴリ › 設問」で管理します。質問セットは、この中から聞く設問を選んだものです。')}
      />

      <GsUpload groupTypes={groupTypes} />

      <section className="card overflow-hidden">
        <h2 className="panel-head panel-title">{t('質問セット')}</h2>
        {sets.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-500">
            {t('質問セットはまだありません。上からGoogleフォームのスクリプト（.gs）を取り込んでください。')}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data-table !min-w-[40rem]">
              <thead>
                <tr>
                  <th>{t('名前')}</th>
                  <th>{t('グループ')}</th>
                  <th>{t('設問数')}</th>
                  <th>{t('回答数')}</th>
                  <th>{t('回答ファイルの取り込み先')}</th>
                </tr>
              </thead>
              <tbody>
                {sets.map((set) => (
                  <tr key={set.id}>
                    <td>
                      {set.name}
                      {set.sourceFile ? <div className="text-xs text-ink-400">{set.sourceFile}</div> : null}
                    </td>
                    <td>{pickName(lang, set.groupType.nameJa, set.groupType.nameEn)}</td>
                    <td>{set._count.items}</td>
                    <td>{set._count.responses}</td>
                    <td>{set.isDefault ? <span className="badge">{t('取り込み先')}</span> : <SetDefaultButton setId={set.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <h2 className="panel-head panel-title">
          {t('設問マスタ')} <span className="text-xs font-normal text-ink-400">{t('{n}件', { n: itemCount })}</span>
        </h2>
        {categories.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-500">{t('設問はまだありません。')}</p>
        ) : (
          <div className="divide-y divide-ink-100">
            {categories.map((category) => (
              <details key={category.id} className="px-4 py-2">
                <summary className="cursor-pointer py-1 text-sm font-medium text-ink-900">
                  {pickName(lang, category.nameJa, category.nameEn)}
                  <span className="ml-2 text-xs font-normal text-ink-400">
                    {t('{n}件', { n: category.subcategories.reduce((m, s) => m + s.items.length, 0) })}
                  </span>
                </summary>
                <div className="space-y-3 pb-2 pl-3">
                  {category.subcategories.map((sub) => (
                    <div key={sub.id}>
                      <p className="text-xs font-medium text-ink-700">
                        {pickName(lang, sub.nameJa, sub.nameEn)}
                        {sub.isRepeating ? (
                          <span className="def-tag ml-2">{t('繰り返し（最大{n}件）', { n: sub.maxEntries })}</span>
                        ) : null}
                      </p>
                      <ul className="mt-1 divide-y divide-ink-100 border border-ink-100">
                        {sub.items.map((item) => (
                          <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-1.5 text-sm">
                            <span className="min-w-0 flex-1">
                              {lang === 'en' && item.titleEn ? item.titleEn : item.titleJa}
                              {lang !== 'en' && item.titleEn ? (
                                <span className="ml-2 text-xs text-ink-400">{item.titleEn}</span>
                              ) : null}
                            </span>
                            <span className="def-tag">{t(TYPE_LABEL[item.type])}</span>
                            {item.groupTypes.map((g) => (
                              <span key={g.groupTypeId} className="text-xs text-ink-500">
                                {pickName(lang, g.groupType.nameJa, g.groupType.nameEn)}
                              </span>
                            ))}
                            {item.status !== 'ACTIVE' ? (
                              <span className="def-tag">{t(item.status === 'HIDDEN' ? '非表示' : '置き換え済み')}</span>
                            ) : null}
                            <span className="text-xs text-ink-400">{t('回答{n}件', { n: item._count.answers })}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
