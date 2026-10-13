'use client';

import { createContext, useContext, useState, useTransition } from 'react';
import { useT } from '@/lib/i18n/client';
import { evaluate, type JlptLevel } from '@/lib/rules/jlpt';
import {
  appliesTo,
  JLPT_LEVELS,
  SCORE_COLUMNS,
  type ScoreKey,
  type StoredScores,
} from '@/lib/sheet/jlpt-scores';
import { saveJlptScoresAction } from '@/app/(app)/people/[personId]/actions';

/** The field the table stands in for. */
export const JLPT_SCORES_FIELD = 'jlpt_scores';

/**
 * The person's JLPT result, handed down from the editing page. `undefined`
 * (no provider) means the screen does not offer the table — the field then
 * shows its ordinary boxes.
 */
const ScoresContext = createContext<StoredScores | null | undefined>(undefined);

export function JlptScoresProvider({
  scores,
  children,
}: {
  scores: StoredScores | null;
  children: React.ReactNode;
}) {
  return <ScoresContext.Provider value={scores}>{children}</ScoresContext.Provider>;
}

export function useJlptScores() {
  return useContext(ScoresContext);
}

type Draft = { level: JlptLevel } & Record<ScoreKey, string>;

function toDraft(scores: StoredScores | null): Draft {
  const text = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  return {
    level: scores?.level ?? 'N3',
    languageKnowledge: text(scores?.languageKnowledge),
    reading: text(scores?.reading),
    languageAndReading: text(scores?.languageAndReading),
    listening: text(scores?.listening),
  };
}

/** "45", "４５" → 45; "" → null; anything else → NaN (reported on save). */
function parseScore(value: string): number | null {
  const s = value.normalize('NFKC').trim();
  if (!s) return null;
  return /^\d+$/.test(s) ? Number(s) : NaN;
}

/**
 * JLPT scores as a table — level and one column per scored section, the way
 * the result notice and Sano-san's spreadsheet lay them out (2026-10-13) —
 * instead of one text box. N1–N3 are scored in three sections and N4–N5 in
 * two, so the columns that do not apply to the chosen level are greyed out.
 * The total is added up here, and the pass/fail check is shown under it.
 */
export function JlptScoreTable({
  personId,
  fieldId,
  scores,
  disabled,
}: {
  personId: string;
  fieldId: string;
  scores: StoredScores | null;
  disabled: boolean;
}) {
  const t = useT();
  const [draft, setDraft] = useState<Draft>(() => toDraft(scores));
  const [saved, setSaved] = useState<Draft>(() => toDraft(scores));
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  // Follow the server after a save or another person's change, unless there
  // are edits here that have not been saved yet.
  const incoming = toDraft(scores);
  if (JSON.stringify(incoming) !== JSON.stringify(saved)) {
    setSaved(incoming);
    if (JSON.stringify(draft) === JSON.stringify(saved)) setDraft(incoming);
  }

  const parsed = Object.fromEntries(
    SCORE_COLUMNS.map((c) => [c.key, appliesTo(c, draft.level) ? parseScore(draft[c.key]) : null]),
  ) as Record<ScoreKey, number | null>;
  const applicable = SCORE_COLUMNS.filter((c) => appliesTo(c, draft.level));
  const complete = applicable.every((c) => parsed[c.key] !== null && !Number.isNaN(parsed[c.key]));
  const total = complete ? applicable.reduce((sum, c) => sum + (parsed[c.key] ?? 0), 0) : null;
  const result = complete ? evaluate({ level: draft.level, ...parsed }) : null;
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const busy = disabled || pending;

  const save = () =>
    startTransition(async () => {
      setNotice(null);
      setWarnings([]);
      const bad = applicable.find((c) => Number.isNaN(parsed[c.key]));
      if (bad) {
        setNotice(t('{label}は数字で入力してください', { label: t(bad.label) }));
        return;
      }
      const response = await saveJlptScoresAction(personId, { fieldId, level: draft.level, ...parsed });
      if (!response) {
        setNotice('画面が古くなっています（新しいバージョンに更新されました）。ページを再読み込みしてから、もう一度操作してください。');
        return;
      }
      if (response.ok) setSaved(draft);
      setNotice(response.message ?? null);
      setWarnings(response.warnings ?? []);
    });

  return (
    <div className="jlpt-table-wrap">
      <table className="jlpt-table">
        <thead>
          <tr>
            <th scope="col">{t('級')}</th>
            {SCORE_COLUMNS.map((c) => (
              <th key={c.key} scope="col" className={appliesTo(c, draft.level) ? '' : 'jlpt-na'}>
                {t(c.label)}
                <span className="jlpt-max">（{c.max}）</span>
              </th>
            ))}
            <th scope="col">
              {t('総合点')}
              <span className="jlpt-max">（180）</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <select
                className="input"
                aria-label={t('級')}
                value={draft.level}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, level: e.target.value as JlptLevel })}
              >
                {JLPT_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </td>
            {SCORE_COLUMNS.map((c) =>
              appliesTo(c, draft.level) ? (
                <td key={c.key}>
                  <input
                    className="input"
                    inputMode="numeric"
                    aria-label={t(c.label)}
                    value={draft[c.key]}
                    disabled={busy}
                    onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing && changed) save();
                    }}
                  />
                </td>
              ) : (
                <td key={c.key} className="jlpt-na" aria-label={t('この級にはない区分')}>
                  —
                </td>
              ),
            )}
            <td className="jlpt-total">{total ?? '—'}</td>
          </tr>
        </tbody>
      </table>

      <div className="jlpt-table-foot">
        <p className="text-sm text-ink-700">
          {result
            ? result.passed
              ? t('合格（合格点{p}点・各区分の基準点を満たしている）', { p: result.passMark })
              : !result.totalMeetsPassMark
                ? t('不合格（総合点が合格点{p}点に届いていない）', { p: result.passMark })
                : t('不合格（基準点に届いていない区分がある）')
            : t('すべての区分を入力すると、総合点と合否を表示します。')}
        </p>
        {disabled ? null : (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || !changed} onClick={save}>
            {pending ? t('保存中…') : t('保存して文章を作り直す')}
          </button>
        )}
      </div>
      {disabled ? null : (
        <p className="text-xs text-ink-500">
          {t('保存すると「取得資格と時期」と「日本語力について」をスコアから作り直します（手で編集した文章とロック中の項目はそのまま）。')}
        </p>
      )}
      {warnings.map((w, i) => (
        <p key={i} className="field-msg">
          ⚠ {t(w)}
        </p>
      ))}
      {notice ? <p className="field-msg text-ink-700">{t(notice)}</p> : null}
    </div>
  );
}
