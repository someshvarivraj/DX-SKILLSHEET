'use client';

import { useRef, useState } from 'react';
import { Maximize2, Minimize2, RefreshCw, SplitSquareHorizontal, X } from 'lucide-react';

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
 */
export function SplitPreview({
  personId,
  tab,
  preset,
  children,
}: {
  personId: string;
  tab: string | null;
  preset: string | null;
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<Mode>('hidden');
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const query = new URLSearchParams();
  if (preset) query.set('preset', preset);
  if (tab) query.set('tab', tab);
  const previewSrc = `/people/${personId}/preview${query.size > 0 ? `?${query}` : ''}`;

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
          title="プレビューを並べて表示する"
        >
          <SplitSquareHorizontal size={16} aria-hidden />
          プレビューを並べて表示
        </button>
      </>
    );
  }

  return (
    <div className={`split-preview ${mode === 'max' ? 'split-preview-max' : ''}`}>
      {/* Hidden with CSS rather than removed, so maximising the preview and
          coming back does not lose the editor's scroll position or open tab. */}
      <div className={mode === 'max' ? 'hidden' : 'split-preview-editor'}>{children}</div>
      <div className="split-preview-panel">
        <div className="split-preview-panel-bar">
          <span className="text-xs font-semibold text-ink-700">プレビュー</span>
          <span className="flex-1" />
          <button
            type="button"
            className="icon-btn"
            onClick={reload}
            title="編集内容を反映して更新する"
            aria-label="プレビューを更新する"
          >
            <RefreshCw size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMode(mode === 'max' ? 'split' : 'max')}
            title={mode === 'max' ? '並べて表示に戻す' : '最大化する'}
            aria-label={mode === 'max' ? '並べて表示に戻す' : 'プレビューを最大化する'}
          >
            {mode === 'max' ? <Minimize2 size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMode('hidden')}
            title="プレビューを閉じる"
            aria-label="プレビューを閉じる"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <iframe
          key={reloadKey}
          ref={iframeRef}
          src={previewSrc}
          title="スキルシートのプレビュー"
          className="split-preview-frame"
          allow="fullscreen"
        />
      </div>
    </div>
  );
}
