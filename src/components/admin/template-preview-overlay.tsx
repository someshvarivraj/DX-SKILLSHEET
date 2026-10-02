'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { withBasePath } from '@/lib/base-path';
import { useT } from '@/lib/i18n/client';

/**
 * The template preview, opened on the same page rather than navigating away
 * (Sano-san's review, 2026-09-28 for one section, 2026-09-29 for the whole
 * sheet): a panel over the current screen, closed by the × button, the
 * backdrop, or Esc.
 *
 * Without `sectionCode` it shows the whole sheet. `embed=1` tells the preview
 * page it is inside this panel, so it leaves out its own 「項目定義に戻る」
 * link — following it would load the whole app inside the panel.
 */
export function TemplatePreviewOverlay({
  sectionCode,
  title,
  onClose,
}: {
  sectionCode?: string;
  title: string;
  onClose: () => void;
}) {
  const t = useT();
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const query = new URLSearchParams({ embed: '1' });
  if (sectionCode) query.set('section', sectionCode);

  return (
    <div className="def-preview-overlay" onClick={onClose}>
      <div className="def-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="def-preview-modal-bar">
          <span className="text-sm font-medium text-ink-900">{title}</span>
          <span className="flex-1" />
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label={t('プレビューを閉じる')}
            title={t('閉じる（Escキーでも閉じる）')}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <iframe
          src={withBasePath(`/admin/fields/preview?${query}`)}
          title={title}
          className="def-preview-frame"
          allow="fullscreen"
        />
      </div>
    </div>
  );
}

/** The 「シートの見本を見る」 button on the field-definition screen. */
export function TemplatePreviewButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        {t('シートの見本を見る')}
      </button>
      {open ? (
        <TemplatePreviewOverlay title={t('シートの見本')} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
