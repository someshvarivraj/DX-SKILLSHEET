import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ItemType } from '@prisma/client';
import { ArrowLeft, Repeat } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { PageHeader } from '@/components/page-header';
import { SetItemRow, SetSettings, type ConditionSource } from '@/components/admin/set-editor';
import { CandidatesPanel } from '@/components/admin/candidates-panel';
import { answerLink } from '@/lib/items/candidate';
import { getLang, getT } from '@/lib/i18n/server';
import { pickName } from '@/lib/i18n';
import { askedWording } from '@/lib/items/manage';
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

/**
 * One question set: which items of the master it asks, in what order, which
 * are required, and when each is shown (design, 2026-10-02).
 */
export default async function SetEditorPage({ params }: { params: Promise<{ setId: string }> }) {
  const user = await requireUser();
  const t = await getT();
  const lang = await getLang();
  if (!can(user, 'definition.manage')) notFound();
  const { setId } = await params;

  const set = await prisma.questionSet.findUnique({
    where: { id: setId },
    include: { items: true, groupType: true, _count: { select: { responses: true } } },
  });
  if (!set) notFound();

  const [categories, groups, responses] = await Promise.all([
    prisma.itemCategory.findMany({
      orderBy: { order: 'asc' },
      include: { subcategories: { orderBy: { order: 'asc' }, include: { items: { orderBy: { order: 'asc' } } } } },
    }),
    prisma.groupType.findMany({ orderBy: { order: 'asc' } }),
    prisma.response.findMany({
      where: { setId },
      orderBy: { createdAt: 'desc' },
      include: { person: true, _count: { select: { answers: true } } },
    }),
  ]);

  // One row per candidate: their open draft if any, else their latest submission.
  const byPerson = new Map<string, (typeof responses)[number]>();
  for (const r of responses) {
    const id = r.personId ?? r.id;
    const seen = byPerson.get(id);
    if (!seen || (r.status === 'DRAFT' && seen.status !== 'DRAFT')) byPerson.set(id, r);
  }
  const candidateRows = [...byPerson.values()].map((r) => ({
    responseId: r.id,
    personId: r.personId,
    name: r.person?.fullNameEnglish ?? '—',
    email: r.person?.email ?? null,
    status: r.status,
    source: r.source,
    answered: r._count.answers,
    link: r.token && r.status === 'DRAFT' ? answerLink(r.token) : null,
    invitedAt: r.invitedAt?.toISOString() ?? null,
    submittedAt: r.submittedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }));

  const inSet = new Map(set.items.map((si) => [si.itemId, si]));
  const askedCount = set.items.length;

  // Questions a condition can depend on: choice questions this set asks.
  const conditionSources: ConditionSource[] = categories.flatMap((c) =>
    c.subcategories.flatMap((s) =>
      s.items
        .filter((i) => inSet.has(i.id) && ['RADIO', 'LIST', 'CHECKBOX'].includes(i.type))
        .map((i) => {
          const w = askedWording(i, inSet.get(i.id)!.wording);
          return { key: i.key, title: w.titleJa, options: w.options };
        }),
    ),
  );

  return (
    <div className="space-y-5">
      <Link href="/admin/items" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
        <ArrowLeft size={14} aria-hidden /> {t('設問マスタに戻る')}
      </Link>
      <PageHeader
        title={set.name}
        lead={t('このセットで聞く設問にチェックを入れます。並び順・必須・表示条件はこのセットだけの設定で、ほかのセットには影響しません。')}
      />

      <SetSettings
        set={{
          id: set.id,
          name: set.name,
          groupTypeId: set.groupTypeId,
          status: set.status,
          deadline: set.deadline ? set.deadline.toISOString().slice(0, 10) : null,
          canDelete: set._count.responses === 0 && !set.isDefault,
        }}
        groups={groups.map((g) => ({ id: g.id, name: pickName(lang, g.nameJa, g.nameEn) }))}
      />

      <CandidatesPanel setId={set.id} rows={candidateRows} open={set.status === 'OPEN'} total={candidateRows.length} />

      <p className="text-sm text-ink-700">
        {t('聞く設問: {n}件', { n: askedCount })}
        <span className="ml-3 text-ink-400">{t('回答: {n}件', { n: set._count.responses })}</span>
      </p>

      <div className="space-y-2">
        {categories.map((category, index) => {
          const colour = SECTION_PALETTE[index % SECTION_PALETTE.length]!;
          const asked = category.subcategories.reduce((n, s) => n + s.items.filter((i) => inSet.has(i.id)).length, 0);
          const visibleSubs = category.subcategories.filter((s) => s.items.some((i) => i.status === 'ACTIVE' || inSet.has(i.id)));
          if (visibleSubs.length === 0) return null;
          return (
            <details
              key={category.id}
              className="im-category"
              open={asked > 0}
              style={{ '--im-accent': colour.accent, '--im-tint': colour.tint } as React.CSSProperties}
            >
              <summary className="im-category-head">
                <span className="im-category-name">
                  {pickName(lang, category.nameJa, category.nameEn)}
                  {lang !== 'en' && category.nameEn ? <span className="im-sub-en">{category.nameEn}</span> : null}
                </span>
                <span className="im-pill">{t('{a} / {b}件', { a: asked, b: category.subcategories.reduce((n, s) => n + s.items.length, 0) })}</span>
              </summary>
              <div className="im-category-body">
                {visibleSubs.map((sub) => {
                  // Asked items in the set's order first, then the rest in master order.
                  const rows = sub.items
                    .filter((i) => i.status === 'ACTIVE' || inSet.has(i.id))
                    .sort((a, b) => {
                      const sa = inSet.get(a.id);
                      const sb = inSet.get(b.id);
                      if (sa && sb) return sa.order - sb.order;
                      if (sa) return -1;
                      if (sb) return 1;
                      return a.order - b.order;
                    });
                  return (
                    <div key={sub.id}>
                      <p className="im-sub-head">
                        {pickName(lang, sub.nameJa, sub.nameEn)}
                        {sub.isRepeating ? (
                          <span className="im-repeat">
                            <Repeat size={12} aria-hidden /> {t('繰り返し（最大{n}件）', { n: sub.maxEntries })}
                          </span>
                        ) : null}
                      </p>
                      <ul className="im-items">
                        {rows.map((item) => {
                          const si = inSet.get(item.id);
                          const w = askedWording(item, si?.wording);
                          return (
                            <SetItemRow
                              key={item.id}
                              setId={set.id}
                              conditionSources={conditionSources}
                              item={{
                                id: item.id,
                                key: item.key,
                                title: w.titleJa,
                                titleEn: w.titleEn,
                                typeLabel: TYPE_LABEL[item.type],
                                asked: Boolean(si),
                                required: si?.isRequired ?? false,
                                showIf: (si?.showIf as { itemKey: string; anyOf: string[] } | null) ?? null,
                                ownWording: Boolean(si?.wording),
                                status: item.status,
                              }}
                            />
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
