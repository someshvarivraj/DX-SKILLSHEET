/**
 * Profile photos.
 *
 * The sheet reserves a 写真 box and the PDF embeds whatever is stored, so this
 * is the one place that decides what may be stored there: the accepted types,
 * the size limit, and the key each person's photo lives under.
 */

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** What a browser's file picker should offer, and what the server accepts. */
export const PHOTO_ACCEPT = ['image/jpeg', 'image/png'] as const;
export const PHOTO_ACCEPT_ATTR = 'image/jpeg,image/png';

export type PhotoRejection = { ok: false; message: string };
export type PhotoAcceptance = { ok: true; extension: 'jpg' | 'png' };

/**
 * Decide whether an uploaded file may be stored.
 *
 * The browser's reported type is checked against the file's own magic bytes,
 * because the type on an upload is whatever the client chose to send. A file
 * that claims to be a JPEG and is not would be embedded in a customer-facing
 * PDF, so it is refused rather than trusted.
 */
export function checkPhoto(
  declaredType: string,
  bytes: Uint8Array,
): PhotoAcceptance | PhotoRejection {
  if (!(PHOTO_ACCEPT as readonly string[]).includes(declaredType)) {
    return { ok: false, message: '写真はJPEGまたはPNGのみ登録できる' };
  }
  if (bytes.byteLength === 0) {
    return { ok: false, message: 'ファイルが空である' };
  }
  if (bytes.byteLength > PHOTO_MAX_BYTES) {
    const mb = Math.round(PHOTO_MAX_BYTES / 1024 / 1024);
    return { ok: false, message: `写真は${mb}MBまで登録できる` };
  }

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;

  if (declaredType === 'image/jpeg' && !isJpeg) {
    return { ok: false, message: 'JPEGとして読み取れないファイルである' };
  }
  if (declaredType === 'image/png' && !isPng) {
    return { ok: false, message: 'PNGとして読み取れないファイルである' };
  }
  return { ok: true, extension: isPng ? 'png' : 'jpg' };
}

/**
 * Where a person's photo is stored.
 *
 * The timestamp makes each upload a new key, so a replaced photo is never
 * served from a cache under the old address.
 */
export function buildPhotoKey(personId: string, extension: 'jpg' | 'png'): string {
  return `photos/${personId}/${Date.now()}.${extension}`;
}
