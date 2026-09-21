/**
 * Amazon Bedrock provider.
 *
 * Bedrock runs inside AWS, which is what §3 requires ("all processing must be
 * completed inside AWS; do not send data to external services"), and Bedrock
 * does not use submitted data for training, which is what §13 requires the
 * chosen service to guarantee.
 *
 * Credentials: on EC2 the instance role is used automatically, so no keys are
 * stored in the application. See docs/AWS-REQUIREMENTS.md.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
} from '@aws-sdk/client-bedrock-runtime';
import { getEnv } from '@/lib/env';
import { AiError, type AiProvider, type AiRequest, type AiResponse } from './provider';

export class BedrockAiProvider implements AiProvider {
  readonly name = 'bedrock';
  readonly model: string;
  private client: BedrockRuntimeClient;

  constructor() {
    const env = getEnv();
    this.model = env.AI_MODEL;
    this.client = new BedrockRuntimeClient({
      region: env.AI_REGION,
      ...(env.AI_API_KEY
        ? {
            credentials: {
              accessKeyId: env.AI_API_KEY,
              secretAccessKey: env.AI_BASE_URL ?? '',
            },
          }
        : {}),
    });
  }

  async generate(request: AiRequest): Promise<AiResponse> {
    const env = getEnv();
    const started = Date.now();

    const system = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => ({ text: m.content }));

    const messages: Message[] = request.messages
      .filter((m) => m.role === 'user')
      .map((m) => ({ role: 'user' as const, content: [{ text: m.content }] }));

    try {
      const response = await this.client.send(
        new ConverseCommand({
          modelId: this.model,
          system,
          messages,
          inferenceConfig: {
            temperature: request.temperature ?? env.AI_TEMPERATURE,
            maxTokens: request.maxTokens ?? env.AI_MAX_TOKENS,
          },
        }),
      );

      const text =
        response.output?.message?.content
          ?.map((c) => ('text' in c ? c.text : ''))
          .join('')
          .trim() ?? '';

      return {
        text,
        model: this.model,
        inputTokens: response.usage?.inputTokens,
        outputTokens: response.usage?.outputTokens,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      throw new AiError(
        `Bedrock の呼び出しに失敗した: ${(error as Error).message}`,
        this.name,
        error,
      );
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
