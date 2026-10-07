'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Copy, Mail, PlayCircle, RotateCcw, Trash2, UserPlus } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import {
  addCandidatesAction,
  candidateLinkAction,
  openSetAction,
  reopenResponseAction,
  removeDraftAction,
  sendInviteAction,
  type ActionResult,
} from '@/app/(app)/admin/items/actions';

export type CandidateRow = {
  responseId: string;
  personId: string | null;
  name: string;
  email: string | null;
  status: 'DRAFT' | 'SUBMITTED';
  source: 'APP' | 'IMPORT';
  answered: number;
  /** Not submitted yet: a link to their page can be sent. */
  canLink: boolean;
  invitedAt: string | null;
  submittedAt: string | null;
  updatedAt: string;
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * Candidates of one question set: add them (one per line, "Name, email"),
 * send each their login link to マイページ — where they answer the
 * questionnaire and later see their skill sheet — see who has answered, and
 * ask for an update when something must change.
 */
export function CandidatesPanel({
  setId,
  rows,
  open,
  total,
}: {
  setId: string;
  rows: CandidateRow[];
  /** The set is 受付中 — links work only then. */
  open: boolean;
  total: number;
}) {
  const t = useT();
  const [text, setText] = useState('');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);
  const act = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      setResult(await fn());
    });
  const submitted = rows.filter((r) => r.status === 'SUBMITTED').length;

  return (
    <section className="card overflow-hidden">
      <div className="panel-head">
        <h2 className="panel-title">{t('候補者とマイページ')}</h2>
        <span className="panel-head-meta">{t('提出 {a} / {b}人', { a: submitted, b: total })}</span>
      </div>
      {!open ? (
        <div className="cp-closed">
          <p>
            <strong>{t('まだ受付を開始していません。')}</strong>{' '}
            {t('このままでは、候補者がマイページを開いてもアンケートに回答できません。')}
          </p>
          <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => act(() => openSetAction(setId))}>
            <PlayCircle size={14} aria-hidden /> {t('受付を開始する')}
          </button>
        </div>
      ) : null}

      <div className="grid gap-2 border-b border-ink-100 p-4">
        <label className="field-label" htmlFor="cand-add">
          {t('候補者を追加（1行に1人。「名前, メールアドレス」）')}
        </label>
        <textarea
          id="cand-add"
          className="input im-textarea"
          rows={3}
          placeholder={'Priya Das, priya@example.com\nRohan Deshmukh, rohan@example.com'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-500">
            {t('追加した人には、マイページのログインアカウントが作られます。既に回答している人（Googleフォームの回答を取り込んだ人など）は、その回答が入った状態です。本人は確認して提出するだけです。')}
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={pending || !text.trim()}
            onClick={() =>
              act(async () => {
                const r = await addCandidatesAction(setId, text);
                if (r.ok) setText('');
                return r;
              })
            }
          >
            <UserPlus size={14} aria-hidden /> {t('候補者を追加する')}
          </button>
        </div>
        {result ? <p className={`text-xs ${result.ok ? 'text-final-ink' : 'text-[#b03a22]'}`}>{t(result.message)}</p> : null}
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-500">{t('まだ候補者がいません。')}</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table !min-w-[48rem]">
            <thead>
              <tr>
                <th>{t('候補者')}</th>
                <th>{t('状態')}</th>
                <th>{t('回答数')}</th>
                <th>{t('最終更新')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.responseId}>
                  <td>
                    {r.personId ? (
                      <Link href={`/people/${r.personId}`} className="font-medium text-ink-900 hover:underline">
                        {r.name}
                      </Link>
                    ) : (
                      r.name
                    )}
                    <div className="text-xs text-ink-400">{r.email ?? t('メールアドレスなし')}</div>
                  </td>
                  <td>
                    {r.status === 'SUBMITTED' ? (
                      <span className="badge badge-final">{r.source === 'IMPORT' ? t('提出済み（ファイル取り込み）') : t('提出済み')}</span>
                    ) : r.answered > 0 ? (
                      <span className="badge badge-review">{t('回答中')}</span>
                    ) : (
                      <span className="badge badge-draft">{t('未回答')}</span>
                    )}
                    {r.invitedAt && r.status === 'DRAFT' ? (
                      <div className="text-xs text-ink-400">{t('メール送信: {at}', { at: fmt(r.invitedAt) })}</div>
                    ) : null}
                  </td>
                  <td>{r.answered}</td>
                  <td className="text-xs text-ink-500">{fmt(r.submittedAt ?? r.updatedAt)}</td>
                  <td className="whitespace-nowrap text-right">
                    {r.canLink ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm mr-1"
                          onClick={async () => {
                            if (!open && !window.confirm(t('まだ受付を開始していないため、候補者はマイページでアンケートに回答できません。それでもコピーしますか？'))) return;
                            const res = await candidateLinkAction(r.responseId);
                            if (!res.ok || !res.link) {
                              setResult(res);
                              return;
                            }
                            await navigator.clipboard.writeText(res.link);
                            setCopied(r.responseId);
                            setTimeout(() => setCopied(null), 2000);
                          }}
                        >
                          <Copy size={14} aria-hidden /> {copied === r.responseId ? t('コピーしました') : t('ログインリンクをコピー')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm mr-1"
                          disabled={pending || !r.email}
                          onClick={() => {
                            if (!open && !window.confirm(t('まだ受付を開始していないため、候補者はマイページでアンケートに回答できません。それでも送りますか？'))) return;
                            act(() => sendInviteAction(r.responseId));
                          }}
                        >
                          <Mail size={14} aria-hidden /> {r.invitedAt ? t('再送') : t('メールで送る')}
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn-danger"
                          title={t('削除')}
                          aria-label={t('削除')}
                          disabled={pending}
                          onClick={() => act(() => removeDraftAction(r.responseId))}
                        >
                          <Trash2 size={15} aria-hidden />
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => act(() => reopenResponseAction(r.responseId))}>
                        <RotateCcw size={14} aria-hidden /> {t('更新を依頼する')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
