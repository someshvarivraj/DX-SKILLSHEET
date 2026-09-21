import { describe, expect, it } from 'vitest';
import { buildPhotoKey, checkPhoto, PHOTO_MAX_BYTES } from '../src/lib/photo';

const jpeg = (size = 64) => {
  const b = new Uint8Array(size);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return b;
};
const png = (size = 64) => {
  const b = new Uint8Array(size);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return b;
};

describe('写真の受け入れ判定', () => {
  it('JPEGとPNGを受け入れ、拡張子を返す', () => {
    expect(checkPhoto('image/jpeg', jpeg())).toEqual({ ok: true, extension: 'jpg' });
    expect(checkPhoto('image/png', png())).toEqual({ ok: true, extension: 'png' });
  });

  it('対応していない種類を断る', () => {
    const result = checkPhoto('image/gif', jpeg());
    expect(result.ok).toBe(false);
  });

  it('申告された種類と中身が食い違うファイルを断る', () => {
    // The type on an upload is whatever the client chose to send. A file that
    // claims to be a JPEG and is not would be embedded in a customer-facing
    // PDF, so the magic bytes decide.
    expect(checkPhoto('image/jpeg', png()).ok).toBe(false);
    expect(checkPhoto('image/png', jpeg()).ok).toBe(false);
    expect(checkPhoto('image/jpeg', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])).ok).toBe(false);
  });

  it('空のファイルと大きすぎるファイルを断る', () => {
    expect(checkPhoto('image/jpeg', new Uint8Array(0)).ok).toBe(false);
    expect(checkPhoto('image/jpeg', jpeg(PHOTO_MAX_BYTES + 1)).ok).toBe(false);
    expect(checkPhoto('image/jpeg', jpeg(PHOTO_MAX_BYTES)).ok).toBe(true);
  });
});

describe('写真の保存キー', () => {
  it('対象者ごとに分かれ、差し替えると別のキーになる', async () => {
    const first = buildPhotoKey('abc', 'jpg');
    expect(first.startsWith('photos/abc/')).toBe(true);
    expect(first.endsWith('.jpg')).toBe(true);
    await new Promise((r) => setTimeout(r, 2));
    // A replaced photo must not be served from a cache under the old address.
    expect(buildPhotoKey('abc', 'jpg')).not.toBe(first);
  });
});
