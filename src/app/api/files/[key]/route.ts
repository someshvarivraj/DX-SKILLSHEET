import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { canAccessPerson, can } from '@/lib/auth/permissions';
import { getStorage } from '@/lib/storage';
import { personIdForStorageKey } from '@/lib/storage-keys';

export const runtime = 'nodejs';

/**
 * Serves stored files — profile photos and exported PDFs.
 *
 * Being signed in is not enough. Every key belongs to one person, so the key is
 * resolved back to that person and checked against the caller: otherwise any
 * signed-in user, including the read-only demo account, could fetch another
 * recruit's finalised PDF by guessing or reusing a key.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string }> },
) {
  const user = await requireUser();
  const { key } = await context.params;
  const decoded = decodeURIComponent(key);

  const owner = await personIdForStorageKey(decoded);
  if (!owner) {
    return NextResponse.json({ error: '不正なファイルキーである' }, { status: 400 });
  }
  if (!canAccessPerson(user, owner.personId)) {
    return NextResponse.json({ error: 'このファイルを閲覧する権限がない' }, { status: 403 });
  }
  // An export is the finished skill sheet; only roles that may export it may
  // re-download it.
  if (owner.kind === 'export' && !can(user, 'sheet.export')) {
    return NextResponse.json({ error: 'このファイルを閲覧する権限がない' }, { status: 403 });
  }

  try {
    const buffer = await getStorage().get(decoded);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': owner.contentType,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'ファイルが見つからない' }, { status: 404 });
  }
}
