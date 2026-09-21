import { describe, expect, it } from 'vitest';
import { patentsCombined, publicationsCombined, thesisSupervisorFact } from '../src/lib/rules';
import { Glossary } from '../src/lib/glossary/glossary';

const glossary = new Glossary([]);
const ctx = (answers: Record<string, unknown>) => ({ answers, glossary });

const CITATION =
  'Nair, P. ほか「太陽光発電システムにおける最大電力点追従制御の改良」IEEE国際会議、2025年、査読あり。';

/**
 * Sano-san's rule for every 有無 + 詳細 pair: content alone, or 「なし」.
 * Exercised through both fields that use it, so a change to one cannot
 * silently diverge from the other.
 */
describe.each([
  {
    name: '論文・学会発表',
    run: publicationsCombined,
    presence: 'H-2-1',
    detail: 'H-2-2',
    yes: '査読付き国際会議で発表済み／Presented at a peer-reviewed international conference',
    yesJa: '査読付き国際会議で発表済み',
    content: CITATION,
  },
  {
    name: '特許',
    run: patentsCombined,
    presence: 'H-2-5',
    detail: 'H-2-6',
    yes: '取得済み／Granted',
    yesJa: '取得済み',
    content: '「太陽光発電用の最大電力点追従装置」インド特許第000000号、2025年取得。',
  },
])('$name（有無＋詳細）', ({ run, presence, detail, yes, yesJa, content }) => {
  it('内容があるときは内容だけを表示し、有無の回答は表示しない', () => {
    expect(run(ctx({ [presence]: yes, [detail]: content }))).toEqual({ text: content });
  });

  it('「あり」と回答されていても見出しは付けない', () => {
    expect(run(ctx({ [presence]: 'あり／Yes', [detail]: content })).text).toBe(content);
  });

  it('「なし／None」のときは「なし」と表示する', () => {
    expect(run(ctx({ [presence]: 'なし／None', [detail]: '' })).text).toBe('なし');
  });

  it('「なし」を選んで詳細が残っていても、内容が優先される', () => {
    // The detail box is what the reader is shown, so a stale entry must not be
    // hidden behind a 「なし」 the person forgot to change back.
    expect(run(ctx({ [presence]: 'なし／None', [detail]: content })).text).toBe(content);
  });

  it('内容があると答えて詳細が空のときは、有無の回答を日本語側だけ表示し確認を促す', () => {
    const result = run(ctx({ [presence]: yes, [detail]: '' }));
    expect(result.text).toBe(yesJa);
    expect(result.text).not.toMatch(/[A-Za-z]/);
    expect(result.note).toBeTruthy();
  });

  it('回答がなければ空を返し、項目は印字されない', () => {
    expect(run(ctx({})).text).toBe('');
  });
});

describe('修士論文・卒業論文の指導教員・研究室（確定事実）', () => {
  it('H-2-4を確定事実の一行として渡す', () => {
    expect(thesisSupervisorFact(ctx({ 'H-2-4': 'IITカンプール 電気工学科 R. Sharma研究室' })).text).toBe(
      '指導教員・研究室：IITカンプール 電気工学科 R. Sharma研究室',
    );
  });

  it('未回答なら何も渡さない', () => {
    expect(thesisSupervisorFact(ctx({})).text).toBe('');
  });
});
