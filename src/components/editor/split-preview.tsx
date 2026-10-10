'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SECTION_SHOWN_EVENT } from './section-tabs';
import { Maximize2, Minimize2, RefreshCw, SplitSquareHorizontal, X } from 'lucide-react';
import { withBasePath } from '@/lib/base-path';
import { useT } from '@/lib/i18n/client';

type Mode = 'hidden' | 'split' | 'max';

/**
 * Side-by-side preview for the person editor, opened and closed like a side
 * panel: 並べて表示 opens it next to the editor, 最大化 expands it to take the
 * whole width (the editor is not unmounted, only hidden, so its scroll
 * position and open tab are not lost), 元に戻す returns to side-by-side, and
 * 閉じる closes it. Sano-san's review (2026-09-25): she wanted this to behave
 * like a side panel that opens, maximises and minimises, rather than a
 * separate page to navigate to and back from.
 *
 * The preview itself is the real preview page in an iframe, not a second
 * renderer — one HTML source for what prints (§11.2) stays true here too.
 * Saved edits do not push into the iframe on their own (it is a separate
 * document), so the panel has its own 更新 button to reload it.
 *
 * Sano-san (2026-10-10): the editor and the preview each scroll on their own
 * (as well as the page), and the preview follows the editor — clicking into a
 * field, or choosing a section tab, brings the same place into view in the
 * preview and marks it briefly. The sheet marks its parts with data-section,
 * data-field and data-record (sheet-document.tsx) for this.
 */

type Target = { section?: string; field?: string; record?: string };

/** The part of the printed sheet that shows this field, record or section. */
function findInSheet(doc: Document, target: Target): HTMLElement | null {
  const q = (selector: string) => doc.querySelector<HTMLElement>(selector);
  const esc = (v: string) => CSS.escape(v);
  return (
    (target.field && target.record
      ? q(`[data-record="${esc(target.record)}"][data-field="${esc(target.field)}"]`)
      : null) ??
    (target.field && !target.record ? q(`[data-field="${esc(target.field)}"]`) : null) ??
    (target.record ? q(`[data-record="${esc(target.record)}"]`) : null) ??
    (target.section ? q(`[data-section="${esc(target.section)}"]`) : null)
  );
}

