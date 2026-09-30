'use client';

import { useActionState } from 'react';
import { getDemoEnabled } from './demo-enabled';
import { loginWithDemoAccount, requestLoginLink, type LoginState } from './actions';
import { MoraBot } from '@/components/morabot';

const initial: LoginState = {};

export default function LoginPage() {
  const [linkState, linkAction, linkPending] = useActionState(requestLoginLink, initial);
  const [demoState, demoAction, demoPending] = useActionState(
    loginWithDemoAccount,
    initial,
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-sand-100 px-4 py-12">
      <div className="w-full max-w-md rise">
        <div className="mb-6 flex items-center justify-center gap-3">
          <MoraBot mood={linkState.message ? 'happy' : linkState.error ? 'trouble' : 'default'} size={76} />
          <div>
            <p className="text-lg font-bold leading-tight text-ink-900">スキルシート管理システム</p>
            <p className="text-xs text-ink-500">モラブ阪神工業株式会社</p>
          </div>
        </div>

        <div className="card px-7 py-8">
          <h1 className="text-xl font-bold text-ink-900">ログイン</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            メールアドレスを入力すると、ログイン用のリンクが届きます。パスワードは不要です。
          </p>

          <form action={linkAction} className="mt-6 space-y-3">
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
              placeholder="name@example.com"
            />
            <button
              type="submit"
              className="btn btn-primary w-full justify-center !min-h-11"
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

        <p className="mt-5 text-center text-xs text-ink-400">
          社内利用限定です。個人情報を扱うため、取り扱いにご注意ください。
        </p>
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
