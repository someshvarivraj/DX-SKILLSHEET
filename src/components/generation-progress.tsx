'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { withBasePath } from '@/lib/base-path';
import type { GenerationJob } from '@/lib/sheet/generation-jobs';
import { MoraBot, MoraBotProgress } from '@/components/morabot';
import { useT } from '@/lib/i18n/client';
import type { T } from '@/lib/i18n';

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
  return useSyncExternalStore(
    subscribe,
    () => jobs,
    () => EMPTY,
  );
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

function jobLabel(job: GenerationJob, t: T) {
  if (job.status === 'queued') return t('順番待ち');
  if (job.status === 'running')
    return job.total ? t('{done} / {total}項目', { done: job.done, total: job.total }) : t('準備中…');
  if (job.status === 'error') return t('エラーで停止');
  return job.failed > 0 ? t('完了（{n}項目は失敗）', { n: job.failed }) : t('完了');
}

/** Summary card for the people list and the import screen. */
export function GenerationBanner() {
  const t = useT();
  const list = useJobs();
  useRefreshOnProgress(list);
  if (list.length === 0) return null;

  const active = list.filter(isActive);
  // Overall progress across everyone listed. A queued person's total is not
  // known yet, so count them at the size of the ones already measured.
  const known = list.filter((j) => j.total > 0);
  const perPerson = known.length ? known.reduce((n, j) => n + j.total, 0) / known.length : 0;
  const total = list.reduce((n, j) => n + (j.total || perPerson), 0);
  const done = list.reduce((n, j) => n + (isActive(j) ? j.done : j.total || perPerson), 0);
  const percent = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="card mb-4 border-brand-200 px-5 py-4" role="status">
      {active.length > 0 ? (
        <MoraBotProgress
          percent={percent}
          label={t('モラボットが文章を作成中です（残り{n}名）', { n: active.length })}
          detail={`${percent}% ・ ${t('1名あたり数分かかります。この画面を閉じても作成は続きます。')}`}
        />
      ) : (
        <div className="flex items-center gap-3">
          <MoraBot mood="sheet" size={56} title="" />
          <p className="font-semibold text-ink-900">{t('AIによる文章の作成が完了しました')}</p>
        </div>
      )}
      <ul className="mt-3 space-y-1.5">
        {list.map((job) => (
          <li key={job.personId} className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              href={`/people/${job.personId}`}
              className="min-w-[10rem] font-medium text-ink-900 hover:text-brand-500"
            >
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
              {jobLabel(job, t)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Small badge for a person's row in the list. */
export function GenerationRowBadge({ personId }: { personId: string }) {
  const t = useT();
  const job = useJobs().find((j) => j.personId === personId);
  if (!job || !isActive(job)) return null;
  return (
    <span className="badge badge-review badge-plain ml-2 align-middle">
      <span className="ai-spinner ai-spinner-sm" aria-hidden />
      {job.status === 'queued' ? t('AI 順番待ち') : t('AI作成中 {done}/{total}', { done: job.done, total: job.total || '…' })}
    </span>
  );
}

/** Notice on a person's editing screen while their text is being written. */
export function GenerationNotice({ personId }: { personId: string }) {
  const t = useT();
  const list = useJobs();
  useRefreshOnProgress(list, personId);
  const job = list.find((j) => j.personId === personId);
  if (!job || !isActive(job)) return null;
  return (
    <div className="card border-brand-200 px-5 py-4" role="status">
      <MoraBotProgress
        percent={job.status === 'running' && job.total ? (job.done / job.total) * 100 : undefined}
        label={
          job.status === 'queued'
            ? t('モラボットの順番待ちです')
            : t('モラボットがこの人の文章を作成中です')
        }
        detail={job.status === 'running' ? jobLabel(job, t) : undefined}
      />
      <p className="mt-2 text-sm text-ink-500">
        {t('完了した項目から順に表示されます。作成中の項目は上書きされるため、完了するまで編集はお待ちください。')}
      </p>
    </div>
  );
}
