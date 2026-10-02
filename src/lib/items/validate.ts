/**
 * Rules for answering a question set — shared by the candidate's screen (as
 * they type) and the server (on submit), so neither can be skipped.
 *
 * Pure: no database, safe to import into client components.
 */

export type ShowIf = { itemKey: string; anyOf: string[] } | null;

export type Validation = { integer?: boolean; min?: number; max?: number; maxLength?: number } | null;

export type AnswerValue = string | string[] | Record<string, string>;

export type QuestionRule = {
  key: string;
  type: string;
  required: boolean;
  showIf: ShowIf;
  validation: Validation;
  gridRows: string[];
};

export function isBlank(value: AnswerValue | undefined | null): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.filter((v) => v.trim() !== '').length === 0;
  if (typeof value === 'object') return Object.values(value).every((v) => !v || !v.trim());
  return value.trim() === '';
}

/** Shown unless its condition names an answer that is not one of the listed options. */
export function isShown(showIf: ShowIf, valueOf: (key: string) => AnswerValue | undefined): boolean {
  if (!showIf || showIf.anyOf.length === 0) return true;
  const value = valueOf(showIf.itemKey);
  if (value === undefined) return false;
  const picked = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return picked.some((p) => showIf.anyOf.includes(p));
}

/**
 * The problem with one answer, or null. Messages are bilingual: the
 * candidate reads English, the admin Japanese.
 */
export function answerProblem(rule: QuestionRule, value: AnswerValue | undefined): string | null {
  if (isBlank(value)) {
    return rule.required ? 'Required／必須です' : null;
  }
  if (rule.type === 'GRID' && rule.required && value && typeof value === 'object' && !Array.isArray(value)) {
    const missing = rule.gridRows.filter((r) => !(value as Record<string, string>)[r]);
    if (missing.length > 0) return 'Please answer every row／すべての行に回答してください';
  }
  if (typeof value !== 'string') return null;
  const v = rule.validation;
  if (!v) return null;
  const text = value.trim();
  if (v.maxLength && text.length > v.maxLength) {
    return `Up to ${v.maxLength} characters／${v.maxLength}文字以内で入力してください`;
  }
  const numeric = rule.type === 'NUMBER' || v.integer || v.min !== undefined || v.max !== undefined;
  if (numeric && !(rule.type === 'TEXT' && text === '-')) {
    const n = Number(text.replace(/[,，]/g, ''));
    if (!Number.isFinite(n)) return 'Enter a number／数字で入力してください';
    if (v.integer && !Number.isInteger(n)) return 'Enter a whole number／整数で入力してください';
    if (v.min !== undefined && n < v.min) return `Enter ${v.min} or more／${v.min}以上で入力してください`;
    if (v.max !== undefined && n > v.max) return `Enter ${v.max} or less／${v.max}以下で入力してください`;
  }
  return null;
}
