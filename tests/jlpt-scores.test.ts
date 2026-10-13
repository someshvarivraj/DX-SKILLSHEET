import { describe, expect, it } from 'vitest';
import { normaliseScores, scoreRows } from '../src/lib/sheet/jlpt-scores';

describe('JLPT score table (Sano-san, 2026-10-13)', () => {
  it('adds up an N3 result from its three sections', () => {
    const scores = normaliseScores({ level: 'N3', languageKnowledge: 21, reading: 51, languageAndReading: 99, listening: 48 });
    // 言語知識・読解 is not scored at N3, so a stray value there is dropped.
    expect(scores).toEqual({ level: 'N3', languageKnowledge: 21, reading: 51, languageAndReading: null, listening: 48, total: 120 });
  });

  it('adds up an N4 result from its two sections', () => {
    const scores = normaliseScores({ level: 'N4', languageKnowledge: null, reading: null, languageAndReading: 62, listening: 41 });
    expect(scores).toMatchObject({ languageAndReading: 62, listening: 41, total: 103 });
  });

  it('leaves the total unknown until every section is filled in', () => {
    const scores = normaliseScores({ level: 'N3', languageKnowledge: 21, reading: null, languageAndReading: null, listening: 48 });
    expect(scores).toMatchObject({ total: null });
  });

  it('refuses a score above the section maximum', () => {
    expect(normaliseScores({ level: 'N3', languageKnowledge: 61, reading: 1, languageAndReading: null, listening: 1 })).toEqual({
      error: '言語知識（文字・語彙・文法）は0〜60の整数で入力すること',
    });
  });

  it('keeps a text copy with the maximum of each section', () => {
    const scores = normaliseScores({ level: 'N4', languageKnowledge: null, reading: null, languageAndReading: 58, listening: 33 });
    if ('error' in scores) throw new Error(scores.error);
    expect(scoreRows(scores)).toEqual([
      { row: '総合点', value: '91点（180点満点）' },
      { row: '言語知識・読解', value: '58点（120点満点）' },
      { row: '聴解', value: '33点（60点満点）' },
    ]);
  });
});
