'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Check, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { MoraBot } from '@/components/morabot';
import { saveDraftAction, submitAnswersAction } from '@/app/answer/[token]/actions';
import type { DraftAnswer, FormPage, FormQuestion } from '@/lib/items/candidate';
import { answerProblem, isBlank, isShown, type AnswerValue } from '@/lib/items/validate';

/** "日本語／English" -> English first, Japanese second; a plain label stays as it is. */
function bilingual(label: string): { main: string; sub: string | null } {
  let depth = 0;
  for (let i = 0; i < label.length; i++) {
    const c = label[i];
    if ('（(「【'.includes(c!)) depth++;
    else if ('）)」】'.includes(c!)) depth = Math.max(0, depth - 1);
    else if (c === '／' && depth === 0) {
      const ja = label.slice(0, i).trim();
      const en = label.slice(i + 1).trim();
      return /[A-Za-z]/.test(en) ? { main: en, sub: ja } : { main: label, sub: null };
    }
  }
  return { main: label, sub: null };
}

const k = (key: string, entry: number) => `${key}#${entry}`;

type Answers = Record<string, AnswerValue>;

export function AnswerForm({
  token,
  setName,
  name,
  deadline,
  pages,
  initialAnswers,
}: {
  token: string;
  setName: string;
  name: string;
  deadline: string | null;
  pages: FormPage[];
  initialAnswers: DraftAnswer[];
}) {
  const [answers, setAnswers] = useState<Answers>(() =>
    Object.fromEntries(initialAnswers.map((a) => [k(a.itemKey, a.entry), a.value])),
  );
  const [entries, setEntries] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const p of pages) {
      if (!p.isRepeating) continue;
      const keys = new Set(p.questions.map((q) => q.key));
      out[p.key] = Math.max(1, ...initialAnswers.filter((a) => keys.has(a.itemKey)).map((a) => a.entry));
    }
    return out;
  });
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error' | 'idle'>('idle');
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [serverProblems, setServerProblems] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const topRef = useRef<HTMLDivElement>(null);
  const isReview = step === pages.length;

  const valueOf = useCallback((key: string, entry = 1) => answers[k(key, entry)] ?? answers[k(key, 1)], [answers]);

  const toDraft = useCallback(
    (): DraftAnswer[] =>
      Object.entries(answers)
        .filter(([, v]) => !isBlank(v))
        .map(([id, value]) => {
          const at = id.lastIndexOf('#');
          return { itemKey: id.slice(0, at), entry: Number(id.slice(at + 1)), value };
        }),
    [answers],
  );

  // Autosave, a moment after the last change.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveState('saving');
    const timer = setTimeout(async () => {
      const r = await saveDraftAction(token, toDraft());
      setSaveState(r.ok ? 'saved' : 'error');
    }, 1200);
    return () => clearTimeout(timer);
  }, [answers, token, toDraft]);

  const set = (key: string, entry: number, value: AnswerValue) => setAnswers((a) => ({ ...a, [k(key, entry)]: value }));

  const pageProblems = useCallback(
    (page: FormPage) => {
      const out: Record<string, string> = {};
      const n = page.isRepeating ? (entries[page.key] ?? 1) : 1;
      for (let entry = 1; entry <= n; entry++) {
        for (const q of page.questions) {
          if (!isShown(q.showIf, (key) => valueOf(key, entry))) continue;
          const problem = answerProblem({ ...q, required: q.required && entry === 1 }, answers[k(q.key, entry)]);
          if (problem) out[k(q.key, entry)] = problem;
        }
      }
      return out;
    },
    [answers, entries, valueOf],
  );

  const allProblems = useMemo(() => pages.map((p) => Object.keys(pageProblems(p)).length), [pages, pageProblems]);

  const go = (to: number) => {
    setStep(to);
    setShowErrors(false);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const next = () => {
    const problems = pageProblems(pages[step]!);
    if (Object.keys(problems).length > 0) {
      setShowErrors(true);
      return;
    }
    go(step + 1);
  };

  const submit = () =>
    startTransition(async () => {
      setServerProblems(null);
      const r = await submitAnswersAction(token, toDraft());
      if (r.ok) setSubmitted(true);
      else if ('problems' in r && r.problems?.length) {
        setServerProblems(`${r.problems.length} answers need attention. Please go back and check the marked questions.`);
        setConfirming(false);
      } else {
        setServerProblems(r.error === 'deadline' ? 'The deadline has passed.' : 'This questionnaire can no longer be submitted.');
        setConfirming(false);
      }
    });

  if (submitted) {
    return (
      <main className="af-closed">
        <MoraBot mood="approved" size={120} title="" />
        <h1 className="af-closed-title">Thank you{name ? `, ${name}` : ''}. Your answers have been submitted.</h1>
        <p className="af-closed-ja">回答を受け付けました。ありがとうございました。</p>
        <p className="af-closed-sub">If you need to change something, please contact the person who sent you the link.</p>
      </main>
    );
  }

  const page = pages[step];
  const errors = page && showErrors ? pageProblems(page) : {};
  const progress = Math.round((Math.min(step, pages.length) / pages.length) * 100);

  return (
    <div className="af" ref={topRef}>
      <header className="af-head">
        <div className="af-head-row">
          <MoraBot mood={isReview ? 'checking' : 'explain'} size={44} title="" />
          <div className="min-w-0 flex-1">
            <p className="af-set">{setName}</p>
            <h1 className="af-title">Skill sheet questionnaire</h1>
            <p className="af-meta">
              {[name, deadline ? `Please submit by ${new Date(deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : '']
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        <p className={`af-save af-save-${saveState}`}>
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : saveState === 'error' ? 'Not saved — check your connection' : 'Your answers are saved automatically'}
        </p>
        <div className="af-progress" aria-hidden>
          <span style={{ width: `${progress}%` }} />
        </div>
        <nav className="af-steps" aria-label="Sections">
          {pages.map((p, i) => (
            <button
              key={p.key}
              type="button"
              className="af-step"
              aria-current={i === step}
              data-done={i < step && allProblems[i] === 0}
              onClick={() => go(i)}
            >
              {i < step && allProblems[i] === 0 ? <Check size={12} aria-hidden /> : <span>{i + 1}</span>}
              {p.titleEn ?? p.titleJa}
            </button>
          ))}
          <button type="button" className="af-step" aria-current={isReview} onClick={() => go(pages.length)}>
            <span>✓</span> Review
          </button>
        </nav>
      </header>

      {page ? (
        <section className="af-page">
          <h2 className="af-page-title">
            {page.titleEn ?? page.titleJa}
            {page.titleEn ? <span className="af-ja">{page.titleJa}</span> : null}
          </h2>
          {page.isRepeating ? (
            <RepeatingPage
              page={page}
              count={entries[page.key] ?? 1}
              setCount={(n) => setEntries((e) => ({ ...e, [page.key]: n }))}
              clearEntry={(entry) =>
                setAnswers((a) => {
                  const out: Answers = {};
                  const n = entries[page.key] ?? 1;
                  for (const [id, v] of Object.entries(a)) {
                    const at = id.lastIndexOf('#');
                    const key = id.slice(0, at);
                    const e = Number(id.slice(at + 1));
                    if (!page.questions.some((q) => q.key === key)) out[id] = v;
                    else if (e < entry) out[id] = v;
                    else if (e > entry && e <= n) out[k(key, e - 1)] = v;
                  }
                  return out;
                })
              }
              render={(entry) =>
                page.questions.map((q) =>
                  isShown(q.showIf, (key) => valueOf(key, entry)) ? (
                    <Question
                      key={q.key}
                      q={q}
                      value={answers[k(q.key, entry)]}
                      error={errors[k(q.key, entry)]}
                      required={q.required && entry === 1}
                      onChange={(v) => set(q.key, entry, v)}
                    />
                  ) : null,
                )
              }
            />
          ) : (
            page.questions.map((q) =>
              isShown(q.showIf, (key) => valueOf(key)) ? (
                <Question key={q.key} q={q} value={answers[k(q.key, 1)]} error={errors[k(q.key, 1)]} required={q.required} onChange={(v) => set(q.key, 1, v)} />
              ) : null,
            )
          )}
          {showErrors && Object.keys(errors).length > 0 ? (
            <p className="af-error-note">Please check the marked questions before continuing.／入力が必要な設問があります。</p>
          ) : null}
          <div className="af-nav">
            <button type="button" className="btn btn-secondary" disabled={step === 0} onClick={() => go(step - 1)}>
              <ChevronLeft size={16} aria-hidden /> Back
            </button>
            <button type="button" className="btn btn-primary" onClick={next}>
              {step === pages.length - 1 ? 'Review answers' : 'Next'} <ChevronRight size={16} aria-hidden />
            </button>
          </div>
        </section>
      ) : (
        <section className="af-page">
          <h2 className="af-page-title">
            Review and submit<span className="af-ja">確認して提出</span>
          </h2>
          <ul className="af-review">
            {pages.map((p, i) => (
              <li key={p.key}>
                <button type="button" onClick={() => go(i)}>
                  <span>{p.titleEn ?? p.titleJa}</span>
                  {allProblems[i] === 0 ? (
                    <span className="af-ok">
                      <Check size={14} aria-hidden /> Complete
                    </span>
                  ) : (
                    <span className="af-todo">{allProblems[i]} to answer</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {serverProblems ? <p className="af-error-note">{serverProblems}</p> : null}
          <div className="af-nav">
            <button type="button" className="btn btn-secondary" onClick={() => go(pages.length - 1)}>
              <ChevronLeft size={16} aria-hidden /> Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={allProblems.some((n) => n > 0) || pending}
              onClick={() => setConfirming(true)}
            >
              Submit answers
            </button>
          </div>
          {allProblems.some((n) => n > 0) ? (
            <p className="af-hint">Some sections still have questions to answer. Select a section above to finish it.</p>
          ) : null}
        </section>
      )}

      {confirming ? (
        <div className="dialog-overlay" onClick={pending ? undefined : () => setConfirming(false)}>
          <div className="dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-4">
              <MoraBot mood="checking" size={72} title="" />
              <div>
                <h2 className="text-lg font-semibold text-ink-900">Submit your answers?</h2>
                <p className="mt-1 text-sm text-ink-700">
                  After submitting, you can no longer change your answers from this link. If something needs changing later, please contact the person who sent it.
                </p>
                <p className="mt-1 text-xs text-ink-500">提出すると、このリンクからは変更できなくなります。</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={pending} autoFocus>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={pending}>
                {pending ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RepeatingPage({
  page,
  count,
  setCount,
  clearEntry,
  render,
}: {
  page: FormPage;
  count: number;
  setCount: (n: number) => void;
  clearEntry: (entry: number) => void;
  render: (entry: number) => React.ReactNode;
}) {
  const label = page.titleEn ?? page.titleJa;
  const example = page.questions.find((q) => q.exampleEn || q.exampleJa);
  return (
    <>
      <p className="af-hint">
        You can add up to {page.maxEntries}. Only the first is required; add more if you have them.
      </p>
      {example ? <Example q={example} /> : null}
      {Array.from({ length: count }, (_, i) => i + 1).map((entry) => (
        <div key={entry} className="af-entry">
          <div className="af-entry-head">
            <span>
              {label} {entry}
            </span>
            {count > 1 ? (
              <button
                type="button"
                className="af-entry-remove"
                onClick={() => {
                  clearEntry(entry);
                  setCount(count - 1);
                }}
              >
                <Trash2 size={14} aria-hidden /> Remove
              </button>
            ) : null}
          </div>
          {render(entry)}
        </div>
      ))}
      {count < page.maxEntries ? (
        <button type="button" className="af-add" onClick={() => setCount(count + 1)}>
          <Plus size={16} aria-hidden /> Add another ({count}/{page.maxEntries})
        </button>
      ) : null}
    </>
  );
}

function Example({ q }: { q: FormQuestion }) {
  return (
    <details className="af-example">
      <summary>Show example／記入例</summary>
      <pre>{q.exampleEn ?? q.exampleJa}</pre>
      {q.exampleEn && q.exampleJa ? <pre className="af-ja-block">{q.exampleJa}</pre> : null}
    </details>
  );
}

function Question({
  q,
  value,
  error,
  required,
  onChange,
}: {
  q: FormQuestion;
  value: AnswerValue | undefined;
  error?: string;
  required: boolean;
  onChange: (v: AnswerValue) => void;
}) {
  const id = `q-${q.key}`;
  const str = typeof value === 'string' ? value : '';
  const list = Array.isArray(value) ? value : [];
  const grid = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, string>) : {};
  const otherRadio = q.allowOther && str !== '' && !q.options.includes(str);
  const otherChecks = list.filter((v) => !q.options.includes(v));
  const v = q.validation;
  const numeric = q.type === 'NUMBER' || v?.integer || v?.min !== undefined || v?.max !== undefined;
  const longHelp = (q.help ?? '').length > 160;

  return (
    <div className={`af-q ${error ? 'af-q-error' : ''}`}>
      <label className="af-q-label" htmlFor={id}>
        {q.titleEn ?? q.titleJa}
        {required ? <span className="af-req">Required</span> : null}
        {q.titleEn ? <span className="af-ja">{q.titleJa}</span> : null}
      </label>
      {q.help ? (
        longHelp ? (
          <details className="af-help">
            <summary>How to answer／記入方法</summary>
            <p>{q.help}</p>
          </details>
        ) : (
          <p className="af-help-text">{q.help}</p>
        )
      ) : null}

      {q.type === 'TEXT' || q.type === 'NUMBER' ? (
        <input
          id={id}
          className="input"
          inputMode={numeric ? 'numeric' : undefined}
          value={str}
          maxLength={v?.maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : null}
      {q.type === 'PARAGRAPH' ? (
        <textarea id={id} className="input af-textarea" rows={4} value={str} maxLength={v?.maxLength} onChange={(e) => onChange(e.target.value)} />
      ) : null}
      {q.type === 'DATE' ? <input id={id} type="date" className="input af-date" value={str} onChange={(e) => onChange(e.target.value)} /> : null}

      {q.type === 'RADIO' || q.type === 'LIST' ? (
        <div className="af-options" role="radiogroup" id={id}>
          {q.options.map((o) => {
            const l = bilingual(o);
            return (
              <label key={o} className="af-option">
                <input type="radio" name={id} checked={str === o} onChange={() => onChange(o)} />
                <span>
                  {l.main}
                  {l.sub ? <span className="af-ja">{l.sub}</span> : null}
                </span>
              </label>
            );
          })}
          {q.allowOther ? (
            <label className="af-option af-option-other">
              <input type="radio" name={id} checked={otherRadio} onChange={() => onChange(otherRadio ? str : ' ')} />
              <span>Other:</span>
              <input className="input" value={otherRadio ? str.trimStart() : ''} onChange={(e) => onChange(e.target.value || ' ')} />
            </label>
          ) : null}
        </div>
      ) : null}

      {q.type === 'CHECKBOX' ? (
        <div className="af-options" id={id}>
          {q.options.map((o) => {
            const l = bilingual(o);
            return (
              <label key={o} className="af-option">
                <input
                  type="checkbox"
                  checked={list.includes(o)}
                  onChange={(e) => onChange(e.target.checked ? [...list, o] : list.filter((x) => x !== o))}
                />
                <span>
                  {l.main}
                  {l.sub ? <span className="af-ja">{l.sub}</span> : null}
                </span>
              </label>
            );
          })}
          {q.allowOther ? (
            <label className="af-option af-option-other">
              <span>Other:</span>
              <input
                className="input"
                value={otherChecks.join(', ')}
                onChange={(e) => onChange([...list.filter((x) => q.options.includes(x)), ...(e.target.value.trim() ? [e.target.value] : [])])}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {q.type === 'GRID' ? (
        <div className="af-grid-wrap">
          <table className="af-grid">
            <thead>
              <tr>
                <th />
                {q.gridColumns.map((c) => (
                  <th key={c}>{bilingual(c).main}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.gridRows.map((r) => (
                <tr key={r}>
                  <th>{bilingual(r).main}</th>
                  {q.gridColumns.map((c) => (
                    <td key={c}>
                      <input
                        type="radio"
                        name={`${id}-${r}`}
                        aria-label={`${r}: ${c}`}
                        checked={grid[r] === c}
                        onChange={() => onChange({ ...grid, [r]: c })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {error ? <p className="af-error">{error}</p> : null}
    </div>
  );
}
