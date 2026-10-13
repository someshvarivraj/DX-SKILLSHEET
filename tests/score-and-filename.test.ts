import { describe, expect, it } from 'vitest';
import { formatAcademicScore } from '../src/lib/style/score';
import { buildAsciiFileName, buildFileName } from '../src/lib/pdf/render';
import type { SheetModel } from '../src/lib/sheet/model';

describe('学歴 › 成績 is labelled (Sano-san, 2026-10-13)', () => {
  it('labels a bare figure by its scale', () => {
    expect(formatAcademicScore('6.8')).toBe('CGPA: 6.8');
    expect(formatAcademicScore('91%')).toBe('Percentage: 91%');
    expect(formatAcademicScore('91')).toBe('Percentage: 91%');
  });

  it('keeps only the CGPA when both are given', () => {
    expect(formatAcademicScore('CGPA: 7.52 / Percentage: 75.20%')).toBe('CGPA: 7.52');
    expect(formatAcademicScore('cpi 8.1')).toBe('CPI: 8.1');
  });

  it('is unchanged when applied again, and leaves other text alone', () => {
    expect(formatAcademicScore('CGPA: 6.8')).toBe('CGPA: 6.8');
    expect(formatAcademicScore('Percentage: 91%')).toBe('Percentage: 91%');
    expect(formatAcademicScore('First class')).toBe('First class');
  });
});

describe('PDF file name (Sano-san, 2026-10-13)', () => {
  const model = {
    person: { fullNameEnglish: 'Maradana Kasi Sri Roshan', fullNameKatakana: 'マラダナ・カシ・スリ・ロシャン' },
  } as SheetModel;
  const when = new Date(2026, 9, 13);

  it('holds the katakana and the English name', () => {
    expect(buildFileName(model, when)).toBe('マラダナ・カシ・スリ・ロシャン／Maradana Kasi Sri Roshan_20261013.pdf');
  });

  it('falls back to the English name, and to ASCII for storage', () => {
    expect(buildFileName({ person: { fullNameEnglish: 'Yash Sharma', fullNameKatakana: null } } as SheetModel, when)).toBe(
      'Yash Sharma_20261013.pdf',
    );
    expect(buildAsciiFileName(model, when)).toBe('Maradana_Kasi_Sri_Roshan_20261013.pdf');
  });
});

describe('補足資料 file name (Sano-san, 2026-10-13)', () => {
  it('matches the skill sheet, with 補足資料 before the date', async () => {
    const { buildSupplementFileName } = await import('../src/lib/pdf/supplement');
    const model = { person: { fullNameEnglish: 'Paranjita Debnath', fullNameKatakana: 'デブナス・パランジタ' } } as SheetModel;
    expect(buildSupplementFileName(model, new Date(2026, 9, 13))).toBe('デブナス・パランジタ／Paranjita Debnath_補足資料_20261013.pdf');
  });
});
