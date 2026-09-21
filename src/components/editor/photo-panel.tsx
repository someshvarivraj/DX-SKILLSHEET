'use client';

import { startTransition, useRef, useState } from 'react';
import { PHOTO_ACCEPT_ATTR, PHOTO_MAX_BYTES } from '@/lib/photo';
import {
  removePhotoAction,
  uploadPhotoAction,
} from '@/app/(app)/people/[personId]/actions';

/**
 * The 写真 box, filled from this screen.
 *
 * The photo is shown at the proportions the printed sheet uses, so what an
 * operator approves here is what appears on the PDF rather than a differently
 * cropped preview.
 */
export function PhotoPanel({
  personId,
  photoUrl,
  readOnly = false,
}: {
  personId: string;
  photoUrl: string | null;
  readOnly?: boolean;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Shown immediately after choosing a file, so the operator sees what they
  // picked without waiting for the round trip.
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = (work: () => Promise<{ ok: boolean; message?: string }>) => {
    setNotice(null);
    setError(null);
    setPending(true);
    startTransition(async () => {
      const result = await work();
      setPending(false);
      if (result.ok) setNotice(result.message ?? null);
      else setError(result.message ?? '処理できなかった');
    });
  };

  const onChoose = (file: File | null) => {
    if (!file) return;
    if (file.size > PHOTO_MAX_BYTES) {
      // Caught here as well as on the server, so an oversized file is refused
      // before it is uploaded rather than after.
      setPreview(null);
      setError(`写真は${Math.round(PHOTO_MAX_BYTES / 1024 / 1024)}MBまで登録できる`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setPreview(URL.createObjectURL(file));
    const data = new FormData();
    data.set('photo', file);
    run(async () => {
      const result = await uploadPhotoAction(personId, data);
      if (inputRef.current) inputRef.current.value = '';
      if (!result.ok) setPreview(null);
      return result;
    });
  };

  const shown = preview ?? photoUrl;

  return (
    <div className="card overflow-hidden">
      <header className="panel-head" style={{ '--accent': '#3D5A8A', '--accent-tint': '#EAEFF7' } as React.CSSProperties}>
        <span className="panel-title">写真</span>
        <span className="panel-title-en">Photo</span>
      </header>

      <div className="flex flex-wrap items-start gap-4 border-t border-ink-100 p-4">
        {/* 30mm × 40mm, the proportion the printed sheet reserves. */}
        <div
          className="grid w-[120px] shrink-0 place-items-center overflow-hidden rounded-md border border-dashed border-ink-200 bg-sand-50"
          style={{ aspectRatio: '3 / 4' }}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="登録されている写真" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-ink-400">未登録</span>
          )}
        </div>

        <div className="min-w-[16rem] flex-1">
          <p className="field-hint">
            スキルシートの右上に表示されます。JPEGまたはPNG、
            {Math.round(PHOTO_MAX_BYTES / 1024 / 1024)}MBまで。縦長（3:4）の写真が最もきれいに収まります。
          </p>

          {!readOnly ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept={PHOTO_ACCEPT_ATTR}
                className="input mt-3 w-auto"
                disabled={pending}
                onChange={(e) => onChoose(e.target.files?.[0] ?? null)}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={pending}
                  onClick={() => inputRef.current?.click()}
                >
                  {photoUrl ? '写真を差し替える' : '写真を選ぶ'}
                </button>
                {photoUrl ? (
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={pending}
                    onClick={() => {
                      setPreview(null);
                      run(() => removePhotoAction(personId));
                    }}
                  >
                    写真を外す
                  </button>
                ) : null}
                {pending ? <span className="text-xs text-ink-500">登録中…</span> : null}
              </div>
            </>
          ) : (
            <p className="field-hint mt-2">写真を変更する権限がありません。</p>
          )}

          {notice ? (
            <p className="mt-2 rounded-lg border border-final-line bg-final-bg px-3 py-1.5 text-xs text-final-ink">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 rounded-lg border border-accent-500/35 bg-accent-50 px-3 py-1.5 text-xs text-[#b03a22]">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
