import { getEnv } from '@/lib/env';
import { MockAiProvider } from './mock';
import { BedrockAiProvider } from './bedrock';
import { OpenAiCompatibleProvider } from './openai-compatible';
import type { AiProvider } from './provider';

let cached: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (cached) return cached;
  const env = getEnv();
  switch (env.AI_PROVIDER) {
    case 'bedrock':
      cached = new BedrockAiProvider();
      break;
    case 'openai-compatible':
      cached = new OpenAiCompatibleProvider();
      break;
    case 'mock':
    default:
      cached = new MockAiProvider();
      break;
  }
  return cached;
}

/** Test helper. */
export function setAiProvider(provider: AiProvider | null): void {
  cached = provider;
}

export * from './provider';
