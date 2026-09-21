/**
 * OpenAI-compatible provider (chat/completions shape).
 *
 * Present so that a self-hosted model inside the VPC, or an approved managed
 * endpoint, can be used without touching application code. Not enabled by
 * default: §3 forbids sending data outside AWS, so AI_BASE_URL must point at an
 * endpoint inside the AWS boundary.
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
        }),
      });

      if (!res.ok) {
        throw new AiError(
          `AIエンドポイントが ${res.status} を返した: ${await res.text()}`,
          this.name,
        );
      }

      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

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
