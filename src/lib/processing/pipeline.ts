/**
 * Processing pipeline — turns raw form answers into the value shown on a field.
 *
 * The behaviour of every field is decided by its definition row, not by code:
 *   SheetField.processing  chooses the handler below
 *   SheetField.sources     chooses which answers feed it
 *   SheetField.ruleKey     chooses which deterministic rule runs
 *   SheetField.generationPrompt is the instruction handed to the AI
 *
 * Specification: §5.3 (definition-driven), ch.6 (per-field processing types),
 * ch.8 (AI rules), §8.3 (leave blanks blank), §8.4 (always keep the source).
 */

import type { GlossaryCategory, Processing, ValueType } from '@prisma/client';
import { getAiProvider, isSendableField } from '@/lib/ai';
import type { Glossary } from '@/lib/glossary/glossary';
import { runRule, type RuleContext } from '@/lib/rules';
import { cleanChoice, cleanChoiceList, cleanGrid, isNoneOption } from '@/lib/style/choice';
import { normaliseJapanese } from '@/lib/style/text';
import { buildMessages } from './prompt';

export type FieldDefinition = {
  id: string;
  code: string;
  nameJa: string;
  processing: Processing;
  valueType: ValueType;
  sourceCodes: string[];
  generationPrompt?: string | null;
  targetLengthMin?: number | null;
  targetLengthMax?: number | null;
  glossaryCategory?: GlossaryCategory | null;
  ruleKey?: string | null;
};

export type ProcessContext = {
  /** Raw answers keyed by question code. */
  answers: Record<string, unknown>;
  glossary: Glossary;
  rule: Omit<RuleContext, 'answers' | 'glossary'>;
  /** Record prefix for repeating sections, e.g. "E-1" — resolves the "x". */
  recordPrefix?: string | null;
  /** Extra instruction typed for this single regeneration (§7.4). */
  operatorPrompt?: string | null;
  currentValue?: string | null;
};

export type ProcessResult = {
  valueJa: string;
  valueJson: unknown | null;
  /** The English answer(s), always stored so the reviewer can compare (§8.4). */
  sourceText: string;
  usedAi: boolean;
  model?: string;
  warnings: string[];
  /** Glossary terms not found; the screen offers to add them. */
  unmatchedTerms: string[];
};

const EMPTY_ANSWER_MARKERS = ['なし', 'none', 'n/a', 'na', '-', '―', '無し', 'nothing'];

function isEmptyAnswer(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.filter((v) => !isEmptyAnswer(v)).length === 0;
  const s = String(value).trim();
  if (!s) return true;
  if (EMPTY_ANSWER_MARKERS.includes(s.toLowerCase())) return true;
  return isNoneOption(s);
}

/** Replace the "x" placeholder in a source code with the record's index. */
export function resolveSourceCode(code: string, recordPrefix?: string | null): string {
  if (!code.includes('-x-')) return code;
  if (!recordPrefix) return code;
  // "E-x-6" + prefix "E-2" -> "E-2-6"
  const suffix = code.split('-x-')[1];
  return `${recordPrefix}-${suffix}`;
}

export function collectSourceValues(
  field: FieldDefinition,
  ctx: ProcessContext,
): Array<{ code: string; value: unknown }> {
  const prefix = ctx.recordPrefix;

  // A repeating section can be fed two ways:
  //  1. an "x" placeholder shared by every record  (E-x-6 with prefix E-2)
  //  2. one distinct question per record           (B-1-5 / B-2-5 / B-3-4)
  // When the field lists codes belonging to this record's prefix, only those
  // are used; otherwise the placeholder form is resolved.
  let codes = field.sourceCodes;
  if (prefix) {
    const direct = codes.filter((c) => c.startsWith(`${prefix}-`));
    if (direct.length > 0) codes = direct;
  }

  return codes
    .map((code) => {
      const resolved = resolveSourceCode(code, prefix);
      return { code: resolved, value: ctx.answers[resolved] };
    })
    .filter((entry) => entry.value !== undefined);
}

function stringifySources(values: Array<{ code: string; value: unknown }>): string {
  return values
    .filter((v) => !isEmptyAnswer(v.value))
    .map((v) =>
      Array.isArray(v.value)
        ? `[${v.code}] ${(v.value as unknown[]).join(', ')}`
        : typeof v.value === 'object' && v.value !== null
          ? `[${v.code}] ${JSON.stringify(v.value, null, 0)}`
          : `[${v.code}] ${String(v.value).trim()}`,
    )
    .join('\n\n');
}

const emptyResult = (sourceText: string): ProcessResult => ({
  valueJa: '',
  valueJson: null,
  sourceText,
  usedAi: false,
  warnings: [],
  unmatchedTerms: [],
});

