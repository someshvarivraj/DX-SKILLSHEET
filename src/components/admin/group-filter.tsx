'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useT } from '@/lib/i18n/client';
import { Select } from '@/components/ui/select';

/**
 * Filter the item master by group: the app's own searchable select, like every
 * other choice on the admin screens, so it stays one control however many
 * groups there are.
 */
export function GroupFilter({
  groups,
  current,
  total,
}: {
  groups: Array<{ id: string; name: string; count: number }>;
  current: string | null;
  total: number;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="im-filter">
      <span>{t('グループで絞り込む')}</span>
      <Select
        className="im-filter-select"
        ariaLabel={t('グループで絞り込む')}
        value={current ?? ''}
        disabled={pending}
        searchFrom={1}
        onChange={(id) => startTransition(() => router.push(id ? `/admin/items?group=${id}` : '/admin/items'))}
        options={[
          { value: '', label: t('すべてのグループ'), hint: t('{n}件', { n: total }) },
          ...groups.map((g) => ({ value: g.id, label: g.name, hint: t('{n}件', { n: g.count }) })),
        ]}
      />
    </div>
  );
}
