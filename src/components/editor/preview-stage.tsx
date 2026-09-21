'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** A4 width in CSS pixels: 210mm at the CSS reference of 96dpi. */
const A4_PX = (210 * 96) / 25.4;

const STEPS = [0.5, 0.65, 0.8, 1, 1.25, 1.5, 2];

/**
 * Ceiling for "fit to width".
 *
 * A true fit on a wide monitor lands around 170%, and at that size an A4 page
 * takes three screenfuls to read — larger type but more scrolling, which is not
 * a better reading experience. The fit stops here and leaves a margin instead.
 * The + button still goes to 200% for anyone who wants it.
 */
const MAX_FIT = 1.4;

/**
 * The preview stage: the sheet on its own, at a size the reader chooses.
 *
 * The sheet is A4, so on a wide monitor it occupies a narrow column with the
 * application's chrome all around it — which is the wrong emphasis for a screen
 * whose only job is to let someone read the finished document. This wraps it in
 * a stage that can be zoomed, fitted to the window, or taken fullscreen with
 * nothing else on screen.
 *
 * The sheet itself is rendered on the server and passed in as children, so the
 * preview and the PDF still come from the same component and the same
 * stylesheet (§11.2) — this only changes how large it is drawn.
 */
export function PreviewStage({
  children,
  toolbar,
}: {
  children: React.ReactNode;
  /** Buttons shown beside the zoom controls, e.g. 編集に戻る / PDFをダウンロード. */
  toolbar?: React.ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [pageHeight, setPageHeight] = useState(0);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [fitting, setFitting] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const fit = useCallback(() => {
    const area = areaRef.current;
    if (!area) return;
    // 32px of breathing room so the page is not flush against the edges.
    const next = (area.clientWidth - 32) / A4_PX;
    setZoom(Math.min(MAX_FIT, Math.max(0.35, next)));
  }, []);

  // Fit on mount and whenever the area changes size — entering fullscreen,
  // resizing the window, or the sidebar of the browser opening.
  useEffect(() => {
    if (!fitting) return;
    fit();
    const area = areaRef.current;
    if (!area) return;
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    return () => observer.disconnect();
  }, [fit, fitting]);

  // A transform does not affect layout, so the scaled page would overlap
  // whatever follows it. The page's own unscaled height is measured and the box
  // around it is given that height multiplied by the zoom.
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const measure = () => setPageHeight(page.getBoundingClientRect().height / zoomRef.current);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.requestFullscreen();
    } catch {
      // Some browsers refuse fullscreen outside a user gesture chain or in an
      // embedded context. The stage still works at any zoom, so there is
      // nothing to recover from — only the fullscreen part is unavailable.
      setIsFullscreen(false);
    }
  };

  const step = (direction: 1 | -1) => {
    setFitting(false);
    const index = STEPS.findIndex((s) => s >= zoom - 0.001);
    const next = STEPS[Math.min(STEPS.length - 1, Math.max(0, index + direction))];
    setZoom(next ?? zoom);
  };

  return (
    <div
      ref={stageRef}
      className={
        isFullscreen
          ? 'flex h-screen flex-col bg-ink-700'
          : 'card flex flex-col overflow-hidden'
      }
    >
      <div
        className={`flex flex-wrap items-center gap-2 px-3 py-2 ${
          isFullscreen
            ? 'border-b border-white/10 bg-ink-900 text-white'
            : 'border-b border-ink-100 bg-sand-50'
        }`}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => step(-1)}
            disabled={zoom <= STEPS[0]}
            aria-label="縮小"
            title="縮小"
          >
            −
          </button>
          <span className="tabular w-14 text-center text-xs font-semibold">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => step(1)}
            disabled={zoom >= STEPS[STEPS.length - 1]}
            aria-label="拡大"
            title="拡大"
          >
            ＋
          </button>
        </div>

        <button
          type="button"
          className={`btn ${fitting ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFitting(true)}
          title={`用紙の幅を画面に合わせる（最大${Math.round(MAX_FIT * 100)}%）`}
        >
          幅に合わせる
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setFitting(false);
            setZoom(1);
          }}
          title="実寸（100%）で表示する"
        >
          実寸
        </button>

        <span className="flex-1" />

        {isFullscreen ? (
          <span className="text-xs text-white/70">Escキーで全画面表示を終了する</span>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={toggleFullscreen}
          title="スキルシートだけを画面いっぱいに表示する"
        >
          {isFullscreen ? '全画面表示を終了' : '全画面表示'}
        </button>
        {isFullscreen ? null : toolbar}
      </div>

      <div
        ref={areaRef}
        className={`overflow-auto ${
          isFullscreen ? 'flex-1 bg-ink-700 p-4' : 'max-h-[80vh] bg-sand-200 p-4'
        }`}
      >
        {/* The scaled page. The outer box reserves the scaled height, because a
            transform does not affect layout and the page would otherwise
            overlap whatever follows it. */}
        <div
          style={{
            width: A4_PX * zoom,
            height: pageHeight ? pageHeight * zoom : undefined,
            margin: '0 auto',
          }}
        >
          <div
            ref={pageRef}
            style={{
              width: A4_PX,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
            className="bg-white shadow-lift"
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
