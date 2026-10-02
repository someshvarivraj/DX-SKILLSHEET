import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planFromGs } from '@/lib/items/gs-plan';
import { answerKey, toAnswerMap, toItemAnswers, type SetCodeMap } from '@/lib/items/answers';
import { classifyTitleChange, similarity } from '@/lib/items/gs-apply';

const gs2026 = readFileSync(resolve(__dirname, '../data/create_iit_form_2026.gs'), 'utf8');

describe('planFromGs on the 2026 form', () => {
  const plan = planFromGs(gs2026);
  const item = (key: string) => plan.items.find((i) => i.key === key);

  it('reads every numbered question, including deeper codes like B-1-4-2', () => {
    const codes = plan.items.flatMap((i) => i.formCodes);
    expect(codes).toHaveLength(115);
    expect(codes).toContain('B-1-4-2');
    expect(codes).toContain('B-2-4-2');
  });

  it('builds Category -> Subcategory -> Item from the codes', () => {
    const language = plan.categories.find((c) => c.key === 'C')!;
    expect(language.nameJa).toBe('言語能力');
    expect(language.subcategories.map((s) => s.key)).toEqual(['C-1', 'C-2']);
    const education = plan.categories.find((c) => c.key === 'B')!;
    expect(education.subcategories.find((s) => s.key === 'B-3')!.nameJa).toBe('高校');
  });

  it('makes internship and project parts one repeating subcategory each', () => {
    const internships = plan.categories.find((c) => c.key === 'E')!;
    expect(internships.nameJa).toBe('インターン・就業経験');
    expect(internships.subcategories).toHaveLength(1);
    expect(internships.subcategories[0]!.isRepeating).toBe(true);
    expect(item('E-x-6')!.formCodes).toEqual(['E-1-6', 'E-2-6']);
    expect(item('F-x-1')!.formCodes).toEqual(['F-1-1', 'F-2-1']);
    expect(plan.items).toHaveLength(96);
  });

  it('turns page jumps into conditions', () => {
    expect(item('B-1-2(B)')!.showIf).toEqual({ itemKey: 'B-1-1', anyOf: ['学士／Bachelor’s'] });
    expect(item('B-1-2(M)')!.showIf).toEqual({ itemKey: 'B-1-1', anyOf: ['修士／Master’s'] });
    expect(item('B-1-3')!.showIf).toBeNull();
  });

  it('keeps "Other" options and required flags', () => {
    expect(item('A-1-7')!.allowOther).toBe(true);
    expect(item('A-1-1')!.isRequired).toBe(true);
    expect(item('A-1-5')!.isRequired).toBe(false);
  });
});

describe('answers per item', () => {
  it('reads a repeating item through its entry number', () => {
    expect(answerKey('E-x-6', 2)).toBe('E-2-6');
    expect(answerKey('A-1-6', 1)).toBe('A-1-6');
    expect(
      toAnswerMap([
        { key: 'A-1-1', entry: 1, value: 'Priya' },
        { key: 'E-x-6', entry: 1, value: 'first' },
        { key: 'E-x-6', entry: 2, value: 'second' },
      ]),
    ).toEqual({ 'A-1-1': 'Priya', 'E-1-6': 'first', 'E-2-6': 'second' });
  });

  it('maps a file row by form code, skipping blanks and unknown codes', () => {
    const codes: SetCodeMap = new Map([
      ['A-1-1', { itemId: 'i1', key: 'A-1-1', entry: 1 }],
      ['E-2-6', { itemId: 'i6', key: 'E-x-6', entry: 2 }],
      ['A-1-5', { itemId: 'i5', key: 'A-1-5', entry: 1 }],
    ]);
    expect(toItemAnswers({ 'A-1-1': 'Priya', 'E-2-6': 'x', 'A-1-5': '  ', 'Z-9-9': 'stray' }, codes)).toEqual([
      { itemId: 'i1', key: 'A-1-1', entry: 1, value: 'Priya' },
      { itemId: 'i6', key: 'E-x-6', entry: 2, value: 'x' },
    ]);
  });
});

describe('a code reused for another question', () => {
  it('treats a reworded title as the same item', () => {
    expect(
      classifyTitleChange(
        { titleJa: '現在の居住地', titleEn: 'Current Location' },
        { titleJa: '現在の居住地（市区町村）', titleEn: 'Current Location' },
      ),
    ).toBe('reworded');
  });

  it('asks when both languages changed', () => {
    expect(
      classifyTitleChange(
        { titleJa: '出身地（州・都市）', titleEn: 'Hometown (State and City)' },
        { titleJa: '最寄り駅', titleEn: 'Nearest Station' },
      ),
    ).toBe('different');
  });

  it('scores identical strings 1 and unrelated ones low', () => {
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('Hometown', 'Nearest Station')).toBeLessThan(0.3);
  });
});
