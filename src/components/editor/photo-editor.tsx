'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { Portal } from '@/components/ui/portal';
import { withBasePath } from '@/lib/base-path';
import { useT } from '@/lib/i18n/client';

/**
 * Adjust a profile photo before it goes on the sheet (Sano-san, 2026-10-11):
 * zoom and move it inside the 写真 frame, and optionally change the
 * background colour.
 *
 * Everything happens in the browser. The background is found with MediaPipe's
 * selfie segmenter, served by this app (scripts/copy-mediapipe.mjs), so the
 * photo is never sent anywhere to be processed. The result is the frame's
 * exact shape — the sheet's photo box is 98 × 124 — at five times that size.
 */

/** The sheet's photo box: 98 × 124 (sheet-document.tsx). */
const FRAME_W = 294;
const FRAME_H = 372;
const OUT_W = 490;
const OUT_H = 620;
const MAX_ZOOM = 4;
/** Larger photos are reduced to this for background work and storage. */
const WORK_MAX = 1600;

const BACKGROUNDS: Array<{ value: string | null; label: string }> = [
  { value: null, label: '元のまま' },
  { value: '#ffffff', label: '白' },
  { value: '#dcebf7', label: '水色' },
  { value: '#e3e5e8', label: 'グレー' },
];

type Segmenter = { segment: (image: HTMLCanvasElement) => SegResult; close: () => void };
type SegResult = {
  confidenceMasks?: Array<{ width: number; height: number; getAsFloat32Array: () => Float32Array }>;
  close: () => void;
};

let segmenterPromise: Promise<Segmenter> | null = null;
function loadSegmenter(): Promise<Segmenter> {
  segmenterPromise ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(withBasePath('/mediapipe/wasm'));
    return (await ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: withBasePath('/mediapipe/selfie_segmenter.tflite') },
      runningMode: 'IMAGE',
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    })) as unknown as Segmenter;
  })();
  segmenterPromise.catch(() => {
    segmenterPromise = null;
  });
  return segmenterPromise;
}

/** The photo, reduced if very large, on a canvas we can read and draw from. */
function toWorkCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const scale = Math.min(1, WORK_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** The person kept, everything else painted `colour`, with a soft edge. */
function recolour(source: HTMLCanvasElement, mask: Float32Array, maskW: number, maskH: number, colour: string) {
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, out.width, out.height);
  const px = image.data;
  const r = parseInt(colour.slice(1, 3), 16);
  const g = parseInt(colour.slice(3, 5), 16);
  const b = parseInt(colour.slice(5, 7), 16);
  for (let y = 0; y < out.height; y++) {
    const my = Math.min(maskH - 1, Math.floor((y * maskH) / out.height));
    for (let x = 0; x < out.width; x++) {
      const mx = Math.min(maskW - 1, Math.floor((x * maskW) / out.width));
      // Confidence 0.25–0.75 blends; below is background, above is the person.
      const a = Math.min(1, Math.max(0, (mask[my * maskW + mx]! - 0.25) / 0.5));
      const i = (y * out.width + x) * 4;
      px[i] = px[i]! * a + r * (1 - a);
      px[i + 1] = px[i + 1]! * a + g * (1 - a);
      px[i + 2] = px[i + 2]! * a + b * (1 - a);
    }
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('画像を作成できませんでした'))), 'image/jpeg', quality),
  );
}

