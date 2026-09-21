import { describe, expect, it } from 'vitest';
import {
  buildDescription,
  buildQualificationLine,
  evaluate,
  PASS_CRITERIA,
  selectPrimaryResult,
} from '../src/lib/rules/jlpt';

describe('pass criteria (spec §10.1)', () => {
  it('matches the table in the specification', () => {
    expect(PASS_CRITERIA.N1.passMark).toBe(100);
    expect(PASS_CRITERIA.N2.passMark).toBe(90);
    expect(PASS_CRITERIA.N3.passMark).toBe(95);
    expect(PASS_CRITERIA.N4.passMark).toBe(90);
    expect(PASS_CRITERIA.N5.passMark).toBe(80);
  });

  it('uses three sections for N1–N3 and two for N4–N5', () => {
    expect(PASS_CRITERIA.N1.layout).toBe('THREE_SECTION');
    expect(PASS_CRITERIA.N3.layout).toBe('THREE_SECTION');
    expect(PASS_CRITERIA.N4.layout).toBe('TWO_SECTION');
    expect(PASS_CRITERIA.N5.layout).toBe('TWO_SECTION');
  });
});

describe('evaluate', () => {
  it('passes when the total and every section clear their minimum', () => {
    const result = evaluate({
      level: 'N2',
      languageKnowledge: 40,
      reading: 35,
      listening: 30,
    });
    expect(result.total).toBe(105);
    expect(result.passed).toBe(true);
  });

  it('fails when a section is below its minimum even though the total passes', () => {
    // 150 total, comfortably over the 100 pass mark, but listening is 10.
    const result = evaluate({
      level: 'N1',
      languageKnowledge: 60,
      reading: 60,
      listening: 10,
    });
    expect(result.total).toBe(130);
    expect(result.totalMeetsPassMark).toBe(true);
    expect(result.allSectionsMeetMinimum).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('applies the higher combined minimum for N4 and N5', () => {
    const below = evaluate({ level: 'N5', languageAndReading: 37, listening: 45 });
    expect(below.sections.find((s) => s.key === 'languageAndReading')?.meetsMinimum).toBe(false);

    const above = evaluate({ level: 'N5', languageAndReading: 38, listening: 45 });
    expect(above.sections.find((s) => s.key === 'languageAndReading')?.meetsMinimum).toBe(true);
    expect(above.passed).toBe(true); // 83 >= 80
  });

  it('marks a result incomplete when scores are missing', () => {
    const result = evaluate({ level: 'N3', total: 100 });
    expect(result.incomplete).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('flags a section that only just clears its minimum', () => {
    const result = evaluate({
      level: 'N2',
      languageKnowledge: 40,
      reading: 40,
      listening: 20,
    });
    expect(result.sections.find((s) => s.key === 'listening')?.barelyClears).toBe(true);
  });
});

describe('buildDescription (spec §10.2, §10.3)', () => {
  it('reproduces the case described in the specification', () => {
    // N1, total 151: language knowledge + reading full marks, listening 31/60.
    const text = buildDescription({
      level: 'N1',
      languageKnowledge: 60,
      reading: 60,
      listening: 31,
    });
    expect(text).toContain('N1');
    expect(text).toContain('聴解');
    expect(text).toContain('31');
    // The weak side must be mentioned, not just the total.
    expect(text).toContain('相対的に弱く');
  });

  it('never uses vague evaluative words', () => {
    const text = buildDescription({
      level: 'N1',
      languageKnowledge: 55,
      reading: 55,
      listening: 55,
    });
    for (const word of ['堪能', '流暢', '完璧']) {
      expect(text).not.toContain(word);
    }
  });

  it('writes in plain form, never in polite form', () => {
    const text = buildDescription({
      level: 'N3',
      languageKnowledge: 40,
      reading: 30,
      listening: 25,
    });
    expect(text).not.toMatch(/です。|ます。/);
  });

  it('is reproducible — the same input gives the same output', () => {
    const scores = {
      level: 'N2' as const,
      languageKnowledge: 45,
      reading: 30,
      listening: 22,
    };
    expect(buildDescription(scores)).toBe(buildDescription(scores));
  });

  it('handles the N4/N5 two-section layout', () => {
    const text = buildDescription({
      level: 'N4',
      languageAndReading: 95,
      listening: 25,
    });
    expect(text).toContain('N4');
    expect(text).toContain('言語知識・読解');
  });

  it('states plainly when the attempt did not pass', () => {
    const text = buildDescription({
      level: 'N2',
      languageKnowledge: 20,
      reading: 20,
      listening: 20,
    });
    expect(text).toContain('合格点');
  });

  it('returns only the level when scores are missing, inventing nothing', () => {
    const text = buildDescription({ level: 'N3' });
    expect(text).toBe('N3を取得している。');
  });
});

describe('buildQualificationLine (spec §6.10)', () => {
  it('formats year, month and level', () => {
    expect(
      buildQualificationLine({ level: 'N3', examYear: 2025, examMonth: 12 }),
    ).toBe('2025年12月にN3取得');
  });

  it('degrades gracefully when the session is unknown', () => {
    expect(buildQualificationLine({ level: 'N2' })).toBe('N2取得');
  });
});

describe('selectPrimaryResult', () => {
  it('prefers the highest level actually passed', () => {
    const chosen = selectPrimaryResult([
      { level: 'N3', examYear: 2024, examMonth: 12, languageKnowledge: 40, reading: 35, listening: 30 },
      // N2 attempt that failed on listening
      { level: 'N2', examYear: 2025, examMonth: 7, languageKnowledge: 50, reading: 45, listening: 10 },
    ]);
    expect(chosen?.level).toBe('N3');
  });

  it('falls back to the most recent attempt when nothing was passed', () => {
    const chosen = selectPrimaryResult([
      { level: 'N3', examYear: 2024, examMonth: 7, languageKnowledge: 10, reading: 10, listening: 10 },
      { level: 'N3', examYear: 2025, examMonth: 12, languageKnowledge: 15, reading: 15, listening: 15 },
    ]);
    expect(chosen?.examYear).toBe(2025);
  });
});
