import { describe, expect, it } from 'vitest';
import { checkStyle, hasJapanese, normaliseJapanese } from '../src/lib/style/text';
import {
  cleanChoice,
  cleanChoiceList,
  cleanGrid,
  isNoneOption,
  japaneseSideOfOption,
  stripLeadingMarker,
} from '../src/lib/style/choice';

describe('normaliseJapanese (spec §9.2)', () => {
  it('converts full-width numerals and Latin letters to half width', () => {
    expect(normaliseJapanese('２０２４年５月')).toBe('2024年5月');
    expect(normaliseJapanese('Ｐｙｔｈｏｎを使用')).toBe('Pythonを使用');
  });

  it('removes spaces between Japanese and Latin or numerals', () => {
    expect(normaliseJapanese('Python および PyTorch を用いて')).toBe(
      'PythonおよびPyTorchを用いて',
    );
    expect(normaliseJapanese('精度 93.5 %を達成')).toContain('93.5');
  });

  it('uses the half-width percent sign', () => {
    expect(normaliseJapanese('約17％削減')).toBe('約17%削減');
  });

  it('uses the full-width middle dot', () => {
    expect(normaliseJapanese('設計･実装･評価')).toBe('設計・実装・評価');
  });

  it('uses full-width parentheses around Japanese content', () => {
    expect(normaliseJapanese('有限要素法(FEM)')).toBe('有限要素法(FEM)');
    expect(normaliseJapanese('FEM(有限要素法)')).toBe('FEM（有限要素法）');
  });

  it('converts western punctuation between Japanese to full width', () => {
    expect(normaliseJapanese('設計，検証')).toBe('設計、検証');
  });
});

describe('hasJapanese', () => {
  it('detects kana and kanji', () => {
    expect(hasJapanese('機械工学')).toBe(true);
    expect(hasJapanese('ジョドプール')).toBe(true);
    expect(hasJapanese('Mechanical Engineering')).toBe(false);
  });
});

describe('japaneseSideOfOption (spec §4.1)', () => {
  it('keeps the Japanese half and drops the English half', () => {
    expect(
      japaneseSideOfOption(
        'A1. システムエンジニア（要件定義・設計）／System Engineer (Requirements & Design)',
      ),
    ).toBe('システムエンジニア（要件定義・設計）');
  });

  it('keeps the Japanese side when it is on the right', () => {
    expect(japaneseSideOfOption('IIT Jodhpur／IITジョドプール')).toBe('IITジョドプール');
  });

  it('does not split option strings that are not translation pairs', () => {
    expect(japaneseSideOfOption('Git／GitHub')).toBe('Git／GitHub');
    expect(japaneseSideOfOption('Jupyter Notebook／Google Colab')).toBe(
      'Jupyter Notebook／Google Colab',
    );
    expect(japaneseSideOfOption('ESP32／ESP8266')).toBe('ESP32／ESP8266');
  });

  it('handles three-segment options', () => {
    expect(japaneseSideOfOption('DSC／TGA（熱分析）／Thermal Analysis')).toBe(
      'DSC／TGA（熱分析）',
    );
  });

  it('handles options with a full-width colon', () => {
    expect(japaneseSideOfOption('PLC：三菱電機／Mitsubishi Electric')).toBe(
      'PLC：三菱電機',
    );
  });

  it('strips the leading enumeration marker', () => {
    expect(stripLeadingMarker('B3. 制御盤設計')).toBe('制御盤設計');
    expect(stripLeadingMarker('① 授業で習った')).toBe('授業で習った');
  });
});

describe('isNoneOption', () => {
  it('recognises the "no experience" options', () => {
    expect(isNoneOption('使用経験なし／None')).toBe(true);
    expect(isNoneOption('経験なし／None')).toBe(true);
    expect(isNoneOption('取得していない／Not certified')).toBe(true);
    expect(isNoneOption('Python')).toBe(false);
  });
});

describe('cleanChoiceList', () => {
  it('drops "none" entries and de-duplicates', () => {
    expect(
      cleanChoiceList(['Python', 'C++', '使用経験なし／None', 'Python']),
    ).toEqual(['Python', 'C++']);
  });

  it('accepts a comma-separated string', () => {
    expect(cleanChoiceList('Python, MATLAB')).toEqual(['Python', 'MATLAB']);
  });

  it('returns an empty list for an empty answer', () => {
    expect(cleanChoiceList(null)).toEqual([]);
    expect(cleanChoiceList('')).toEqual([]);
  });

  it('keeps bilingual entries as their Japanese half', () => {
    expect(
      cleanChoiceList([
        '自動車／Automobile',
        'ロボティクス・FA（工場自動化）／Robotics & Factory Automation',
      ]),
    ).toEqual(['自動車', 'ロボティクス・FA（工場自動化）']);
  });
});

describe('cleanChoice', () => {
  it('returns an empty string for a "none" answer', () => {
    expect(cleanChoice('取得していない／Not certified')).toBe('');
  });
});

describe('cleanGrid (spec §4.1 grid questions)', () => {
  it('reduces both rows and values to their Japanese half', () => {
    const result = cleanGrid({
      '機械専攻 → 土木・インフラ設計（BIM・CIM・3DCAD）／Mechanical → Civil & infrastructure design':
        '積極的に希望する／Actively prefer',
      '情報系以外 → ソフトウェア開発／Non-IT → Software development':
        '条件次第で受け入れられる／Acceptable depending on conditions',
    });
    expect(result).toHaveLength(2);
    expect(result[0].row).toBe('機械専攻 → 土木・インフラ設計（BIM・CIM・3DCAD）');
    expect(result[0].value).toBe('積極的に希望する');
  });
});

describe('checkStyle', () => {
  it('reports polite form in prose fields', () => {
    const issues = checkStyle('設計を担当しました。');
    expect(issues.some((i) => i.rule === 'tone')).toBe(true);
  });

  it('reports vague evaluative words', () => {
    const issues = checkStyle('日本語が堪能である。');
    expect(issues.some((i) => i.rule === 'vague-word')).toBe(true);
  });

  it('reports length outside the target range', () => {
    const issues = checkStyle('短い。', { min: 100, max: 200 });
    expect(issues.some((i) => i.rule === 'length')).toBe(true);
  });

  it('passes clean text', () => {
    const issues = checkStyle('設計と検証を担当した。', { min: 5, max: 100 });
    expect(issues).toHaveLength(0);
  });
});

describe('line structure on the printed sheet (禁則処理)', () => {
  it('never leaves a blank line inside a value', () => {
    expect(normaliseJapanese('数値は1、1、2\n\n、1である。')).toBe('数値は1、1、2、1である。');
    expect(normaliseJapanese('一行目\n\n\n二行目')).toBe('一行目\n二行目');
  });

  it('never starts a line with punctuation Japanese forbids there', () => {
    expect(normaliseJapanese('文の途中\n。次の文')).toBe('文の途中。次の文');
    expect(normaliseJapanese('項目\n、続き')).toBe('項目、続き');
    expect(normaliseJapanese('括弧\n）閉じ')).toBe('括弧）閉じ');
  });

  it('keeps a genuine single line break', () => {
    expect(normaliseJapanese('一行目\n二行目')).toBe('一行目\n二行目');
  });

  it('trims trailing spaces before a line break', () => {
    expect(normaliseJapanese('一行目　\n二行目')).toBe('一行目\n二行目');
  });
});
