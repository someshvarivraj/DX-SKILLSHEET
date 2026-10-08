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
 * The progress shown on screen lives in memory (`globalThis`, so development
 * hot-reloads keep it). The list of people still to do is also saved in the
 * settings table: every deployment restarts the app, and a queue kept only in
 * memory was lost then — 10 people imported, 4 written, 6 never started
 * (2026-10-08). After a restart the saved list is picked up again, and only
 * fields not yet written are generated, so nothing already written or edited
 * is replaced.
 */

import { prisma } from '@/lib/db';
import { generateAllSections } from './fields';
import { getEditableVersion, getOrCreateSkillSheet } from './version';

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

type QueueItem = { personId: string; name: string; userId: string; onlyMissing?: boolean };

type Store = {
  jobs: Map<string, GenerationJob>;
  queue: QueueItem[];
  running: boolean;
  /** Everyone queued or running — what is saved, and resumed after a restart. */
  pending: Map<string, QueueItem>;
  resumed: boolean;
};

const store: Store = ((globalThis as { __generationJobs?: Store }).__generationJobs ??= {
  jobs: new Map(),
  queue: [],
  running: false,
  pending: new Map(),
  resumed: false,
});

const SETTING_KEY = 'generation.pending';

async function savePending(): Promise<void> {
  const value = [...store.pending.values()];
  await prisma.setting
    .upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value, note: 'AIの文章作成を待っている人（再起動後に再開する）' },
      update: { value },
    })
    .catch((error) => console.error('[generation] could not save the queue:', error));
}

/**
 * Pick up the people left over from before a restart. Called once per process,
 * at start-up (src/instrumentation.ts) and again by the progress endpoint as a
 * safety net; only the first call does anything.
 */
export async function resumeGenerationQueue(): Promise<void> {
  if (store.resumed) return;
  store.resumed = true;
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } }).catch(() => null);
  const saved = Array.isArray(row?.value) ? (row.value as QueueItem[]) : [];
  for (const item of saved) {
    if (item?.personId && item.userId) enqueueGeneration({ ...item, onlyMissing: true });
  }
  if (saved.length > 0) console.log(`[generation] resumed ${saved.length} after a restart`);
}

/** How long a finished job stays listed, so screens can show 「完了」. */
const KEEP_FINISHED_MS = 10 * 60_000;

export function enqueueGeneration(item: QueueItem & { versionId?: string }): void {
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
  const queued: QueueItem = { personId: item.personId, name: item.name, userId: item.userId, onlyMissing: item.onlyMissing };
  store.queue.push(queued);
  store.pending.set(item.personId, queued);
  void savePending();
  void drain();
}

/** Queued, running, and recently finished jobs. */
/** Whether this person's text is queued or being written right now. */
export function isGenerating(personId: string): boolean {
  const job = store.jobs.get(personId);
  return Boolean(job && (job.status === 'queued' || job.status === 'running'));
}

export function listGenerationJobs(): GenerationJob[] {
  void resumeGenerationQueue();
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
        // The version to write into is found now, not when queued: after a
        // restart, or once the sheet was finalised meanwhile, it may differ.
        const sheet = await getOrCreateSkillSheet(item.personId);
        const version = await getEditableVersion(sheet.id, item.userId);
        const outcome = await generateAllSections({
          versionId: version.id,
          personId: item.personId,
          userId: item.userId,
          onlyMissing: item.onlyMissing,
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
      store.pending.delete(item.personId);
      await savePending();
    }
  } finally {
    store.running = false;
  }
}

/**
 * People whose text was never written although they have answered: their
 * generation was lost (before the queue was saved) or never started. The
 * people list offers to start it for them.
 */
export async function findStalledPeople(): Promise<Array<{ personId: string; name: string }>> {
  const people = await prisma.person.findMany({
    where: { isActive: true, itemResponses: { some: { status: 'SUBMITTED' } } },
    select: {
      id: true,
      fullNameEnglish: true,
      fullNameKatakana: true,
      skillSheet: { select: { currentVersionId: true } },
    },
  });
  const versionIds = people.map((p) => p.skillSheet?.currentVersionId).filter((id): id is string => Boolean(id));
  const written = new Set(
    (
      await prisma.fieldValue.groupBy({ by: ['versionId'], where: { versionId: { in: versionIds } } })
    ).map((g) => g.versionId),
  );
  return people
    .filter((p) => !isGenerating(p.id))
    .filter((p) => !p.skillSheet?.currentVersionId || !written.has(p.skillSheet.currentVersionId))
    .map((p) => ({ personId: p.id, name: p.fullNameKatakana ?? p.fullNameEnglish }));
}
