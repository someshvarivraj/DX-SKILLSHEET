import { NextResponse, type NextRequest } from 'next/server';
import { recordAudit } from '@/lib/audit';
import { destroySession, getCurrentUser } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (user) await recordAudit({ userId: user.id, action: 'auth.logout' });
  await destroySession();
  return NextResponse.redirect(new URL('/login', request.nextUrl.origin));
}
