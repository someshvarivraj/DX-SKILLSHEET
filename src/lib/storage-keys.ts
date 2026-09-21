/**
 * Storage keys, and who each one belongs to.
 *
 * A key is the only thing the rest of the application passes around, and it
 * arrives back from the browser as a URL segment. Anything served by key has to
 * be traceable to a person, or "signed in" becomes the only barrier between one
 * recruit's finalised PDF and everybody else. The shape of a key is therefore
 * defined here, in one place, next to the code that reads it back.
 */

import { prisma } from '@/lib/db';

/** Exported skill sheets: `exports/<personId>/<timestamp>-<file name>.pdf`. */
export const EXPORT_PREFIX = 'exports';

export function buildExportKey(personId: string, fileName: string): string {
  return `${EXPORT_PREFIX}/${personId}/${Date.now()}-${fileName}`;
}

export type StorageKeyOwner = {
  personId: string;
  kind: 'export' | 'photo';
  contentType: string;
};

/**
 * Resolve a key to the person it belongs to, or null when it belongs to nobody.
 *
 * An export carries the person's id in the key itself. A photo does not — its
 * key is whatever was stored on the person record — so that case is answered by
 * the database rather than by parsing, and a key nobody holds resolves to null.
 */
export async function personIdForStorageKey(key: string): Promise<StorageKeyOwner | null> {
  const segments = key.split('/').filter(Boolean);

  if (segments[0] === EXPORT_PREFIX && segments.length >= 3) {
    const personId = segments[1];
    const exists = await prisma.person.findUnique({
      where: { id: personId },
      select: { id: true },
    });
    return exists ? { personId, kind: 'export', contentType: 'application/pdf' } : null;
  }

  const person = await prisma.person.findFirst({
    where: { photoKey: key },
    select: { id: true },
  });
  if (!person) return null;

  return {
    personId: person.id,
    kind: 'photo',
    contentType: /\.png$/i.test(key) ? 'image/png' : 'image/jpeg',
  };
}
