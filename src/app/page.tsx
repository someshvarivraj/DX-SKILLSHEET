import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role === 'ENGINEER') redirect('/my-sheet');
  redirect('/people');
}
