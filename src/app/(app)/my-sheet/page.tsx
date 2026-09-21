import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { ENGINEER_EDITABLE_SECTIONS } from '@/lib/auth/permissions';
import { loadSheetModel } from '@/lib/sheet/model';
import { getOrCreateSkillSheet } from '@/lib/sheet/version';
import { SectionPanel } from '@/components/editor/section-panel';
import { SheetToolbar } from '@/components/editor/sheet-toolbar';

export const dynamic = 'force-dynamic';

/**
 * Self-service screen for the engineer whose sheet it is.
 *
 * This is the goal Sano-san described: after working at a customer site, the
 * person adds that experience themselves instead of sending it to be typed in
 * by hand. They may edit their own internship and project records and submit
 * the result for review; everything else is read-only.
 */
export default async function MySheetPage() {
  const user = await requireUser();
  if (!user.personId) {
    return (
      <div className="card p-10 text-center text-sm text-ink-500">
        このアカウントには対象者が紐付いていません。管理者に連絡してください。
      </div>
    );
  }
  if (user.role !== 'ENGINEER') redirect(`/people/${user.personId}`);

  await getOrCreateSkillSheet(user.personId);
  const model = await loadSheetModel(user.personId);
  if (!model) redirect('/');

  return (
    <div className="space-y-4">
      <div className="card bg-brand-50 px-4 py-3 text-sm text-ink-700">
        <p className="font-medium">自分の経験を追加・修正できます。</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-700">
          編集できるのは「インターンシップ」と「プロジェクト」です。新しい現場での経験は
          「＋ 追加」から登録し、内容を入力したあと「確認を依頼する」を押してください。
          管理者が確認して確定します。氏名や学歴など他の項目の修正が必要な場合は管理者に連絡してください。
        </p>
      </div>

      <SheetToolbar
        model={model}
        canFinalise={false}
        canExport={false}
        canSubmit
      />

      {model.sections
        .filter((s) => ENGINEER_EDITABLE_SECTIONS.includes(s.code as never))
        .map((section) => (
          <SectionPanel
            key={section.id}
            personId={user.personId!}
            section={section}
            presetId={model.preset?.id ?? null}
            readOnly={false}
            editableSectionCodes={[...ENGINEER_EDITABLE_SECTIONS]}
          />
        ))}

      <div className="card px-4 py-3 text-xs text-ink-500">
        <Link href={`/people/${user.personId}/preview`} className="text-brand-500 underline">
          自分のスキルシート全体をプレビューで確認する
        </Link>
      </div>
    </div>
  );
}
