'use client';

import { useTransition } from 'react';
import { useT } from '@/lib/i18n/client';
import { setDefaultSetAction } from '@/app/(app)/admin/items/actions';

/** Makes a question set the one answer files are imported into. */
export function SetDefaultButton({ setId }: { setId: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-secondary"
      disabled={pending}
      onClick={() => startTransition(async () => void (await setDefaultSetAction(setId)))}
    >
      {pending ? t('変更中…') : t('取り込み先にする')}
    </button>
  );
}
