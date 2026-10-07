'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Lock, RefreshCw } from 'lucide-react';
import { keepCurrentValuesAction, takeNewAnswersAction } from '@/app/(app)/people/[personId]/actions';
import type { ImportDiff } from '@/lib/sheet/import-diff';
import { MoraBotProgress } from '@/components/morabot';
import { useT } from '@/lib/i18n/client';

/** "[E-1-6] text" blocks without the codes, which mean nothing to a reader. */
function readable(answer: string): string {
  return answer.replace(/^\[[A-Z0-9x-]+(?:\([A-Z]\))?\]\s*/gm, '').trim();
}

const keyOf = (d: { fieldId: string; recordId: string | null }) => `${d.fieldId}#${d.recordId ?? ''}`;

/**
 * The differences, one card per field: the current Japanese, the answer it was
 * made from and the new answer side by side, and the two choices. Several can
 * be ticked and decided together.
 */
export function ImportDiffList({ personId, diffs }: { personId: string; diffs: ImportDiff[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<'take' | 'keep' | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const choosable = diffs.filter((d) => !d.locked);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(choosable.map(keyOf)));

  const run = (kind: 'take' | 'keep', targets: ImportDiff[]) => {
    if (targets.length === 0) return;
    setBusy(kind);
    setMessage(null);
    startTransition(async () => {
      const list = targets.map((d) => ({ fieldId: d.fieldId, recordId: d.recordId }));
      const result =
        kind === 'take' ? await takeNewAnswersAction(personId, list) : await keepCurrentValuesAction(personId, list);
      setBusy(null);
      if (!result) {
        setMessage({ ok: false, text: t('画面が古くなっています。再読み込みしてください。') });
        return;
      }
      setMessage({ ok: result.ok, text: result.message ?? '' });
      router.refresh();
    });
  };

  const picked = choosable.filter((d) => selected.has(keyOf(d)));
  const toggle = (d: ImportDiff) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(keyOf(d))) next.delete(keyOf(d));
      else next.add(keyOf(d));
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="card diff-bar">
        <label className="diff-all">
          <input
            type="checkbox"
            checked={picked.length === choosable.length && choosable.length > 0}
            onChange={(e) => setSelected(e.target.checked ? new Set(choosable.map(keyOf)) : new Set())}
          />
          {t('{n}項目のうち{m}項目を選択', { n: diffs.length, m: picked.length })}
        </label>
        <span className="flex-1" />
        <button type="button" className="btn btn-secondary" disabled={pending || picked.length === 0} onClick={() => run('keep', picked)}>
          <Check size={15} aria-hidden /> {t('選択した項目は現在の値を維持')}
        </button>
        <button type="button" className="btn btn-primary" disabled={pending || picked.length === 0} onClick={() => run('take', picked)}>
          <RefreshCw size={15} aria-hidden /> {t('選択した項目に新しい回答を取り込む')}
        </button>
      </div>

      {busy === 'take' ? (
        <div className="card px-5 py-4">
          <MoraBotProgress
            label={t('新しい回答で作り直しています…')}
            detail={t('AIで書く項目は、1項目あたり数十秒かかります')}
          />
        </div>
      ) : null}
      {message ? (
        <p className={`text-sm ${message.ok ? 'text-final-ink' : 'text-[#b03a22]'}`}>{t(message.text)}</p>
      ) : null}

      {diffs.map((d) => (
        <article key={keyOf(d)} className={`card diff-card ${d.locked ? 'diff-locked' : ''}`}>
          <header className="diff-head">
            {d.locked ? (
              <Lock size={15} aria-hidden className="text-ink-400" />
            ) : (
              <input
                type="checkbox"
                aria-label={t('{name}を選択', { name: d.fieldName })}
                checked={selected.has(keyOf(d))}
                onChange={() => toggle(d)}
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="diff-section">
                {d.sectionName}
                {d.recordLabel ? ` › ${d.recordLabel}` : ''}
              </p>
              <h3 className="diff-field">{d.fieldName}</h3>
            </div>
            {d.locked ? (
              <span className="tag">{t('ロック中のため取り込めません')}</span>
            ) : (
              <div className="head-tools">
                <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run('keep', [d])}>
                  {t('現在の値を維持')}
                </button>
                <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => run('take', [d])}>
                  {t('新しい回答を取り込む')}
                </button>
              </div>
            )}
          </header>
          <div className="diff-grid">
            <div>
              <p className="diff-label">{t('現在のスキルシート')}</p>
              <p className="diff-text">{d.currentJa || <span className="text-ink-400">{t('（空欄）')}</span>}</p>
            </div>
            <div>
              <p className="diff-label">{t('前回の回答')}</p>
              <p className="diff-text diff-old">{readable(d.previousAnswer) || <span className="text-ink-400">{t('（なし）')}</span>}</p>
            </div>
            <div>
              <p className="diff-label diff-label-new">{t('新しい回答')}</p>
              <p className="diff-text diff-new">{readable(d.newAnswer) || <span className="text-ink-400">{t('（空欄）')}</span>}</p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
