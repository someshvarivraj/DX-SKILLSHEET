import { describe, expect, it } from 'vitest';
import { matchesPersonQuery, normalizeSearchText } from '../src/lib/people-search';

const arjun = {
  fullNameEnglish: 'Arjun Reddy',
  fullNameKatakana: 'レッディ・アルジュン',
  employeeNumber: 'E2026-014',
  email: 'arjun.reddy@example.com',
  cohort: '2026',
};

describe('people search', () => {
  it('finds a person however the name is typed', () => {
    for (const q of ['arjun', 'ARJUN', 'reddy arjun', 'Ａｒｊｕｎ', 'アルジュン', 'あるじゅん', 'レッディアルジュン', 'ﾚｯﾃﾞｨ']) {
      expect(matchesPersonQuery(arjun, q), q).toBe(true);
    }
  });

  it('finds by employee number, email and cohort', () => {
    expect(matchesPersonQuery(arjun, 'E2026-014')).toBe(true);
    expect(matchesPersonQuery(arjun, 'e2026014')).toBe(true);
    expect(matchesPersonQuery(arjun, 'example.com')).toBe(true);
    expect(matchesPersonQuery(arjun, '2026')).toBe(true);
  });

  it('requires every term to match', () => {
    expect(matchesPersonQuery(arjun, 'arjun menon')).toBe(false);
    expect(matchesPersonQuery(arjun, 'karthik')).toBe(false);
  });

  it('matches everyone on an empty query', () => {
    expect(matchesPersonQuery(arjun, '')).toBe(true);
    expect(matchesPersonQuery(arjun, '   ')).toBe(true);
  });

  it('tolerates a person with no katakana or employee number yet', () => {
    const fresh = { ...arjun, fullNameKatakana: null, employeeNumber: null, email: null, cohort: null };
    expect(matchesPersonQuery(fresh, 'arjun')).toBe(true);
    expect(matchesPersonQuery(fresh, 'アルジュン')).toBe(false);
  });

  it('folds hiragana to katakana and drops separators', () => {
    expect(normalizeSearchText('あいやる・あなんや')).toBe('アイヤルアナンヤ');
  });
});
