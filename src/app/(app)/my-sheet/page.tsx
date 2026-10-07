import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { ENGINEER_EDITABLE_SECTIONS } from '@/lib/auth/permissions';
import { loadSheetModel } from '@/lib/sheet/model';
import { getOrCreateSkillSheet } from '@/lib/sheet/version';
import { loadCandidateHome } from '@/lib/items/candidate-home';
import { SectionPanel } from '@/components/editor/section-panel';
import { SheetToolbar } from '@/components/editor/sheet-toolbar';
import { MoraBot } from '@/components/morabot';
import { getLang, getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/**
 * マイページ — the candidate's own page, opened from the login link in their
 * e-mail (or by logging in with their address at any time).
 *
 *   1. The questionnaire, when one is open: first answers, or an update the
 *      team asked for (their previous answers already filled in). Answering
 *      opens the full-screen answer screen.
 *   2. Their skill sheet, once the team has finalised it.
 *   3. After that, adding new experience (internships, projects) themselves
 *      and sending it for review — the goal Sano-san described.
 */
export default async function MySheetPage() {
  const user = await requireUser();
  const t = await getT();
  const lang = await getLang();
  if (!user.personId) {
    return (
      <div className="card p-10 text-center text-sm text-ink-500">
        {t('このアカウントには対象者が紐付いていません。管理者に連絡してください。')}
      </div>
    );
  }
  if (user.role !== 'ENGINEER') redirect(`/people/${user.personId}`);

  const home = await loadCandidateHome(user.personId);
  const date = (d: Date) =>
    d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Tokyo',
    });

  const q = home.questionnaire;
  // Which of the three steps the candidate is on.
  const step = home.sheet.ready ? 3 : home.lastSubmitted && !q ? 2 : 1;

  return (
    <div className="me space-y-4">
      <header className="me-hello card">
        <MoraBot mood="sheet" size={84} title="" />
        <div className="min-w-0">
          <h1 className="me-hello-title">{t('{name}さん、こんにちは', { name: home.name })}</h1>
          <p className="me-hello-sub">
            {t('ここでスキルシート用の情報を入力し、完成したスキルシートを確認できます。')}
          </p>
        </div>
      </header>

      <ol className="me-steps" aria-label={t('進み具合')}>
        {[t('情報を入力する'), t('担当者がスキルシートを作成'), t('スキルシート完成')].map((label, i) => (
          <li
            key={label}
            className={`me-step ${i + 1 < step ? 'me-step-done' : i + 1 === step ? 'me-step-now' : ''}`}
            aria-current={i + 1 === step ? 'step' : undefined}
          >
            <span className="me-step-n">{i + 1 < step ? '✓' : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {/* 1 — the questionnaire */}
      <section className="card me-card">
        <h2 className="me-card-title">{t('アンケート')}</h2>
        {q ? (
          <>
            {q.isUpdate ? (
              <p className="me-flag">{t('担当者から、情報の確認・更新の依頼が届いています。')}</p>
            ) : null}
            <p className="me-card-lead">
              {q.isUpdate
                ? t('前回の回答が入っています。変わったところを直して、もう一度提出してください。')
                : t('スキルシートを作るための質問です。途中で保存されるので、何回かに分けて入力できます。')}
            </p>
            <dl className="me-facts">
              {q.deadline ? (
                <div>
                  <dt>{t('締め切り')}</dt>
                  <dd className={q.deadlinePassed ? 'text-[#b03a22]' : ''}>{date(q.deadline)}</dd>
                </div>
              ) : null}
              <div>
                <dt>{t('入力済み')}</dt>
                <dd>
                  {t('{a} / {b}問', { a: Math.min(q.answered, q.total), b: q.total })}
                  <span className="me-meter" aria-hidden>
                    <span style={{ width: `${q.total ? Math.min(100, (q.answered / q.total) * 100) : 0}%` }} />
                  </span>
                </dd>
              </div>
            </dl>
            {q.open ? (
              <Link href={`/answer/${q.token}`} className="btn btn-primary me-cta">
                {q.answered > 0 ? t('続きを入力する') : q.isUpdate ? t('確認・更新する') : t('入力を始める')}
              </Link>
            ) : (
              <p className="me-note">
                {q.deadlinePassed
                  ? t('締め切りを過ぎたため、今は入力できません。変更が必要な場合は担当者に連絡してください。')
                  : t('まだ受付が始まっていません。始まったらこのページから入力できます。')}
              </p>
            )}
          </>
        ) : home.lastSubmitted ? (
          <div className="me-done">
            <MoraBot mood="approved" size={48} title="" />
            <p>
              {t('{date}に提出しました。ありがとうございました。', { date: date(home.lastSubmitted.at) })}
              <span className="me-note block">
                {t('変更したいことがあれば、担当者に連絡してください。更新の依頼が届くと、ここから入力できます。')}
              </span>
            </p>
          </div>
        ) : (
          <p className="me-note">{t('今はお願いしているアンケートはありません。受付が始まると、メールでお知らせします。')}</p>
        )}
      </section>

      {/* 2 — the skill sheet */}
      <section className="card me-card">
        <h2 className="me-card-title">{t('スキルシート')}</h2>
        {home.sheet.ready ? (
          <>
            <p className="me-card-lead">
              {home.sheet.finalisedAt
                ? t('{date}に完成しました。', { date: date(home.sheet.finalisedAt) })
                : t('完成しています。')}
            </p>
            <Link href={`/people/${user.personId}/preview`} className="btn btn-primary me-cta">
              {t('スキルシートを見る')}
            </Link>
          </>
        ) : (
          <p className="me-note">
            {home.lastSubmitted
              ? t('担当者が回答をもとにスキルシートを作成しています。完成したらここで見られます。')
              : t('アンケートに回答すると、担当者がスキルシートを作成します。完成したらここで見られます。')}
          </p>
        )}
      </section>

      {/* 3 — adding new experience, once there is a sheet to add it to */}
      {home.sheet.everFinal ? <ExperienceEditor personId={user.personId} /> : null}
    </div>
  );
}

async function ExperienceEditor({ personId }: { personId: string }) {
  const t = await getT();
  await getOrCreateSkillSheet(personId);
  const model = await loadSheetModel(personId);
  if (!model) return null;
  return (
    <section className="space-y-4">
      <div className="card me-card">
        <h2 className="me-card-title">{t('新しい経験を追加する')}</h2>
        <p className="me-card-lead">
          {t(
            '編集できるのは「インターンシップ」と「プロジェクト」です。新しい現場での経験は「＋ 追加」から登録し、内容を入力したあと「確認を依頼する」を押してください。管理者が確認して確定します。氏名や学歴など他の項目の修正が必要な場合は管理者に連絡してください。',
          )}
        </p>
      </div>
      <SheetToolbar model={model} canFinalise={false} canExport={false} canSubmit />
      {model.sections
        .filter((s) => ENGINEER_EDITABLE_SECTIONS.includes(s.code as never))
        .map((section) => (
          <SectionPanel
            key={section.id}
            personId={personId}
            section={section}
            presetId={model.preset?.id ?? null}
            readOnly={false}
            editableSectionCodes={[...ENGINEER_EDITABLE_SECTIONS]}
          />
        ))}
    </section>
  );
}
