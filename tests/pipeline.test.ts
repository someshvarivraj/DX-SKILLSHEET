import { beforeEach, describe, expect, it } from 'vitest';
import { Glossary, type GlossaryRecord } from '../src/lib/glossary/glossary';
import {
  collectSourceValues,
  processField,
  resolveSourceCode,
  type FieldDefinition,
  type ProcessContext,
} from '../src/lib/processing/pipeline';
import { setAiProvider } from '../src/lib/ai';
import { MockAiProvider } from '../src/lib/ai/mock';
import { ageFromDateOfBirth, hometownWithRegion } from '../src/lib/rules';

const entries: GlossaryRecord[] = [
  {
    id: '1',
    category: 'MAJOR' as never,
    english: 'Mechanical Engineering',
    aliases: ['ME', 'Mechanical Engg.'],
    japanese: '機械工学',
    gloss: null,
    region: null,
  },
  {
    id: '2',
    category: 'STATE' as never,
    english: 'Odisha',
    aliases: ['Orissa'],
    japanese: 'オディシャ州',
    gloss: null,
    region: '東インド',
  },
  {
    id: '3',
    category: 'TECH_TERM' as never,
    english: 'SolidWorks',
    aliases: [],
    japanese: 'SolidWorks',
    gloss: '3次元CADソフト',
    region: null,
  },
  {
    id: '4',
    category: 'TECH_TERM' as never,
    english: 'FEM',
    aliases: ['FEA', 'Finite Element Method'],
    japanese: 'FEM',
    gloss: '有限要素法。構造物を細かく分割して強度や変形を計算する手法',
    region: null,
  },
];

const glossary = new Glossary(entries);

function ctx(answers: Record<string, unknown>, extra: Partial<ProcessContext> = {}): ProcessContext {
  return {
    answers,
    glossary,
    rule: {},
    ...extra,
  };
}

const field = (over: Partial<FieldDefinition>): FieldDefinition => ({
  id: 'f1',
  code: 'test',
  nameJa: 'テスト項目',
  processing: 'COPY' as never,
  valueType: 'STRING' as never,
  sourceCodes: [],
  ...over,
});

beforeEach(() => setAiProvider(new MockAiProvider()));

describe('source resolution for repeating records', () => {
  it('substitutes the record index into an "x" placeholder', () => {
    expect(resolveSourceCode('E-x-6', 'E-2')).toBe('E-2-6');
    expect(resolveSourceCode('A-1-1', 'E-2')).toBe('A-1-1');
  });

  it('prefers source codes belonging to the record prefix', () => {
    // Education lists one question per row rather than a placeholder.
    const values = collectSourceValues(
      field({ sourceCodes: ['B-1-5', 'B-2-5', 'B-3-4'] }),
      ctx({ 'B-1-5': '2023-2025', 'B-2-5': '2019-2023' }, { recordPrefix: 'B-2' }),
    );
    expect(values).toHaveLength(1);
    expect(values[0].code).toBe('B-2-5');
  });
});

describe('COPY processing (spec §6, §4.1)', () => {
  it('strips the marker and English half of choice answers', async () => {
    const result = await processField(
      field({
        processing: 'COPY' as never,
        valueType: 'STRING_LIST' as never,
        sourceCodes: ['G-1-2'],
      }),
      ctx({
        'G-1-2': [
          '自動車／Automobile',
          'ロボティクス・FA（工場自動化）／Robotics & Factory Automation',
          '特にこだわらない／Not specific',
        ],
      }),
    );
    expect(result.valueJson).toEqual([
      '自動車',
      'ロボティクス・FA（工場自動化）',
      '特にこだわらない',
    ]);
    expect(result.usedAi).toBe(false);
  });

  it('drops "no experience" options', async () => {
    const result = await processField(
      field({
        processing: 'COPY' as never,
        valueType: 'STRING_LIST' as never,
        sourceCodes: ['D-1-9'],
      }),
      ctx({ 'D-1-9': ['SolidWorks', '使用経験なし／None'] }),
    );
    expect(result.valueJson).toEqual(['SolidWorks']);
  });

  it('keeps the source text so the reviewer can compare (§8.4)', async () => {
    const result = await processField(
      field({ processing: 'COPY' as never, sourceCodes: ['A-1-5'] }),
      ctx({ 'A-1-5': 'Osaka' }),
    );
    expect(result.sourceText).toContain('A-1-5');
    expect(result.sourceText).toContain('Osaka');
  });
});

