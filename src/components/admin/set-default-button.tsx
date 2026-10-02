'use client';

import { Portal } from '@/components/ui/portal';
import { useEffect, useState, useTransition } from 'react';
import { ArrowRight } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { MoraBot } from '@/components/morabot';
import { setDefaultSetAction } from '@/app/(app)/admin/items/actions';

/**
 * Makes a question set the one answer files are imported into — after a
 * confirmation that names the current and the new target. Importing a file
 * into the wrong set files every answer under the wrong questions, so this is
 * never a one-click change.
 */
export function SetDefaultButton({
  setId,
  setName,
  currentName,
}: {
  setId: string;
  setName: string;
  currentName: string | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, pending]);

  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        {t('取り込み先にする')}
      </button>
      {open ? (
        <Portal>
          <div className="dialog-overlay" onClick={pending ? undefined : () => setOpen(false)}>
            <div
              className="dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="target-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <MoraBot mood="trouble" size={72} title="" />
                <div className="min-w-0">
                  <h2 id="target-title" className="text-lg font-semibold text-ink-900">
                    {t('回答ファイルの取り込み先を変更しますか？')}
                  </h2>
                  <p className="mt-1 text-sm text-ink-700">
                    {t(
                      'これ以降に「回答の取り込み」で読み込む回答ファイルは、すべて変更後の質問セットの設問として読み込まれます。ファイルと質問セットが合っていないと、回答が正しい設問に入りません。',
                    )}
                  </p>
                </div>
              </div>
              <div className="im-switch">
                <div>
                  <p className="im-switch-label">{t('現在')}</p>
                  <p className="im-switch-name">{currentName ?? t('（なし）')}</p>
                </div>
                <ArrowRight size={20} aria-hidden className="flex-none text-brand-500" />
                <div>
                  <p className="im-switch-label">{t('変更後')}</p>
                  <p className="im-switch-name im-switch-new">{setName}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  autoFocus
                >
                  {t('キャンセル')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await setDefaultSetAction(setId);
                      setOpen(false);
                    })
                  }
                >
                  {pending ? t('変更中…') : t('取り込み先を変更する')}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </>
  );
}
