'use client';

import { useState, useTransition } from 'react';
import type { Role } from '@prisma/client';
import { saveUserAction } from '@/app/(app)/admin/users/actions';
import { Select } from '@/components/ui/select';

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  roleLabel: string;
  personId: string | null;
  personName: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
};

type PersonOption = {
  id: string;
  fullNameEnglish: string;
  fullNameKatakana: string | null;
  email: string | null;
};

const ROLES: Array<{ value: Role; label: string; hint: string }> = [
  { value: 'ADMIN' as Role, label: '管理者', hint: 'すべての操作' },
  { value: 'SALES' as Role, label: '営業', hint: '編集・表示レコードの切替・PDF出力' },
  { value: 'ENGINEER' as Role, label: '技術者（本人）', hint: '自分の経験欄の編集と確認依頼' },
  { value: 'VIEWER' as Role, label: '閲覧のみ（デモ）', hint: '閲覧のみ' },
];

export function UserManager({
  users,
  people,
}: {
  users: UserRow[];
  people: PersonOption[];
}) {
  const [editing, setEditing] = useState<Partial<UserRow> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            setEditing({ email: '', displayName: '', role: 'SALES' as Role, isActive: true })
          }
        >
          ＋ 利用者を追加
        </button>
      </div>

      {notice ? (
        <p className="rounded-md bg-final-bg px-3 py-1.5 text-xs text-final-ink">{notice}</p>
      ) : null}

      {editing ? (
        <div className="card grid gap-3 p-4 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">
              メールアドレス
            </label>
            <input
              className="input"
              value={editing.email ?? ''}
              onChange={(e) => setEditing({ ...editing, email: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">表示名</label>
            <input
              className="input"
              value={editing.displayName ?? ''}
              onChange={(e) => setEditing({ ...editing, displayName: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">権限</label>
            <Select
              ariaLabel="役割"
              value={editing.role ?? 'SALES'}
              onChange={(v) => setEditing({ ...editing, role: v as Role })}
              options={ROLES.map((r) => ({ value: r.value, label: r.label, hint: r.hint }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">
              紐付ける対象者（技術者のみ）
            </label>
            <Select
              ariaLabel="紐付ける対象者"
              placeholder="（なし）"
              value={editing.personId ?? ''}
              onChange={(v) => setEditing({ ...editing, personId: v || null })}
              disabled={editing.role !== 'ENGINEER'}
              options={[
                { value: '', label: '（なし）' },
                ...people.map((p) => {
                  // One person can be linked to one account, so an already
                  // linked person is shown as taken rather than silently
                  // failing the unique constraint on save.
                  const takenBy = users.find(
                    (u) => u.personId === p.id && u.id !== editing?.id,
                  );
                  return {
                    value: p.id,
                    label: p.fullNameKatakana ?? p.fullNameEnglish,
                    hint: takenBy
                      ? `${p.fullNameEnglish}・${takenBy.email} に紐付け済み`
                      : p.fullNameEnglish,
                    disabled: Boolean(takenBy),
                  };
                }),
              ]}
            />
          </div>
          <div className="flex items-center gap-4 md:col-span-4">
            <label className="flex items-center gap-2 text-xs text-ink-700">
              <input
                type="checkbox"
                checked={editing.isActive ?? true}
                onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
              />
              有効
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await saveUserAction({
                    id: editing.id,
                    email: editing.email ?? '',
                    displayName: editing.displayName ?? '',
                    role: (editing.role ?? 'SALES') as Role,
                    personId: editing.personId ?? null,
                    isActive: editing.isActive ?? true,
                  });
                  setNotice(result.message);
                  if (result.ok) setEditing(null);
                })
              }
            >
              保存
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
              閉じる
            </button>
          </div>
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-sand-50 text-xs text-ink-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">メールアドレス</th>
              <th className="px-4 py-2 text-left font-medium">表示名</th>
              <th className="px-4 py-2 text-left font-medium">権限</th>
              <th className="px-4 py-2 text-left font-medium">紐付け</th>
              <th className="px-4 py-2 text-left font-medium">最終ログイン</th>
              <th className="px-4 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {users.map((u) => (
              <tr key={u.id} className={u.isActive ? '' : 'opacity-50'}>
                <td className="px-4 py-1.5">{u.email}</td>
                <td className="px-4 py-1.5">{u.displayName}</td>
                <td className="px-4 py-1.5">{u.roleLabel}</td>
                <td className="px-4 py-1.5 text-ink-700">{u.personName ?? '—'}</td>
                <td className="px-4 py-1.5 text-xs text-ink-500">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ja-JP') : '未ログイン'}
                </td>
                <td className="px-4 py-1.5 text-right">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditing(u)}
                  >
                    編集
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
