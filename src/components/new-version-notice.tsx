'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { withBasePath } from '@/lib/base-path';

const MY_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? '';

/**
 * A bar asking to reload when the server has been redeployed since this page
 * was opened. Until reloaded, the page's actions (save, 確認, …) point at code
 * that no longer exists and fail — checking now avoids that.
 */
export function NewVersionNotice() {
  const t = useT();
  const [stale, setStale] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!MY_BUILD) return;
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(withBasePath('/api/version'), { cache: 'no-store' });
        const { build } = (await res.json()) as { build: string };
        if (!cancelled && build && build !== MY_BUILD) setStale(true);
      } catch {
        // Offline or restarting: try again later.
      }
    };
    check();
    const timer = setInterval(check, 60_000);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  if (!stale || dismissed) return null;
  return (
    <div className="new-version" role="alert">
      <span>{t('新しいバージョンに更新されました。保存していない入力があればコピーしてから、再読み込みしてください。')}</span>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
        <RefreshCw size={14} aria-hidden /> {t('再読み込み')}
      </button>
      <button type="button" className="icon-btn" onClick={() => setDismissed(true)} aria-label={t('閉じる')} title={t('閉じる')}>
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
