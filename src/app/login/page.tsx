'use client';

import { useActionState } from 'react';
import { getDemoEnabled } from './demo-enabled';
import { loginWithDemoAccount, requestLoginLink, type LoginState } from './actions';

const initial: LoginState = {};

export default function LoginPage() {
  const [linkState, linkAction, linkPending] = useActionState(requestLoginLink, initial);
  const [demoState, demoAction, demoPending] = useActionState(
    loginWithDemoAccount,
    initial,
  );

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* The brand side. On a phone it collapses to a short band above the form
          rather than disappearing, so the screen still says whose tool this is. */}
      <aside className="relative overflow-hidden bg-brand-500 px-8 py-10 text-white lg:px-14 lg:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(90% 70% at 15% 10%, #139AD6 0%, rgba(19,154,214,0) 55%), radial-gradient(70% 60% at 95% 95%, #066A9F 0%, rgba(6,106,159,0) 60%)',
          }}
        />
        <div className="relative flex h-full flex-col justify-between gap-10">
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15 text-xs ring-1 ring-white/25">
              SS
            </span>
            モラブ阪神工業株式会社
          </div>

          <div className="max-w-md">
            <h1 className="text-2xl font-bold leading-snug lg:text-3xl">
              スキルシート
              <br />
              管理システム
            </h1>
            <p className="mt-4 text-sm leading-loose text-white/90">
              アンケートの回答から、日本語のスキルシートを作成します。作成した内容は確認・修正のうえ確定し、A4のPDFとして出力できます。
            </p>
            <ul className="mt-7 space-y-2.5 text-sm text-white/90">
              {[
                'アンケート回答の取り込みと項目への割り当て',
                '日本語文章の生成と、担当者による確認・修正',
                '確定版のPDF出力と、営業向けの補足資料',
              ].map((line) => (
                <li key={line} className="flex gap-2.5">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-white/60" />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-white/85">
            社内利用限定。個人情報を扱うため、取り扱いにご注意ください。
          </p>
        </div>
      </aside>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm rise">
          <h2 className="page-title">ログイン</h2>
          <p className="mt-2 text-sm text-ink-500">
            社内メールアドレスにログインリンクを送ります。パスワードは不要です。
          </p>

          <form action={linkAction} className="mt-7 space-y-3">
            <label className="field-label" htmlFor="email">
              メールアドレス
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="input"
              placeholder="name@morabu.com"
            />
            <button
              type="submit"
              className="btn btn-primary w-full justify-center"
              disabled={linkPending}
            >
              {linkPending ? '送信中…' : 'ログインリンクを送る'}
            </button>
            {linkState.message ? (
              <p className="rounded-lg border border-final-line bg-final-bg px-3 py-2 text-sm text-final-ink">
                {linkState.message}
              </p>
            ) : null}
            {linkState.error ? (
              <p className="rounded-lg border border-accent-500/40 bg-accent-50 px-3 py-2 text-sm text-[#b03a22]">
                {linkState.error}
              </p>
            ) : null}
          </form>

          <DemoBlock action={demoAction} pending={demoPending} state={demoState} />
        </div>
      </div>
    </main>
  );
}

function DemoBlock({
  action,
  pending,
  state,
}: {
  action: (formData: FormData) => void;
  pending: boolean;
  state: LoginState;
}) {
  if (!getDemoEnabled()) return null;
  return (
    <>
      <div className="my-7 flex items-center gap-3 text-xs text-ink-400">
        <span className="h-px flex-1 bg-ink-100" />
        デモ利用者
        <span className="h-px flex-1 bg-ink-100" />
      </div>
      <form action={action} className="space-y-3">
        <p className="field-hint">
          試用中の関係者向けの共有アカウントです。閲覧のみで、編集・確定・PDF出力はできません。
        </p>
        <input
          name="password"
          type="password"
          required
          className="input"
          placeholder="デモ用パスワード"
        />
        <button
          type="submit"
          className="btn btn-secondary w-full justify-center"
          disabled={pending}
        >
          {pending ? '確認中…' : 'デモアカウントで閲覧する'}
        </button>
        {state.error ? (
          <p className="rounded-lg border border-accent-500/40 bg-accent-50 px-3 py-2 text-sm text-[#b03a22]">
            {state.error}
          </p>
        ) : null}
      </form>
    </>
  );
}