export async function processField(
  field: FieldDefinition,
  ctx: ProcessContext,
): Promise<ProcessResult> {
  const sources = collectSourceValues(field, ctx);
  const sourceText = stringifySources(sources);
  const warnings: string[] = [];

  // §8.3 — an empty or "None" answer produces an empty field. No AI call.
  const allEmpty = sources.every((s) => isEmptyAnswer(s.value));
  if (allEmpty && field.processing !== 'RULE_BASED' && field.processing !== 'MANUAL') {
    return emptyResult(sourceText);
  }

  switch (field.processing) {
    case 'MANUAL':
      return emptyResult(sourceText);

    case 'COPY':
      return processCopy(field, sources, sourceText);

    case 'GLOSSARY':
      return processGlossary(field, sources, sourceText, ctx);

    case 'ENRICH':
    case 'RULE_BASED': {
      if (!field.ruleKey) {
        return {
          ...emptyResult(sourceText),
          warnings: [`規則キーが設定されていない（項目: ${field.code}）`],
        };
      }
      const result = runRule(field.ruleKey, {
        answers: resolvedAnswers(ctx),
        glossary: ctx.glossary,
        ...ctx.rule,
      });
      if (result.note) warnings.push(result.note);
      return {
        valueJa: normaliseJapanese(result.text),
        valueJson: null,
        sourceText,
        usedAi: false,
        warnings,
        unmatchedTerms: result.unmatched ?? [],
      };
    }

    case 'TRANSLATE':
    case 'GENERATE': {
      // A generated field may also name a rule. That rule is not the output —
      // it is the set of findings the AI is given and must not contradict, so
      // that a judgement which has to be exactly right (JLPT pass or fail) stays
      // deterministic while the wording around it is still written naturally.
      let facts: string | null = null;
      if (field.ruleKey) {
        const ruled = runRule(field.ruleKey, {
          answers: resolvedAnswers(ctx),
          glossary: ctx.glossary,
          ...ctx.rule,
        });
        facts = ruled.text?.trim() ? ruled.text : null;
        if (ruled.note) warnings.push(ruled.note);
      }
      return processWithAi(
        field,
        sourceText,
        ctx,
        field.processing === 'TRANSLATE',
        facts,
        warnings,
      );
    }

    default:
      return emptyResult(sourceText);
  }
}

/** Answers with "x" placeholders already resolved, for rule functions. */
function resolvedAnswers(ctx: ProcessContext): Record<string, unknown> {
  return ctx.answers;
}

function processCopy(
  field: FieldDefinition,
  sources: Array<{ code: string; value: unknown }>,
  sourceText: string,
): ProcessResult {
  if (field.valueType === 'GRID') {
    const merged: Array<{ row: string; value: string }> = [];
    for (const s of sources) {
      if (s.value && typeof s.value === 'object' && !Array.isArray(s.value)) {
        merged.push(...cleanGrid(s.value as Record<string, string>));
      } else {
        // A grid can also be assembled from several single-answer questions,
        // one row each — the JLPT 各スコア field is five separate questions
        // (C-2-2〜C-2-6). These used to be skipped because only grid-shaped
        // answers were read, which left the field empty. Sano-san's review
        // (2026-09-23, item 6): show each score with its label.
        const row = scalarGridRow(s.code, s.value);
        if (row) merged.push(row);
      }
    }
    return {
      valueJa: merged.map((m) => `${m.row}：${m.value}`).join('\n'),
      valueJson: merged,
      sourceText,
      usedAi: false,
      warnings: [],
      unmatchedTerms: [],
    };
  }

  if (field.valueType === 'STRING_LIST') {
    const items: string[] = [];
    for (const s of sources) {
      for (const item of cleanChoiceList(s.value as string[] | string)) {
        if (!items.includes(item)) items.push(item);
      }
    }
    return {
      valueJa: items.join('、'),
      valueJson: items,
      sourceText,
      usedAi: false,
      warnings: [],
      unmatchedTerms: [],
    };
  }

  const parts = sources
    .map((s) =>
      Array.isArray(s.value)
        ? cleanChoiceList(s.value as string[]).join('、')
        : cleanChoice(String(s.value ?? '')),
    )
    .filter(Boolean);

  return {
    valueJa: normaliseJapanese(parts.join(' ')),
    valueJson: null,
    sourceText,
    usedAi: false,
    warnings: [],
    unmatchedTerms: [],
  };
}

/**
 * Labels for single-answer questions that feed a grid row. The form's own
 * titles are too long to print as a label (「【N1・N2・N3の方】言語知識（文字・
 * 語彙・文法）の得点（60点満点）」), so the scored JLPT sections are named the
 * way the result notice names them, with the maximum kept for context.
 */