/** A short orange outline on the part just brought into view. */
function flash(doc: Document, el: HTMLElement) {
  if (!doc.getElementById('sync-flash-style')) {
    const style = doc.createElement('style');
    style.id = 'sync-flash-style';
    style.textContent =
      '.sync-flash{outline:3px solid #e8710a;outline-offset:-2px;transition:outline-color .8s}.sync-flash-out{outline-color:transparent}';
    doc.head.appendChild(style);
  }
  el.classList.remove('sync-flash', 'sync-flash-out');
  el.classList.add('sync-flash');
  setTimeout(() => el.classList.add('sync-flash-out'), 900);
  setTimeout(() => el.classList.remove('sync-flash', 'sync-flash-out'), 1800);
}
export function SplitPreview({
  personId,
  tab,
  preset,
  refreshKey,
  children,
}: {
  personId: string;
  tab: string | null;
  preset: string | null;
  /** Changes when the sheet's content changes; the open preview then reloads. */
  refreshKey?: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const [mode, setMode] = useState<Mode>('hidden');
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const lastTarget = useRef<Target | null>(tab ? { section: tab } : null);

  // While the preview is open beside the editor, the editor's own toolbar
  // shrinks to one row (html[data-split], see globals.css) — the point of
  // this mode is the form and the sheet side by side, not the controls.
  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'hidden') delete root.dataset.split;
    else root.dataset.split = mode;
    return () => {
      delete root.dataset.split;
    };
  }, [mode]);

  // embed=1: the preview page drops its heading and extra buttons and shows
  // only the sheet with a small zoom bar.
  const query = new URLSearchParams({ embed: '1' });
  if (preset) query.set('preset', preset);
  if (tab) query.set('tab', tab);
  // A raw iframe src — Next's basePath rewriting only applies to next/link
  // and router navigation, not to this.
  const previewSrc = withBasePath(`/people/${personId}/preview${query.size > 0 ? `?${query}` : ''}`);

  // Reload the open preview when the sheet changes (a value saved, the photo
  // uploaded), keeping the reader where they were on the page.
  const lastKey = useRef(refreshKey);
  const keepScroll = useRef<number | null>(null);
  useEffect(() => {
    if (refreshKey === lastKey.current) return;
    lastKey.current = refreshKey;
    if (mode === 'hidden') return;
    keepScroll.current = previewScroller()?.scrollTop ?? null;
    setReloadKey((k) => k + 1);
    // `mode` deliberately left out: opening the panel is not a content change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  /** The scrolling area inside the preview page (preview-stage.tsx). */
  const previewScroller = () =>
    iframeRef.current?.contentDocument?.querySelector<HTMLElement>('[data-preview-scroll]') ?? null;

  /** Bring a field, record or section into view in the preview. */
  const showInPreview = useCallback((target: Target, smooth = true) => {
    lastTarget.current = target;
    const doc = iframeRef.current?.contentDocument;
    const scroller = doc?.querySelector<HTMLElement>('[data-preview-scroll]');
    if (!doc || !scroller) return;
    const el = findInSheet(doc, target);
    if (!el) return; // not printed (empty, or switched off): stay where it is
    const top = scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 48;
    scroller.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    flash(doc, el);
  }, []);

  // Follow the editor: a field clicked into, or a section tab chosen.
  useEffect(() => {
    if (mode !== 'split') return;
    const editor = editorRef.current;
    const onFocus = (event: FocusEvent) => {
      const block = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-field-anchor]');
      if (!block) return;
      showInPreview({
        section: block.dataset.sectionCode,
        field: block.dataset.fieldCode,
        record: block.dataset.recordId,
      });
    };
    const onSection = (event: Event) => {
      const section = (event as CustomEvent<{ section: string }>).detail?.section;
      if (section) showInPreview({ section });
    };
    editor?.addEventListener('focusin', onFocus);
    window.addEventListener(SECTION_SHOWN_EVENT, onSection);
    return () => {
      editor?.removeEventListener('focusin', onFocus);
      window.removeEventListener(SECTION_SHOWN_EVENT, onSection);
    };
  }, [mode, showInPreview]);

  const restoreScroll = () => {
    const top = keepScroll.current;
    if (top === null) {
      // A fresh load: open where the editor is (the current section or field).
      const target = lastTarget.current;
      if (target) setTimeout(() => showInPreview(target, false), 200);
      return;
    }
    keepScroll.current = null;
    // The page fits itself to the panel after load; restore after that.
    setTimeout(() => {
      const scroller = previewScroller();
      if (scroller) scroller.scrollTop = top;
    }, 150);
  };

  const reload = () => {
    // Changing the src (even to the same value) does not reload an iframe;
    // re-navigating its own window does.
    iframeRef.current?.contentWindow?.location.replace(previewSrc);
    setReloadKey((k) => k + 1);
  };

  if (mode === 'hidden') {
    return (
      <>
        {children}
        <button
          type="button"
          className="split-preview-fab"
          onClick={() => setMode('split')}
          title={t('プレビューを並べて表示する')}
        >
          <SplitSquareHorizontal size={16} aria-hidden />
          {t('プレビューを並べて表示')}
        </button>
      </>
    );
  }

  return (
    <div className={`split-preview ${mode === 'max' ? 'split-preview-max' : ''}`}>
      {/* Hidden with CSS rather than removed, so maximising the preview and
          coming back does not lose the editor's scroll position or open tab. */}
      <div ref={editorRef} className={mode === 'max' ? 'hidden' : 'split-preview-editor'}>
        {children}
      </div>
      <div className="split-preview-panel">
        <div className="split-preview-panel-bar">
          <span className="text-xs font-medium text-ink-700">{t('プレビュー')}</span>
          <span className="flex-1" />
          <button
            type="button"
            className="icon-btn"
            onClick={reload}
            title={t('編集内容を反映して更新する')}
            aria-label={t('プレビューを更新する')}
          >
            <RefreshCw size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMode(mode === 'max' ? 'split' : 'max')}
            title={mode === 'max' ? t('並べて表示に戻す') : t('最大化する')}
            aria-label={mode === 'max' ? t('並べて表示に戻す') : t('プレビューを最大化する')}
          >
            {mode === 'max' ? <Minimize2 size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMode('hidden')}
            title={t('プレビューを閉じる')}
            aria-label={t('プレビューを閉じる')}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <iframe
          key={reloadKey}
          ref={iframeRef}
          src={previewSrc}
          title={t('スキルシートのプレビュー')}
          className="split-preview-frame"
          onLoad={restoreScroll}
          allow="fullscreen"
        />
      </div>
    </div>
  );
}
