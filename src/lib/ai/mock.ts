/**
 * Mock AI provider.
 *
 * Purpose: let the entire pipeline — import, generation, review, PDF — be
 * developed, demonstrated and tested before the AI service is chosen (spec §15
 * leaves the vendor open; phase 1 explicitly allows provisional prompts).
 *
 * It is deterministic: the same input always produces the same output, so
 * screenshots and tests are stable. It performs a genuine, if crude,
 * transformation so that output is obviously placeholder text and nobody
 * mistakes it for a finished sheet.
 */

import type { AiProvider, AiRequest, AiResponse } from './provider';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const CONNECTORS = ['また、', 'さらに、', 'あわせて、', 'その上で、'];

export class MockAiProvider implements AiProvider {
  readonly name = 'mock';
  readonly model = 'mock-model';

  async generate(request: AiRequest): Promise<AiResponse> {
    const started = Date.now();
    const userMessage = request.messages.filter((m) => m.role === 'user').pop();
    const source = userMessage?.content ?? '';

    // Pull the "原文" block out of the prompt, which is what would be rewritten.
    const sourceText =
      source.match(/<原文>\s*([\s\S]*?)\s*<\/原文>/)?.[1]?.trim() ?? '';

    // Where the prompt carries 確定事実 — findings a deterministic rule already
    // worked out — echo those instead of the generic placeholder. They are real,
    // correct Japanese, so a demo run shows something meaningful rather than
    // nonsense; only the fluency a real model would add is missing.
    const facts = source.match(/<確定事実>\s*([\s\S]*?)\s*<\/確定事実>/)?.[1]?.trim();
    if (facts) {
      return {
        text: `【AI未接続・仮出力】${facts}`,
        model: this.model,
        inputTokens: Math.ceil(source.length / 3),
        outputTokens: Math.ceil(facts.length / 3),
        durationMs: Date.now() - started,
      };
    }

    if (!sourceText) {
      return {
        text: '',
        model: this.model,
        durationMs: Date.now() - started,
      };
    }

    const seed = hash(sourceText);
    const connector = CONNECTORS[seed % CONNECTORS.length];

    // Keep every number that appears in the source (spec §8.2).
    //
    // The trailing `\s*` exists so that "50 %" is kept as one figure, but it
    // also greedily eats the "\n\n" that separates two source answers — which
    // put a literal newline inside the sentence below, printing a blank line
    // and a line starting with "、" on the sheet. Strip whitespace out of each
    // matched figure so a figure is only ever the number itself.
    const figures = (sourceText.match(/\d+(?:\.\d+)?\s*[%％]?/g) ?? [])
      .map((figure) => figure.replace(/\s+/g, ''))
      .filter(Boolean);
    const figureNote =
      figures.length > 0 ? `数値は${figures.slice(0, 4).join('、')}である。` : '';

    const condensed = sourceText
      .replace(/\s+/g, ' ')
      .slice(0, 120)
      .trim();

    const text =
      `【AI未接続・仮出力】${condensed}に関する内容である。` +
      `${connector}本文はモックプロバイダが生成したものであり、実際のAIサービス接続後に再生成が必要である。` +
      figureNote;

    return {
      text,
      model: this.model,
      inputTokens: Math.ceil(source.length / 3),
      outputTokens: Math.ceil(text.length / 3),
      durationMs: Date.now() - started,
    };
  }

  async healthCheck() {
    return {
      ok: true,
      detail: 'モックプロバイダで動作中。AIサービスは未接続である。',
    };
  }
}
