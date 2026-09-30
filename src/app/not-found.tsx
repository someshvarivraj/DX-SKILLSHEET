import Link from 'next/link';
import { MoraBot } from '@/components/morabot';

/** Shown for any address that does not exist (and for pages a user may not see). */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-sand-100 px-4 text-center">
      <MoraBot mood="trouble" size={140} />
      <h1 className="mt-6 text-xl font-bold text-ink-900">ページが見つかりません</h1>
      <p className="mt-2 text-sm text-ink-500">
        アドレスが間違っているか、このページを表示する権限がありません。
      </p>
      <Link href="/" className="btn btn-primary mt-6">
        トップへ戻る
      </Link>
    </main>
  );
}
