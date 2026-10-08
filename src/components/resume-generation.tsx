'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resumeStalledGenerationAction } from '@/app/(app)/people/actions';
import { refreshGenerationStatus } from '@/components/generation-progress';
import { MoraBot } from '@/components/morabot';
import { useT } from '@/lib/i18n/client';

/**
 * Shown on the people list when someone has answered but their text was never
 * written — the AI writing was interrupted (a restart) or never started.
 */
export function ResumeGenerationNotice({ names }: { names: string[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (names.length === 0 && !message) return null;

  return (
    <div className="card diff-notice" role="status">
      <MoraBot mood="writing" size={44} title="" />
      <p className="min-w-0 flex-1">
        {message ? (
          t(message)
        ) : (
          <>
            <strong>{t('{n}名のスキルシートの文章がまだ作成されていません。', { n: names.length })}</strong>{' '}
            {t('AIによる作成が途中で止まった可能性があります（{names}）。', { names: names.join('、') })}
          </>
        )}
      </p>
      {message ? null : (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await resumeStalledGenerationAction();
              setMessage(r?.message ?? '画面が古くなっています。再読み込みしてください。');
              refreshGenerationStatus();
              router.refresh();
            })
          }
        >
          {pending ? t('開始しています…') : t('文章の作成を開始する')}
        </button>
      )}
    </div>
  );
}
