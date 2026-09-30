/**
 * Background AI generation for newly imported people.
 *
 * Generating every field of a new person with a capable model (Gemini Pro,
 * ~20 s a call, 50+ calls a person) takes minutes. Done inside the import
 * request, the import screen sat on 「取り込み中…」 with no sign of what was
 * happening (Sano-san's team, 2026-09-30). Now the import only queues the
 * work and returns at once; this queue runs it one person at a time (each
 * person's fields still go AI_CONCURRENCY at a time), and the screens poll
 * /api/generation-status to show progress.
 *
 * Kept in memory, not in the database: the app is a single long-running
 * process (`node server.js`), and a table would need a manual migration on the
 * server. The trade-off: a restart mid-run loses the queue — the fields
 * already written stay, the rest can be generated from the section's ⋯ menu.
 * `globalThis` so development hot-reloads do not lose it either.
 */

import { generateAllSections } from './fields';

export type GenerationJob = {
  personId: string;
  name: string;
  status: 'queued' | 'running' | 'done' | 'error';
  done: number;
  total: number;
  failed: number;
  error?: string;
  finishedAt?: number;
};

type QueueItem = { personId: string; versionId: string; userId: string };

type Store = { jobs: Map<string, GenerationJob>; queue: QueueItem[]; running: boolean };

const store: Store = ((globalThis as { __generationJobs?: Store }).__generationJobs ??= {
  jobs: new Map(),
  queue: [],
  running: false,
});

/** How long a finished job stays listed, so screens can show 「完了」. */
const KEEP_FINISHED_MS = 10 * 60_000;

export function enqueueGeneration(item: QueueItem & { name: string }): void {
  const existing = store.jobs.get(item.personId);
  if (existing && (existing.status === 'queued' || existing.status === 'running')) return;

  store.jobs.set(item.personId, {
    personId: item.personId,
    name: item.name,
    status: 'queued',
    done: 0,
    total: 0,
    failed: 0,
  });
  store.queue.push({ personId: item.personId, versionId: item.versionId, userId: item.userId });
  void drain();
}

/** Queued, running, and recently finished jobs. */
export function listGenerationJobs(): GenerationJob[] {
  const now = Date.now();
  for (const [id, job] of store.jobs) {
    if (job.finishedAt && now - job.finishedAt > KEEP_FINISHED_MS) store.jobs.delete(id);
  }
  return [...store.jobs.values()];
}

async function drain(): Promise<void> {
  if (store.running) return;
  store.running = true;
  try {
    for (let item = store.queue.shift(); item; item = store.queue.shift()) {
      const job = store.jobs.get(item.personId);
      if (!job) continue;
      job.status = 'running';
      try {
        const outcome = await generateAllSections({
          versionId: item.versionId,
          personId: item.personId,
          userId: item.userId,
          // An import derives the sheet from the form, so a field that comes
          // back empty starts unticked and the operator ticks it by hand.
          displayFromValue: true,
          onProgress: (done, total) => {
            job.done = done;
            job.total = total;
          },
        });
        job.failed = outcome.failed;
        job.status = 'done';
      } catch (error) {
        job.status = 'error';
        job.error = (error as Error).message;
        console.error(`[generation] ${item.personId}:`, error);
      }
      job.finishedAt = Date.now();
    }
  } finally {
    store.running = false;
  }
}
