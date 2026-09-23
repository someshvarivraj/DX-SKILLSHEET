import { recordAudit } from '@/lib/audit';
import { destroySession, getCurrentUser } from '@/lib/auth/session';
import { redirectToPath } from '@/lib/redirect';

export async function POST() {
  const user = await getCurrentUser();
  if (user) await recordAudit({ userId: user.id, action: 'auth.logout' });
  await destroySession();
  return redirectToPath('/login');
}
