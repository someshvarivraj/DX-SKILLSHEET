'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useT } from '@/lib/i18n/client';

/**
 * Filter the item master by group. A dropdown rather than a row of buttons:
 * it stays one control however many groups there are.
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
    <label className="im-filter">
      <span>{t('グループで絞り込む')}</span>
      <select
        className="input im-filter-select"
        value={current ?? ''}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          startTransition(() => router.push(id ? `/admin/items?group=${id}` : '/admin/items'));
        }}
      >
        <option value="">{t('すべてのグループ（{n}件）', { n: total })}</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {t('{name}（{n}件）', { name: g.name, n: g.count })}
          </option>
        ))}
      </select>
    </label>
  );
}