describe('GLOSSARY processing (spec §8.5)', () => {
  it('substitutes known terms and reports unknown ones', async () => {
    const result = await processField(
      field({
        processing: 'GLOSSARY' as never,
        valueType: 'STRING_LIST' as never,
        glossaryCategory: 'MAJOR' as never,
        sourceCodes: ['B-1-3'],
      }),
      ctx({ 'B-1-3': 'Mechanical Engineering, Quantum Basketry' }),
    );
    expect(result.valueJson).toContain('機械工学');
    expect(result.unmatchedTerms).toContain('Quantum Basketry');
    expect(result.warnings[0]).toContain('辞書にない語');
  });

  it('matches aliases', async () => {
    const result = await processField(
      field({
        processing: 'GLOSSARY' as never,
        glossaryCategory: 'MAJOR' as never,
        sourceCodes: ['B-2-3'],
      }),
      ctx({ 'B-2-3': 'ME' }),
    );
    expect(result.valueJa).toBe('機械工学');
  });
});

describe('empty answers (spec §8.3)', () => {
  it('produces an empty value and never calls the AI', async () => {
    const result = await processField(
      field({
        processing: 'GENERATE' as never,
        sourceCodes: ['E-x-6'],
        generationPrompt: '概要を書く',
      }),
      ctx({ 'E-1-6': 'None' }, { recordPrefix: 'E-1' }),
    );
    expect(result.valueJa).toBe('');
    expect(result.usedAi).toBe(false);
  });

  it('treats a blank string as empty', async () => {
    const result = await processField(
      field({ processing: 'GENERATE' as never, sourceCodes: ['H-2-2'] }),
      ctx({ 'H-2-2': '   ' }),
    );
    expect(result.valueJa).toBe('');
  });
});

describe('GENERATE processing', () => {
  it('calls the provider and keeps figures from the source (§8.2)', async () => {
    const result = await processField(
      field({
        processing: 'GENERATE' as never,
        valueType: 'TEXT' as never,
        sourceCodes: ['E-x-10'],
        generationPrompt: '成果を書く',
      }),
      ctx(
        { 'E-1-10': 'Achieved over 92% detection accuracy and cut water use by 17%.' },
        { recordPrefix: 'E-1' },
      ),
    );
    expect(result.usedAi).toBe(true);
    expect(result.valueJa).toContain('92');
    expect(result.valueJa).toContain('17');
  });

  it('never sends the fields that chapter 13 excludes', async () => {
    const result = await processField(
      field({
        code: 'dietary',
        processing: 'GENERATE' as never,
        sourceCodes: ['A-1-7', 'A-1-8'],
      }),
      ctx({ 'A-1-7': 'Vegetarian (no egg)', 'A-1-8': 'Peanuts' }),
    );
    expect(result.usedAi).toBe(false);
    expect(result.warnings.join()).toContain('送信対象外');
  });
});

describe('rules', () => {
  it('derives age from the date of birth', () => {
    const result = ageFromDateOfBirth({
      answers: {},
      glossary,
      now: new Date('2026-09-16'),
      person: { dateOfBirth: new Date('2001-10-01') },
    });
    expect(result.text).toBe('24歳');
  });

  it('builds the hometown with its region from the table, not from the AI', () => {
    const result = hometownWithRegion({
      answers: { 'A-1-6': 'Odisha, Paradip' },
      glossary,
    });
    expect(result.text).toBe('Paradip・オディシャ州（東インド）');
  });

  it('flags a state the table does not know instead of guessing', () => {
    const result = hometownWithRegion({
      answers: { 'A-1-6': 'Atlantis' },
      glossary,
    });
    expect(result.unmatched).toContain('Atlantis');
    expect(result.note).toContain('州名');
  });
});

describe('glossary first-use annotation (spec §8.1)', () => {
  it('adds the supplied explanation the first time a term appears', () => {
    const text = glossary.annotateFirstUse(
      'FEMを用いて解析した。FEMの結果を検証した。',
    );
    expect(text).toContain('FEM（有限要素法。構造物を細かく分割して強度や変形を計算する手法）');
    // Only the first occurrence is annotated.
    expect(text.match(/有限要素法/g)).toHaveLength(1);
  });

  it('does not annotate when an explanation already follows', () => {
    const text = glossary.annotateFirstUse('SolidWorks（3次元CADソフト）を使用した。');
    expect(text.match(/3次元CADソフト/g)).toHaveLength(1);
  });
});
