import { describe, expect, it } from 'vitest';
import { Glossary, normaliseTerm } from '../src/lib/glossary/glossary';

const entry = (
  english: string,
  japanese: string,
  aliases: string[] = [],
  category = 'TECH_TERM',
) => ({
  id: english,
  category: category as never,
  english,
  aliases,
  japanese,
  gloss: null,
  region: null,
});

const glossary = new Glossary([
  entry('Machine Learning', '機械学習', ['ML']),
  entry('Database', 'データベース'),
  entry('Indian Institute of Technology Kanpur', 'IITカンプール', ['IIT Kanpur', 'IITK'], 'UNIVERSITY'),
]);

describe('用語の正規化', () => {
  it('日本語を残す', () => {
    // The old rule stripped every non-Latin character, so every Japanese term
    // normalised to '' and shared a single key — see the lookup test below.
    expect(normaliseTerm('データベース')).toBe('データベース');
    expect(normaliseTerm('機械学習')).toBe('機械学習');
    expect(normaliseTerm('CAD・3Dモデリング')).toBe('cad・3dモデリング');
  });

  it('英語は大文字小文字と前後の空白を無視する', () => {
    expect(normaliseTerm('  IIT Kanpur ')).toBe('iit kanpur');
    expect(normaliseTerm('Machine  Learning')).toBe('machine learning');
  });

  it('異なる日本語が同じキーにならない', () => {
    expect(normaliseTerm('データベース')).not.toBe(normaliseTerm('機械学習'));
  });
});

describe('対訳の検索', () => {
  it('日本語で引いても同じ語が返る', () => {
    expect(glossary.translate('TECH_TERM' as never, 'データベース').text).toBe('データベース');
    expect(glossary.translate('TECH_TERM' as never, '機械学習').text).toBe('機械学習');
  });

  it('辞書にない日本語は別の語に化けず、未一致として報告される', () => {
    // The defect this guards: 画像処理 came back as 機械学習 with matched:true,
    // so a wrong word reached the printed sheet and nothing warned anybody.
    const result = glossary.translate('TECH_TERM' as never, '画像処理');
    expect(result.text).toBe('画像処理');
    expect(result.matched).toBe(false);
  });

  it('英語と別表記から日本語に変換する', () => {
    expect(glossary.translate('TECH_TERM' as never, 'Database').text).toBe('データベース');
    expect(glossary.translate('TECH_TERM' as never, 'ML').text).toBe('機械学習');
    expect(glossary.translate('UNIVERSITY' as never, 'IITK').text).toBe('IITカンプール');
  });

  it('分類をまたいで一致しない', () => {
    expect(glossary.translate('UNIVERSITY' as never, 'Database').matched).toBe(false);
  });
});