const SCORE_ROWS: Record<string, { label: string; max: number }> = {
  'C-2-2': { label: '総合点', max: 180 },
  'C-2-3': { label: '言語知識（文字・語彙・文法）', max: 60 },
  'C-2-4': { label: '読解', max: 60 },
  'C-2-5': { label: '言語知識・読解', max: 120 },
  'C-2-6': { label: '聴解', max: 60 },
};

function scalarGridRow(
  code: string,
  value: unknown,
): { row: string; value: string } | null {
  if (isEmptyAnswer(value)) return null;
  const raw = String(value).trim();
  const known = SCORE_ROWS[code];
  if (!known) return { row: code, value: cleanChoice(raw) };
  // "45", "45点", "４５" and "45/60" all mean a score of 45.
  const digits = raw.normalize('NFKC').match(/\d+/)?.[0];
  if (!digits) return { row: known.label, value: raw };
  return { row: known.label, value: `${Number(digits)}点（${known.max}点満点）` };
}

function processGlossary(
  field: FieldDefinition,
  sources: Array<{ code: string; value: unknown }>,
  sourceText: string,
  ctx: ProcessContext,
): ProcessResult {
  const category = field.glossaryCategory;
  if (!category) {
    return {
      ...emptyResult(sourceText),
      warnings: [`辞書の分類が設定されていない（項目: ${field.code}）`],
    };
  }

  const rawTerms: string[] = [];
  for (const s of sources) {
    if (Array.isArray(s.value)) {
      rawTerms.push(...(s.value as unknown[]).map((v) => String(v)));
    } else if (s.value) {
      rawTerms.push(
        ...String(s.value)
          .split(/[,、/／;；]/)
          .map((t) => t.trim())
          .filter(Boolean),
      );
    }
  }

  // Choice answers already carry Japanese; only free text needs the glossary.
  const prepared = rawTerms.map((t) => (t.includes('／') ? cleanChoice(t) : t)).filter(Boolean);
  const { items, unmatched } = ctx.glossary.translateList(category, prepared);

  const warnings = unmatched.length
    ? [`辞書にない語がある: ${unmatched.join('、')}。辞書に追加するか手修正すること`]
    : [];

  if (field.valueType === 'STRING_LIST') {
    return {
      valueJa: items.join('、'),
      valueJson: items,
      sourceText,
      usedAi: false,
      warnings,
      unmatchedTerms: unmatched,
    };
  }

  return {
    valueJa: normaliseJapanese(items.join('、')),
    valueJson: null,
    sourceText,
    usedAi: false,
    warnings,
    unmatchedTerms: unmatched,
  };
}

async function processWithAi(
  field: FieldDefinition,
  sourceText: string,
  ctx: ProcessContext,
  translateOnly: boolean,
  facts: string | null = null,
  carriedWarnings: string[] = [],
): Promise<ProcessResult> {
  if (!sourceText.trim() && !facts) return emptyResult(sourceText);

  // ch.13 — some fields are never sent to the AI service at all.
  if (!isSendableField(field.code)) {
    return {
      ...emptyResult(sourceText),
      warnings: [
        `項目「${field.nameJa}」はAIサービスへの送信対象外に設定されている。手入力で作成すること`,
      ],
    };
  }

  const glossaryHints = collectGlossaryHints(sourceText, ctx.glossary);

  const provider = getAiProvider();
  const response = await provider.generate({
    messages: buildMessages({
      fieldNameJa: field.nameJa,
      instruction: field.generationPrompt,
      sourceText,
      targetLengthMin: field.targetLengthMin,
      targetLengthMax: field.targetLengthMax,
      glossaryHints,
      operatorPrompt: ctx.operatorPrompt,
      currentValue: ctx.currentValue,
      translateOnly,
      facts,
    }),
    purpose: field.code,
  });

  // §8.5 — fix wording after the AI as well as before it.
  let text = normaliseJapanese(response.text);
  if (!translateOnly) {
    text = ctx.glossary.annotateFirstUse(text);
  }

  return {
    valueJa: text,
    valueJson: null,
    sourceText,
    usedAi: true,
    model: response.model,
    warnings: carriedWarnings,
    unmatchedTerms: [],
  };
}

/** Terms in the source text that the glossary knows, passed to the AI so the
 *  wording cannot drift (§8.5). */
function collectGlossaryHints(
  sourceText: string,
  glossary: Glossary,
): Array<{ term: string; japanese: string; gloss?: string | null }> {
  const hints: Array<{ term: string; japanese: string; gloss?: string | null }> = [];
  const haystack = sourceText.toLowerCase();
  for (const entry of glossary.all('TECH_TERM' as GlossaryCategory)) {
    const candidates = [entry.english, ...entry.aliases];
    const hit = candidates.find((c) => c && haystack.includes(c.toLowerCase()));
    if (hit) {
      hints.push({ term: hit, japanese: entry.japanese, gloss: entry.gloss });
    }
    if (hints.length >= 25) break;
  }
  return hints;
}
