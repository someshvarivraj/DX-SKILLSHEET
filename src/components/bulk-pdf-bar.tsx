'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { withBasePath } from '@/lib/base-path';
import { MoraBotProgress } from '@/components/morabot';
import { useT } from '@/lib/i18n/client';

const FORM_ID = 'bulk-pdf';

/**
 * Several people's PDFs in one ZIP (spec §11.4). The checkboxes live in the
 * people table (form="bulk-pdf"); this bar counts them, downloads the ZIP and
 * shows that the PDFs are being made — one person takes a few seconds.
 */
export function BulkPdfBar() {
  const t = useT();
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const boxes = () =>
    Array.from(document.querySelectorAll<HTMLInputElement>(`input[form="${FORM_ID}"][name="id"]`));

  useEffect(() => {
    const update = () => setCount(boxes().filter((b) => b.checked).length);
    document.addEventListener('change', update);
    update();
    return () => document.removeEventListener('change', update);
  }, []);

  const selectAll = (on: boolean) => {
    for (const b of boxes()) if (!b.disabled) b.checked = on;
    setCount(boxes().filter((b) => b.checked).length);
  };

  const download = async () => {
    const ids = boxes().filter((b) => b.checked).map((b) => b.value);
    if (ids.length === 0) return;
    setBusy(ids.length);
    setError(null);
    try {
      const params = new URLSearchParams();
      for (const id of ids) params.append('id', id);
      const res = await fetch(withBasePath(`/api/people/pdf-bulk?${params}`), { headers: { Accept: 'application/zip' } });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? t('PDFを出力できませんでした'));
        return;
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'skillsheets.zip';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError(t('PDFを出力できませんでした'));
    } finally {
      setBusy(0);
    }
  };

  return (
    <form id={FORM_ID} className="bulk-pdf" onSubmit={(e) => { e.preventDefault(); void download(); }}>
      <span className="text-sm text-ink-700">
        {count > 0 ? t('{n}人を選択中', { n: count }) : t('確定済みの人を選ぶと、PDFをまとめてダウンロードできます')}
      </span>
      <button type="button" className="btn btn-quiet btn-sm" onClick={() => selectAll(count === 0)}>
        {count === 0 ? t('確定済みをすべて選択') : t('選択を解除')}
      </button>
      <span className="flex-1" />
      <button type="submit" className="btn btn-primary btn-sm" disabled={count === 0 || busy > 0}>
        <Download size={14} aria-hidden /> {t('選択した人のPDFをまとめてダウンロード（ZIP）')}
      </button>
      {busy > 0 ? (
        <div className="w-full">
          <MoraBotProgress
            label={t('{n}人分のPDFを作成しています…', { n: busy })}
            detail={t('1人あたり数秒かかります')}
          />
        </div>
      ) : null}
      {error ? <p className="w-full text-sm text-[#b03a22]">{t(error)}</p> : null}
    </form>
  );
}
