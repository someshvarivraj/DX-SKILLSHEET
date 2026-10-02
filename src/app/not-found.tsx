import Link from 'next/link';
import { MoraBot } from '@/components/morabot';
import { getT } from '@/lib/i18n/server';

/** Shown for any address that does not exist (and for pages a user may not see). */
export default async function NotFound() {
  const t = await getT();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-sand-100 px-4 text-center">
      <MoraBot mood="trouble" size={140} />
      <h1 className="mt-6 text-xl font-semibold text-ink-900">{t('ページが見つかりません')}</h1>
      <p className="mt-2 text-sm text-ink-500">
        {t('アドレスが間違っているか、このページを表示する権限がありません。')}
      </p>
      <Link href="/" className="btn btn-primary mt-6">
        {t('トップへ戻る')}
      </Link>
    </main>
  );
}
