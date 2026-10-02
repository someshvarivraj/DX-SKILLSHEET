import { describe, expect, it } from 'vitest';
import { answerProblem, isShown, type QuestionRule } from '@/lib/items/validate';

const rule = (r: Partial<QuestionRule>): QuestionRule => ({
  key: 'x', type: 'TEXT', required: false, showIf: null, validation: null, gridRows: [], ...r,
});

describe('answering a question set', () => {
  it('flags a missing required answer, not an optional one', () => {
    expect(answerProblem(rule({ required: true }), '')).toMatch(/Required/);
    expect(answerProblem(rule({ required: false }), '')).toBeNull();
    expect(answerProblem(rule({ required: true, type: 'CHECKBOX' }), [])).toMatch(/Required/);
  });

  it('checks JLPT-style score limits', () => {
    const score = rule({ validation: { integer: true, min: 0, max: 180 } });
    expect(answerProblem(score, '150')).toBeNull();
    expect(answerProblem(score, '181')).toMatch(/180 or less/);
    expect(answerProblem(score, '12.5')).toMatch(/whole number/);
    expect(answerProblem(score, 'abc')).toMatch(/number/);
    // "-" stays allowed in a text score box (the form's old "not applicable" answer)
    expect(answerProblem(score, '-')).toBeNull();
  });

  it('needs every grid row when the grid is required', () => {
    const grid = rule({ type: 'GRID', required: true, gridRows: ['a', 'b'] });
    expect(answerProblem(grid, { a: 'yes' })).toMatch(/every row/);
    expect(answerProblem(grid, { a: 'yes', b: 'no' })).toBeNull();
  });

  it('shows a conditional question only for the listed answers', () => {
    const cond = { itemKey: 'B-1-1', anyOf: ['修士／Master’s'] };
    expect(isShown(cond, () => '修士／Master’s')).toBe(true);
    expect(isShown(cond, () => '学士／Bachelor’s')).toBe(false);
    expect(isShown(cond, () => undefined)).toBe(false);
    expect(isShown(null, () => undefined)).toBe(true);
  });
});