export function PhotoEditor({
  source,
  onCancel,
  onSave,
}: {
  /** The photo to adjust: a chosen file, or the stored original's address. */
  source: Blob | string;
  onCancel: () => void;
  onSave: (photo: Blob, original: Blob) => void;
}) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [work, setWork] = useState<HTMLCanvasElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [background, setBackground] = useState<string | null>(null);
  const [mask, setMask] = useState<{ data: Float32Array; w: number; h: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // Load the photo. A load that is replaced or abandoned reports nothing.
  useEffect(() => {
    let current = true;
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      if (current) setWork(toWorkCanvas(img));
    };
    img.onerror = () => {
      if (current) setLoadError('写真を読み込めませんでした');
    };
    img.src = url;
    return () => {
      current = false;
      if (typeof source !== 'string') URL.revokeObjectURL(url);
    };
  }, [source]);

  // What is drawn: the photo, with its background recoloured if chosen.
  const [shown, setShown] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!work) return;
    setShown(background && mask ? recolour(work, mask.data, mask.w, mask.h, background) : work);
  }, [work, background, mask]);

  /** Size and position of the photo inside a frame `w` wide (cover, then zoom). */
  const placement = useCallback(
    (w: number, h: number) => {
      if (!shown) return null;
      const scale = Math.max(w / shown.width, h / shown.height) * zoom;
      const dw = shown.width * scale;
      const dh = shown.height * scale;
      const k = w / FRAME_W;
      // Kept inside the frame: no empty edge can be dragged into view.
      const maxX = (dw - w) / 2;
      const maxY = (dh - h) / 2;
      const x = Math.min(maxX, Math.max(-maxX, offset.x * k));
      const y = Math.min(maxY, Math.max(-maxY, offset.y * k));
      return { dx: (w - dw) / 2 + x, dy: (h - dh) / 2 + y, dw, dh };
    },
    [shown, zoom, offset],
  );

  // Draw the frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    const p = placement(FRAME_W, FRAME_H);
    if (!canvas || !shown || !p) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, FRAME_W, FRAME_H);
    ctx.drawImage(shown, p.dx, p.dy, p.dw, p.dh);
  }, [shown, placement]);

  // Keep the stored offset within what can be shown, so the next drag starts right.
  useEffect(() => {
    const p = placement(FRAME_W, FRAME_H);
    if (!p) return;
    const x = p.dx - (FRAME_W - p.dw) / 2;
    const y = p.dy - (FRAME_H - p.dh) / 2;
    if (Math.abs(x - offset.x) > 0.5 || Math.abs(y - offset.y) > 0.5) setOffset({ x, y });
  }, [placement, offset.x, offset.y]);

  const chooseBackground = async (value: string | null) => {
    if (!value || mask || !work) {
      setBackground(value);
      return;
    }
    setBusy(t('背景を判定しています…（初回は数秒かかります）'));
    try {
      const segmenter = await loadSegmenter();
      const result = segmenter.segment(work);
      const m = result.confidenceMasks?.[0];
      if (!m) throw new Error('no mask');
      setMask({ data: new Float32Array(m.getAsFloat32Array()), w: m.width, h: m.height });
      result.close();
      setBackground(value);
    } catch (error) {
      console.error('[photo] background detection failed', error);
      setBusy(null);
      setLoadError('背景を判定できませんでした。背景は元のままで保存できます。');
      return;
    }
    setBusy(null);
  };

  const save = async () => {
    if (!work || !shown) return;
    setBusy(t('保存しています…'));
    try {
      const out = document.createElement('canvas');
      out.width = OUT_W;
      out.height = OUT_H;
      const ctx = out.getContext('2d')!;
      const p = placement(OUT_W, OUT_H)!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, OUT_W, OUT_H);
      ctx.drawImage(shown, p.dx, p.dy, p.dw, p.dh);
      onSave(await canvasToBlob(out), await canvasToBlob(work, 0.92));
    } catch {
      setBusy(null);
      setLoadError('画像を作成できませんでした');
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y });
  };
  const onWheel = (e: React.WheelEvent) => {
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(1, z - e.deltaY * 0.0015)));
  };

  return (
    <Portal>
      <div className="dialog-overlay" role="presentation">
        <div className="dialog pe-dialog" role="dialog" aria-modal="true" aria-label={t('写真を調整する')}>
          <h2 className="pe-title">{t('写真を調整する')}</h2>
          <p className="pe-help">
            {t('写真をドラッグして位置を、スライダー（またはマウスホイール）で大きさを調整します。枠の中がそのままスキルシートに載ります。')}
          </p>

          <div className="pe-body">
            <div className="pe-frame">
              {work ? (
                <canvas
                  ref={canvasRef}
                  width={FRAME_W}
                  height={FRAME_H}
                  className="pe-canvas"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={() => (drag.current = null)}
                  onPointerCancel={() => (drag.current = null)}
                  onWheel={onWheel}
                  aria-label={t('写真の表示範囲')}
                />
              ) : (
                <span className="text-xs text-ink-400">{loadError ? t(loadError) : t('読み込み中…')}</span>
              )}
            </div>

            <div className="pe-controls">
              <label className="pe-label" htmlFor="pe-zoom">{t('大きさ')}</label>
              <div className="pe-zoom">
                <button type="button" className="icon-btn" aria-label={t('小さく')} onClick={() => setZoom((z) => Math.max(1, z - 0.1))}>
                  <ZoomOut size={16} aria-hidden />
                </button>
                <input
                  id="pe-zoom"
                  type="range"
                  min={1}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
                <button type="button" className="icon-btn" aria-label={t('大きく')} onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.1))}>
                  <ZoomIn size={16} aria-hidden />
                </button>
              </div>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  setZoom(1);
                  setOffset({ x: 0, y: 0 });
                }}
              >
                <RotateCcw size={14} aria-hidden /> {t('元の大きさ・位置に戻す')}
              </button>

              <p className="pe-label mt-4">{t('背景の色')}</p>
              <div className="pe-backgrounds" role="radiogroup" aria-label={t('背景の色')}>
                {BACKGROUNDS.map((bg) => (
                  <button
                    key={bg.label}
                    type="button"
                    role="radio"
                    aria-checked={background === bg.value}
                    className={`pe-bg ${background === bg.value ? 'pe-bg-on' : ''}`}
                    disabled={Boolean(busy) || !work}
                    onClick={() => void chooseBackground(bg.value)}
                  >
                    <span
                      className="pe-swatch"
                      style={bg.value ? { background: bg.value } : { background: 'linear-gradient(135deg,#fff 45%,#c9ced6 45%)' }}
                    />
                    {t(bg.label)}
                  </button>
                ))}
                <label className={`pe-bg ${background && !BACKGROUNDS.some((b) => b.value === background) ? 'pe-bg-on' : ''}`}>
                  <input
                    type="color"
                    className="pe-picker"
                    value={background ?? '#ffffff'}
                    disabled={Boolean(busy) || !work}
                    onChange={(e) => void chooseBackground(e.target.value)}
                  />
                  {t('その他の色')}
                </label>
              </div>
              <p className="pe-note">
                {t('背景の判定はこのパソコンの中で行い、写真を外部に送ることはありません。髪の毛先など、境目が不自然な場合は「元のまま」を選んでください。')}
              </p>
              {busy ? <p className="pe-busy">{busy}</p> : null}
              {loadError && work ? <p className="pe-error">{t(loadError)}</p> : null}
            </div>
          </div>

          <div className="pe-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={Boolean(busy)}>
              {t('キャンセル')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!work || Boolean(busy)}>
              {t('この写真を登録する')}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
