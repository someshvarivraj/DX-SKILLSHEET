import type { Metadata } from 'next';
import { loadAnswerForm } from '@/lib/items/candidate';
import { AnswerForm } from '@/components/answer/answer-form';
import { MoraBot } from '@/components/morabot';
import { NewVersionNotice } from '@/components/new-version-notice';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Skill sheet questionnaire',
  robots: { index: false, follow: false },
};

/**
 * A candidate's personal link (phase 3). No login: the token is the only key,
 * and it opens this one questionnaire until it is submitted or the deadline
 * passes. Written for the candidate, so English first.
 */
export default async function AnswerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const form = await loadAnswerForm(token);

  if (form.state !== 'open') {
    const message =
      form.state === 'notfound'
        ? { mood: 'trouble' as const, en: 'This link is not valid.', ja: 'このリンクは無効です。', sub: 'Please check the link in your e-mail, or ask the person who sent it.' }
        : form.state === 'submitted'
          ? { mood: 'approved' as const, en: `Thank you${form.name ? `, ${form.name}` : ''}. Your answers have been submitted.`, ja: '回答を受け付けました。ありがとうございました。', sub: 'If you need to change something, please contact the person who sent you the link.' }
          : { mood: 'explain' as const, en: form.reason === 'deadline' ? 'The deadline for this questionnaire has passed.' : 'This questionnaire is not open for answers.', ja: form.reason === 'deadline' ? '回答の締め切りを過ぎています。' : '現在、回答を受け付けていません。', sub: 'Please contact the person who sent you the link.' };
    return (
      <main className="af-closed">
        <MoraBot mood={message.mood} size={96} title="" />
        <h1 className="af-closed-title">{message.en}</h1>
        <p className="af-closed-ja">{message.ja}</p>
        <p className="af-closed-sub">{message.sub}</p>
      </main>
    );
  }

  return (
    <>
    <NewVersionNotice />
    <AnswerForm
      token={form.token}
      setName={form.setName}
      name={form.name}
      deadline={form.deadline ? form.deadline.toISOString() : null}
      pages={form.pages}
      initialAnswers={form.answers}
    />
    </>
  );
}
