/**
 * Prompt assembly.  Specification chapters 8 and 9.
 *
 * The per-field instruction comes from SheetField.generationPrompt, which an
 * operator edits on screen (§5.3: "holding the generation prompts in the table
 * lets operators tune the AI output from the screen... it must not require a
 * developer"). This module only wraps that instruction with the fixed rules
 * that apply to every field.
 */

import type { AiMessage } from '@/lib/ai/provider';

export const BASE_RULES = `あなたはインド工科大学出身の技術者のスキルシートを作成する担当者である。
英文の回答を日本語に書き直す。読み手は技術の専門家とは限らないため、専門家以外にも伝わる表現にする。

必ず守ること:
- 常体（だ・である調）で書く。敬体（です・ます調）は使用しない。
- 回答に書かれていない内容を推測で補わない。他の項目の内容で埋めない。
- ツール名・企業名・固有名詞は削除しない。
- 本文中の数値（精度93.5%、約17%削減など）は必ず残す。平易化や短縮を理由に数値を落とさない。
- 略語は初出時に正式名称を併記する。
- 大学の課題として行ったのか、企業での実務なのかを明示する。
- 英文特有の前置きや修辞は削り、事実を先に書く。
- 手法名や成果だけを列挙せず、何をどの順番で行ったかが追える書き方にする。
- 句読点は全角の「、」「。」を用いる。数字と英字は半角を用いる。
- 日本語と英数字の間に空白を入れない。中黒は全角の「・」を用いる。
- 「堪能」「流暢」のような根拠の曖昧な評価語は使用しない。
- 出力は本文のみとする。前置き、見出し、箇条書き記号、説明文は付けない。`;

export type PromptInput = {
  fieldNameJa: string;
  /** Operator-editable instruction for this field. */
  instruction?: string | null;
  /** The English answer(s) this field is built from. */
  sourceText: string;
  targetLengthMin?: number | null;
  targetLengthMax?: number | null;
  /** Glossary substitutions that must be used verbatim. */
  glossaryHints?: Array<{ term: string; japanese: string; gloss?: string | null }>;
  /** Extra instruction typed by the operator for this single regeneration (§7.4). */
  operatorPrompt?: string | null;
  /** Current value, supplied when the operator asks for a revision. */
  currentValue?: string | null;
  /** True for TRANSLATE processing: translate faithfully, never summarise. */
  translateOnly?: boolean;
  /**
   * Findings a deterministic rule already worked out, which the AI must not
   * contradict. Used where a judgement has to be exactly right every time but
   * the wording should still read naturally — the JLPT description being the
   * case that prompted it: pass or fail is arithmetic, the explanation is not.
   */
  facts?: string | null;
};

export function buildMessages(input: PromptInput): AiMessage[] {
  const parts: string[] = [];

  parts.push(`項目名: ${input.fieldNameJa}`);

  if (input.translateOnly) {
    parts.push(
      '処理: 原文を日本語に翻訳する。要約・圧縮・省略は行わない。著者順、査読の有無、掲載誌名、年、番号などの情報を落とさない。',
    );
  } else if (input.instruction) {
    parts.push(`指示: ${input.instruction}`);
  } else {
    parts.push('指示: 原文の内容を、専門家以外にも伝わる平易な日本語に書き直す。');
  }

  if (input.targetLengthMin || input.targetLengthMax) {
    const min = input.targetLengthMin ?? '';
    const max = input.targetLengthMax ?? '';
    parts.push(
      `分量の目安: ${min && max ? `${min}〜${max}字` : max ? `${max}字以内` : `${min}字以上`}`,
    );
  }

  if (input.glossaryHints?.length) {
    const lines = input.glossaryHints
      .map((h) =>
        h.gloss
          ? `- ${h.term} → ${h.japanese}（初出時の補足: ${h.gloss}）`
          : `- ${h.term} → ${h.japanese}`,
      )
      .join('\n');
    parts.push(
      `用語の訳語（必ずこの表記を使用し、別の訳語を作らない）:\n${lines}`,
    );
  }

  if (input.currentValue) {
    parts.push(`<現在の文章>\n${input.currentValue}\n</現在の文章>`);
  }

  if (input.operatorPrompt) {
    parts.push(
      `担当者からの追加指示（最優先で従う）: ${input.operatorPrompt}`,
    );
  }

  if (input.facts) {
    parts.push(
      `<確定事実>\n${input.facts}\n</確定事実>\n` +
        '確定事実は判定済みの内容である。これに反する記述をしてはならない。' +
        '合否・点数・基準点は確定事実のとおりに書き、変更・再判定しない。',
    );
  }

  parts.push(`<原文>\n${input.sourceText}\n</原文>`);

  return [
    { role: 'system', content: BASE_RULES },
    { role: 'user', content: parts.join('\n\n') },
  ];
}
