'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { withBasePath } from '@/lib/base-path';
import type { GenerationJob } from '@/lib/sheet/generation-jobs';

/*
 * Progress of the background AI generation that follows an import
 * (lib/sheet/generation-jobs.ts). One poller is shared by everything on the
 * page: every 3 s while something is queued or running, every 15 s otherwise
 * (so work started from another tab still shows up).
 */

let jobs: GenerationJob[] = [];
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

const isActive = (job: GenerationJob) => job.status === 'queued' || job.status === 'running';

async function poll() {
  timer = null;
  try {
    const res = await fetch(withBasePath('/api/generation-status'), { cache: 'no-store' });
    if (res.ok) {
      jobs = ((await res.json()) as { jobs: GenerationJob[] }).jobs;
      listeners.forEach((l) => l());
    }
  } catch {
    // Offline for a moment: try again on the next tick.
  }
  if (listeners.size > 0) timer = setTimeout(poll, jobs.some(isActive) ? 3000 : 15000);
}

/** Check right away — e.g. just after an import has queued new work. */
export function refreshGenerationStatus() {
  if (timer) clearTimeout(timer);
  void poll();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) refreshGenerationStatus();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

const EMPTY: GenerationJob[] = [];
function useJobs() {
  return useSyncExternalStore(subscribe, () => jobs, () => EMPTY);
}

/**
 * Reloads the page's server data when a job finishes, so the list's counts
 * and the sheet's fields show the new text without a manual reload. While a
 * job for `personId` is running it also reloads every ~10 s, so fields fill
 * in as they are written.
 */
function useRefreshOnProgress(list: GenerationJob[], personId?: string) {
  const router = useRouter();
  const lastStatus = useRef(new Map<string, GenerationJob['status']>());
  const lastRefresh = useRef(0);

  useEffect(() => {
    let refresh = false;
    for (const job of list) {
      const before = lastStatus.current.get(job.personId);
      if (before && isActive({ ...job, status: before }) && !isActive(job)) refresh = true;
      lastStatus.current.set(job.personId, job.status);
    }
    const mine = personId ? list.find((j) => j.personId === personId) : undefined;
    if (mine?.status === 'running' && Date.now() - lastRefresh.current > 10_000) refresh = true;
    if (refresh) {
      lastRefresh.current = Date.now();
      router.refresh();
    }
  }, [list, personId, router]);
}

function Bar({ job }: { job: GenerationJob }) {
  const percent = job.total ? Math.round((job.done / job.total) * 100) : 0;
  return (
    <div className="progress !w-24" aria-hidden>
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

function jobLabel(job: GenerationJob) {
  if (job.status === 'queued') return '順番待ち';
  if (job.status === 'running') return job.total ? `${job.done} / ${job.total}項目` : '準備中…';
  if (job.status === 'error') return 'エラーで停止';
  return job.failed > 0 ? `完了（${job.failed}項目は失敗）` : '完了';
}

/** Summary card for the people list and the import screen. */
export function GenerationBanner() {
  const list = useJobs();
  useRefreshOnProgress(list);
  if (list.length === 0) return null;

  const active = list.filter(isActive);
  return (
    <div className="card mb-4 border-brand-200 px-5 py-3.5" role="status">
      <div className="flex flex-wrap items-center gap-2">
        {active.length > 0 ? <span className="ai-spinner" aria-hidden /> : null}
        <p className="font-bold text-ink-900">
          {active.length > 0
            ? `AIが文章を作成中です（残り${active.length}名）`
            : 'AIによる文章の作成が完了しました'}
        </p>
        {active.length > 0 ? (
          <p className="text-sm text-ink-500">
            1名あたり数分かかります。この画面を閉じても作成は続きます。
          </p>
        ) : null}
      </div>
      <ul className="mt-2.5 space-y-1.5">
        {list.map((job) => (
          <li key={job.personId} className="flex flex-wrap items-center gap-3 text-sm">
            <Link href={`/people/${job.personId}`} className="min-w-[10rem] font-semibold text-ink-900 hover:text-brand-500">
              {job.name}
            </Link>
            {job.status === 'running' || job.status === 'done' ? <Bar job={job} /> : null}
            <span
              className={`tabular ${
                job.status === 'error' || (job.status === 'done' && job.failed > 0)
                  ? 'text-[#b03a22]'
                  : job.status === 'done'
                    ? 'text-final-ink'
                    : 'text-ink-500'
              }`}
            >
              {job.status === 'done' && job.failed === 0 ? '✓ ' : ''}
              {jobLabel(job)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Small badge for a person's row in the list. */
export function GenerationRowBadge({ personId }: { personId: string }) {
  const job = useJobs().find((j) => j.personId === personId);
  if (!job || !isActive(job)) return null;
  return (
    <span className="badge badge-review badge-plain ml-2 align-middle">
      <span className="ai-spinner ai-spinner-sm" aria-hidden />
      {job.status === 'queued' ? 'AI 順番待ち' : `AI作成中 ${job.done}/${job.total || '…'}`}
    </span>
  );
}

/** Notice on a person's editing screen while their text is being written. */
export function GenerationNotice({ personId }: { personId: string }) {
  const list = useJobs();
  useRefreshOnProgress(list, personId);
  const job = list.find((j) => j.personId === personId);
  if (!job || !isActive(job)) return null;
  return (
    <div className="card flex flex-wrap items-center gap-3 border-brand-200 bg-brand-50 px-5 py-3" role="status">
      <span className="ai-spinner" aria-hidden />
      <p className="font-bold text-ink-900">
        {job.status === 'queued' ? 'AIによる文章作成の順番待ちです' : 'AIが文章を作成中です'}
      </p>
      {job.status === 'running' ? (
        <>
          <Bar job={job} />
          <span className="tabular text-sm text-ink-700">{jobLabel(job)}</span>
        </>
      ) : null}
      <p className="w-full text-sm text-ink-500">
        完了した項目から順に表示されます。作成中の項目は上書きされるため、完了するまで編集はお待ちください。
      </p>
    </div>
  );
}
