/**
 * OpenAI-compatible provider (chat/completions shape).
 *
 * Used for Google's Gemini API through its OpenAI-compatible endpoint
 * (AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai),
 * adopted 2026-09-24 in place of Bedrock. That sends answers outside AWS, so
 * it requires Sano-san's written approval before use with real data (spec §3,
 * docs/AWS-REQUIREMENTS.md §4). Any other OpenAI-compatible endpoint works the
 * same way without code changes.
 */

import { getEnv } from '@/lib/env';
import { AiError, type AiProvider, type AiRequest, type AiResponse } from './provider';

export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = 'openai-compatible';
  readonly model: string;

  constructor() {
    this.model = getEnv().AI_MODEL;
  }

  async generate(request: AiRequest): Promise<AiResponse> {
    const env = getEnv();
    if (!env.AI_BASE_URL) {
      throw new AiError('AI_BASE_URL が設定されていない', this.name);
    }
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);

    try {
      const res = await fetch(`${env.AI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(env.AI_API_KEY ? { Authorization: `Bearer ${env.AI_API_KEY}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          messages: request.messages,
          temperature: request.temperature ?? env.AI_TEMPERATURE,
          max_tokens: request.maxTokens ?? env.AI_MAX_TOKENS,
          stream: false,
          ...(env.AI_REASONING_EFFORT ? { reasoning_effort: env.AI_REASONING_EFFORT } : {}),
        }),
      });

      if (!res.ok) {
        throw new AiError(
          `AIエンドポイントが ${res.status} を返した: ${await res.text()}`,
          this.name,
        );
      }

      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      // Out of tokens mid-answer. A thinking model (Gemini Pro) can spend
      // most of AI_MAX_TOKENS before it writes a word, and what comes back is
      // then half a sentence. That must never be saved as if it were the text.
      if (body.choices?.[0]?.finish_reason === 'length') {
        throw new AiError(
          'AIの回答が途中で切れた（出力の上限に達した）。AI_MAX_TOKENS を増やすこと',
          this.name,
        );
      }

      return {
        text: body.choices?.[0]?.message?.content?.trim() ?? '',
        model: this.model,
        inputTokens: body.usage?.prompt_tokens,
        outputTokens: body.usage?.completion_tokens,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      if (error instanceof AiError) throw error;
      throw new AiError(
        `AIエンドポイントの呼び出しに失敗した: ${(error as Error).message}`,
        this.name,
        error,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck() {
    try {
      await this.generate({
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 8,
        purpose: 'healthcheck',
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, detail: (error as Error).message };
    }
  }
}
