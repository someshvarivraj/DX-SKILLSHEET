import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/lib/import/parse';
import {
  matchColumns,
  rowToAnswers,
  splitMultiSelect,
  splitGridSuffix,
  normaliseHeader,
  isSystemColumn,
  type QuestionRef,
} from '../src/lib/import/match';

const cataloguePath = resolve(process.cwd(), 'prisma/seed/form-questions-2026.json');
const samplePath = resolve(process.cwd(), 'data/sample-responses.csv');

type Catalogue = {
  questions: Array<{
    code: string;
    titleJa: string;
    titleEn: string | null;
    fullTitle: string;
    type: string;
    gridRows: string[];
  }>;
};

describe('header helpers', () => {
  it('splits the grid row out of a column header', () => {
    const { base, row } = splitGridSuffix(
      'G-1-7. 専攻外分野への配属許容度 [機械専攻 → 土木・インフラ設計]',
    );
    expect(base).toBe('G-1-7. 専攻外分野への配属許容度');
    expect(row).toBe('機械専攻 → 土木・インフラ設計');
  });

  it('is insensitive to whitespace and decoration', () => {
    expect(normaliseHeader('A-1-1.  氏名（英）  ')).toBe(
      normaliseHeader('A-1-1. 氏名（英）'),
    );
  });

  it('recognises the columns the form adds itself', () => {
    expect(isSystemColumn('タイムスタンプ')).toBe(true);
    expect(isSystemColumn('メールアドレス')).toBe(true);
    expect(isSystemColumn('A-1-1. 氏名（英）')).toBe(false);
  });

  it('splits multi-select answers without breaking on commas inside brackets', () => {
    expect(
      splitMultiSelect(
        'Linux（Ubuntu, CentOS など）／Linux (Ubuntu, CentOS, etc.), Windows',
      ),
    ).toEqual([
      'Linux（Ubuntu, CentOS など）／Linux (Ubuntu, CentOS, etc.)',
      'Windows',
    ]);
  });
});

describe('CSV parsing', () => {
  it('handles quoted fields containing commas and newlines', () => {
    const csv = 'a,b\n"one, two","line1\nline2"';
    const result = parseCsv(csv);
    expect(result.rows[0].a).toBe('one, two');
    expect(result.rows[0].b).toBe('line1\nline2');
  });

  it('handles escaped double quotes', () => {
    const result = parseCsv('a\n"he said ""hello"""');
    expect(result.rows[0].a).toBe('he said "hello"');
  });
});

// These run against the real 2026 catalogue and the generated sample file, so
// they exercise the path an operator actually takes on the import screen.
const haveFixtures = existsSync(cataloguePath) && existsSync(samplePath);

describe.runIf(haveFixtures)('importing the sample response file', () => {
  const catalogue = JSON.parse(readFileSync(cataloguePath, 'utf8')) as Catalogue;
  const refs: QuestionRef[] = catalogue.questions.map((q) => ({
    code: q.code,
    fullTitle: q.fullTitle,
    titleJa: q.titleJa,
    titleEn: q.titleEn,
    type: q.type,
    gridRows: q.gridRows,
  }));
  const types = new Map(catalogue.questions.map((q) => [q.code, q.type]));

  const parsed = parseCsv(readFileSync(samplePath, 'utf8'));
  const matches = matchColumns(parsed.headers, refs);

  it('reads three people', () => {
    expect(parsed.rows).toHaveLength(3);
  });

  it('matches every question column to a question', () => {
    const unmatched = matches.filter(
      (m) => !m.code && !isSystemColumn(m.header) && m.header.trim() !== '',
    );
    expect(unmatched.map((m) => m.header)).toEqual([]);
  });

  it('covers every question in the catalogue', () => {
    const found = new Set(matches.map((m) => m.code).filter(Boolean));
    const missing = refs.filter((q) => !found.has(q.code)).map((q) => q.code);
    expect(missing).toEqual([]);
  });

  it('turns a row into answers keyed by question code', () => {
    const answers = rowToAnswers(parsed.rows[0], matches, types);
    expect(answers['A-1-1']).toBe('Rohan Deshmukh');
    expect(answers['A-1-2']).toBe('デシュムク・ローハン');
    expect(answers['B-1-4']).toContain('IITボンベイ');
  });

  it('reads multi-select answers as arrays', () => {
    const answers = rowToAnswers(parsed.rows[0], matches, types);
    expect(Array.isArray(answers['D-1-9'])).toBe(true);
    expect(answers['D-1-9']).toContain('SolidWorks');
    expect(answers['D-1-9']).toContain('CATIA');
  });

  it('reassembles grid answers into row/value objects', () => {
    const answers = rowToAnswers(parsed.rows[0], matches, types);
    const grid = answers['G-1-8'] as Record<string, string>;
    expect(typeof grid).toBe('object');
    expect(Object.keys(grid).length).toBeGreaterThanOrEqual(3);
    expect(Object.values(grid).join()).toContain('積極的に希望する');
  });

  it('keeps the repeating-block answers separate per record', () => {
    const answers = rowToAnswers(parsed.rows[0], matches, types);
    expect(answers['E-1-2']).toBe('Endurance Technologies Limited');
    expect(answers['E-2-2']).toBe('Bharat Forge Limited');
    expect(answers['F-1-1']).toContain('go-kart');
  });

  it('carries the JLPT breakdown for a certified person and dashes for others', () => {
    const rohan = rowToAnswers(parsed.rows[0], matches, types);
    expect(rohan['C-1-1']).toBe('N3');
    expect(rohan['C-2-2']).toBe('112');

    const karthik = rowToAnswers(parsed.rows[2], matches, types);
    expect(karthik['C-1-1']).toContain('取得していない');
    expect(karthik['C-2-2']).toBe('-');
  });

  it('includes the fields the old system never collected', () => {
    const ananya = rowToAnswers(parsed.rows[1], matches, types);
    // CAE, materials characterisation, research output, dietary information.
    expect(ananya['D-1-10']).toBeDefined();
    expect(ananya['D-1-12']).toBeDefined();
    expect(ananya['H-2-2']).toContain('peer-reviewed');
    expect(ananya['A-1-7']).toContain('ベジタリアン');
  });
});
