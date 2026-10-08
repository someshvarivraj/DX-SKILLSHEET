import { resumeGenerationQueue } from '@/lib/sheet/generation-jobs';

// Not while `next build` loads the app; a few seconds' grace after a real
// start, so the database is reachable.
if (process.env.NEXT_PHASE !== 'phase-production-build') {
  setTimeout(() => {
    resumeGenerationQueue().catch((error) => console.error('[generation] resume failed:', error));
  }, 5_000);
}
