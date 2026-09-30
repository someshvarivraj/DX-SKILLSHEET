import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { listGenerationJobs } from '@/lib/sheet/generation-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Progress of background AI generation (generation-jobs.ts), polled by the
 * people list, the import screen and the editing screen while work is running.
 * An engineer sees only their own sheet's job; nobody else's names leak to them.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const jobs = listGenerationJobs().filter(
    (job) => user.role !== 'ENGINEER' || job.personId === user.personId,
  );
  return NextResponse.json({ jobs }, { headers: { 'Cache-Control': 'no-store' } });
}
