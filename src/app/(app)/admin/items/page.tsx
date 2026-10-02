import { notFound } from 'next/navigation';
import type { ItemType } from '@prisma/client';
import { ChevronRight, FileCode2, Inbox, Layers, ListChecks, Pencil, Repeat, Users } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { PageHeader } from '@/components/page-header';
import { GsUpload } from '@/components/admin/gs-upload';
import { SetDefaultButton } from '@/components/admin/set-default-button';
import { GroupFilter } from '@/components/admin/group-filter';
import { ItemEditButton, ItemMasterProvider, type EditableItem } from '@/components/admin/item-editor';
import { NameEditButton, NewSetButton } from '@/components/admin/item-master-tools';
import Link from 'next/link';
import { getLang, getT } from '@/lib/i18n/server';
import { pickName } from '@/lib/i18n';
import { SECTION_PALETTE } from '@/lib/sheet/section-colours';

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

/** Group chips cycle through these tones (styled as .im-group[data-tone]). */
const GROUP_TONES = 6;

/**
 * 設問マスタ (design, 2026-10-02): every question ever asked, as Category ->
 * Subcategory -> Item, and the question sets that select from it. Item keys
 * are internal and never shown.
 */
export default async function ItemMasterPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const user = await requireUser();
  const t = await getT();
  const lang = await getLang();
  if (!can(user, 'definition.manage')) notFound();
  const { group: groupFilter } = await searchParams;

  const [categories, sets, groupTypes] = await Promise.all([
    prisma.itemCategory.findMany({
      orderBy: { order: 'asc' },
      include: {
        subcategories: {
          orderBy: { order: 'asc' },
          include: {
            items: {
              orderBy: { order: 'asc' },
              include: { groupTypes: true, _count: { select: { answers: true } } },
            },
          },
        },
      },
    }),
    prisma.questionSet.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      include: { groupType: true, _count: { select: { items: true, responses: true } } },
    }),
    prisma.groupType.findMany({
      orderBy: { order: 'asc' },
      include: { _count: { select: { items: true } } },
    }),
  ]);

  const toneOf = new Map(groupTypes.map((g, i) => [g.id, i % GROUP_TONES]));
  const groupName = (id: string) => {
    const g = groupTypes.find((x) => x.id === id);
    return g ? pickName(lang, g.nameJa, g.nameEn) : '';
  };
  const activeGroup = groupTypes.find((g) => g.id === groupFilter) ?? null;
  const target = sets.find((set) => set.isDefault) ?? null;
  const others = sets.filter((set) => !set.isDefault);

  // The tree as shown: filtered to one group when a chip is picked.
  const tree = categories
    .map((category, index) => ({
      ...category,
      colour: SECTION_PALETTE[index % SECTION_PALETTE.length]!,
      subcategories: category.subcategories
        .map((sub) => ({
          ...sub,
          items: activeGroup
            ? sub.items.filter((item) => item.groupTypes.some((g) => g.groupTypeId === activeGroup.id))
            : sub.items,
        }))
        .filter((sub) => !activeGroup || sub.items.length > 0),
    }))
    .filter((category) => !activeGroup || category.subcategories.length > 0);

  const totalItems = categories.reduce((n, c) => n + c.subcategories.reduce((m, s) => m + s.items.length, 0), 0);
  const shownItems = tree.reduce((n, c) => n + c.subcategories.reduce((m, s) => m + s.items.length, 0), 0);

  const groupOptions = groupTypes.map((g) => ({ id: g.id, name: pickName(lang, g.nameJa, g.nameEn) }));
  const allActive = categories.flatMap((c) =>
    c.subcategories.flatMap((s) =>
      s.items
        .filter((i) => i.status === 'ACTIVE')
        .map((i) => ({ id: i.id, label: `${c.nameJa} › ${i.titleJa}${i.titleEn ? `／${i.titleEn}` : ''}` })),
    ),
  );
  const editable = (item: (typeof categories)[number]['subcategories'][number]['items'][number]): EditableItem => ({
    id: item.id,
    titleJa: item.titleJa,
    titleEn: item.titleEn,
    helpJa: item.helpJa,
    helpEn: item.helpEn,
    exampleJa: item.exampleJa,
    exampleEn: item.exampleEn,
    type: item.type,
    options: item.options,
    allowOther: item.allowOther,
    gridRows: item.gridRows,
    gridColumns: item.gridColumns,
    validation: (item.validation as EditableItem['validation']) ?? null,
    groupTypeIds: item.groupTypes.map((g) => g.groupTypeId),
    status: item.status,
    answerCount: item._count.answers,
  });

  const stats = [
    { icon: ListChecks, label: t('設問'), value: totalItems },
    { icon: Layers, label: t('カテゴリ'), value: categories.length },
    { icon: FileCode2, label: t('質問セット'), value: sets.length },
    { icon: Users, label: t('グループ'), value: groupTypes.length },
  ];

  return (
    <ItemMasterProvider value={{ groups: groupOptions, items: allActive }}>
    <div className="space-y-6">
      <PageHeader
        title={t('設問マスタ')}
        lead={t('これまでに聞いたすべての設問を「カテゴリ › サブカテゴリ › 設問」で管理します。質問セットは、この中から聞く設問を選んだものです。')}
      />

      <div className="im-stats">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="im-stat">
            <Icon size={18} aria-hidden className="im-stat-icon" />
            <div>
              <div className="im-stat-value">{value}</div>
              <div className="im-stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <GsUpload groupTypes={groupTypes.map((g) => ({ id: g.id, nameJa: g.nameJa }))} />

      {/* ---- Question sets ------------------------------------------------
          The import target is the one set that matters day to day, so it
          stands alone and large; the rest are a plain list, and changing the
          target asks for confirmation (Sano-san's review, 2026-10-05). */}
      <section>
        <div className="im-master-head">
          <h2 className="im-section-title !mb-0">{t('質問セット')}</h2>
          <NewSetButton groups={groupOptions} sets={sets.map((s) => ({ id: s.id, name: s.name }))} />
        </div>
        {sets.length === 0 ? (
          <p className="card px-4 py-6 text-sm text-ink-500">
            {t('質問セットはまだありません。上からGoogleフォームのスクリプト（.gs）を取り込んでください。')}
          </p>
        ) : (
          <div className="space-y-3">
            {target ? (
              <div className="im-target-panel">
                <div className="im-target-tag">
                  <Inbox size={14} aria-hidden /> {t('回答ファイルの取り込み先')}
                </div>
                <div className="im-target-main">
                  <div className="min-w-0">
                    <h3 className="im-target-name">{target.name}</h3>
                    <div className="im-target-sub">
                      <span className="im-group" data-tone={toneOf.get(target.groupTypeId) ?? 0}>
                        {groupName(target.groupTypeId)}
                      </span>
                      {target.sourceFile ? (
                        <span className="im-set-file">
                          <FileCode2 size={13} aria-hidden /> {target.sourceFile}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <dl className="im-set-figures">
                    <div className="self-end">
                      <Link href={`/admin/items/sets/${target.id}`} className="btn btn-secondary btn-sm">
                        <Pencil size={14} aria-hidden /> {t('設問を選ぶ・編集')}
                      </Link>
                    </div>
                    <div>
                      <dt>{t('設問')}</dt>
                      <dd>{target._count.items}</dd>
                    </div>
                    <div>
                      <dt>{t('回答')}</dt>
                      <dd>{target._count.responses}</dd>
                    </div>
                  </dl>
                </div>
                <p className="im-target-note">
                  {t('「回答の取り込み」で読み込む回答ファイルは、この質問セットの設問として読み込まれます。')}
                </p>
              </div>
            ) : (
              <p className="border border-accent-500/40 bg-accent-50 px-4 py-3 text-sm text-[#b03a22]">
                {t('回答ファイルの取り込み先が決まっていません。下の一覧から選んでください。')}
              </p>
            )}

            {others.length > 0 ? (
              <details className="card im-others">
                <summary className="im-others-head">
                  <ChevronRight size={16} aria-hidden className="im-chevron" />
                  {t('その他の質問セット')}
                  <span className="im-count">{t('{n}件', { n: others.length })}</span>
                </summary>
                <div className="table-scroll">
                  <table className="data-table !min-w-[40rem]">
                    <thead>
                      <tr>
                        <th>{t('名前')}</th>
                        <th>{t('グループ')}</th>
                        <th>{t('設問数')}</th>
                        <th>{t('回答数')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {others.map((set) => (
                        <tr key={set.id}>
                          <td>
                            {set.name}
                            {set.sourceFile ? <div className="text-xs text-ink-400">{set.sourceFile}</div> : null}
                          </td>
                          <td>
                            <span className="im-group" data-tone={toneOf.get(set.groupTypeId) ?? 0}>
                              {groupName(set.groupTypeId)}
                            </span>
                          </td>
                          <td>{set._count.items}</td>
                          <td>{set._count.responses}</td>
                          <td className="text-right whitespace-nowrap">
                            <Link href={`/admin/items/sets/${set.id}`} className="btn btn-secondary btn-sm mr-2">
                              <Pencil size={14} aria-hidden /> {t('編集')}
                            </Link>
                            <SetDefaultButton setId={set.id} setName={set.name} currentName={target?.name ?? null} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : null}
          </div>
        )}
      </section>

      {/* ---- Groups ------------------------------------------------------ */}
      <section>
        <h2 className="im-section-title">{t('グループ')}</h2>
        <div className="im-groups">
          {groupTypes.map((g) => (
            <span key={g.id} className="im-group im-group-lg" data-tone={toneOf.get(g.id) ?? 0}>
              {pickName(lang, g.nameJa, g.nameEn)}
              <span className="im-group-count">{t('{n}件', { n: g._count.items })}</span>
              <NameEditButton kind="group" id={g.id} nameJa={g.nameJa} nameEn={g.nameEn} />
            </span>
          ))}
          <NameEditButton kind="group" label={t('グループを追加')} />
        </div>
      </section>

      {/* ---- Item master ---------------------------------------------------- */}
      <section>
        <div className="im-master-head">
          <h2 className="im-section-title !mb-0">
            {t('設問マスタ')}
            <span className="im-count">
              {activeGroup ? t('{a} / {b}件', { a: shownItems, b: totalItems }) : t('{n}件', { n: totalItems })}
            </span>
          </h2>
          {groupTypes.length > 0 ? (
            <GroupFilter
              groups={groupTypes.map((g) => ({ id: g.id, name: pickName(lang, g.nameJa, g.nameEn), count: g._count.items }))}
              current={activeGroup?.id ?? null}
              total={totalItems}
            />
          ) : null}
        </div>

        {tree.length === 0 ? (
          <p className="card px-4 py-6 text-sm text-ink-500">{t('設問はまだありません。')}</p>
        ) : (
          <div className="space-y-2">
            {tree.map((category) => {
              const count = category.subcategories.reduce((m, s) => m + s.items.length, 0);
              return (
                <details
                  key={category.id}
                  className="im-category"
                  style={{ '--im-accent': category.colour.accent, '--im-tint': category.colour.tint } as React.CSSProperties}
                >
                  <summary className="im-category-head">
                    <ChevronRight size={16} aria-hidden className="im-chevron" />
                    <span className="im-category-name">
                      {pickName(lang, category.nameJa, category.nameEn)}
                      {lang !== 'en' && category.nameEn ? <span className="im-sub-en">{category.nameEn}</span> : null}
                    </span>
                    <NameEditButton kind="category" id={category.id} nameJa={category.nameJa} nameEn={category.nameEn} />
                    <span className="im-pill">{t('{n}件', { n: count })}</span>
                  </summary>

                  <div className="im-category-body">
                    {category.subcategories.map((sub) => (
                      <div key={sub.id} className="im-sub">
                        <p className="im-sub-head">
                          {pickName(lang, sub.nameJa, sub.nameEn)}
                          {sub.isRepeating ? (
                            <span className="im-repeat">
                              <Repeat size={12} aria-hidden /> {t('繰り返し（最大{n}件）', { n: sub.maxEntries })}
                            </span>
                          ) : null}
                          <NameEditButton
                            kind="subcategory"
                            id={sub.id}
                            nameJa={sub.nameJa}
                            nameEn={sub.nameEn}
                            isRepeating={sub.isRepeating}
                            maxEntries={sub.maxEntries}
                          />
                        </p>
                        <ul className="im-items">
                          {sub.items.map((item) => (
                            <li key={item.id} className={`im-item ${item.status !== 'ACTIVE' ? 'im-item-muted' : ''}`}>
                              <div className="im-item-title">
                                <span>{lang === 'en' && item.titleEn ? item.titleEn : item.titleJa}</span>
                                {lang !== 'en' && item.titleEn ? <span className="im-item-en">{item.titleEn}</span> : null}
                              </div>
                              <div className="im-item-meta">
                                <span className="im-type">{t(TYPE_LABEL[item.type])}</span>
                                {item.groupTypes.map((g) => (
                                  <span key={g.groupTypeId} className="im-group" data-tone={toneOf.get(g.groupTypeId) ?? 0}>
                                    {groupName(g.groupTypeId)}
                                  </span>
                                ))}
                                {item.status !== 'ACTIVE' ? (
                                  <span className="im-type">{t(item.status === 'HIDDEN' ? '非表示' : '置き換え済み')}</span>
                                ) : null}
                                <span className="im-answers">{t('回答{n}件', { n: item._count.answers })}</span>
                                <ItemEditButton item={editable(item)} />
                              </div>
                            </li>
                          ))}
                        </ul>
                        <ItemEditButton subcategoryId={sub.id} />
                      </div>
                    ))}
                    <NameEditButton kind="subcategory" parentId={category.id} label={t('サブカテゴリを追加')} />
                  </div>
                </details>
              );
            })}
            {activeGroup ? null : <NameEditButton kind="category" label={t('カテゴリを追加')} />}
          </div>
        )}
      </section>
    </div>
    </ItemMasterProvider>
  );
}
