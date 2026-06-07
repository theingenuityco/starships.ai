// Maps a { provider, model, apiKey } triple to a Vercel AI SDK LanguageModel.
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { ProviderId } from './types';

/** Resolve the API key for a provider: explicit override first, then env. */
export function resolveApiKey(provider: ProviderId, override?: string): string | undefined {
  if (override) return override;
  return provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
}

/** Build a LanguageModel for the given provider/model, keyed by `apiKey`. */
export function resolveModel(provider: ProviderId, model: string, apiKey: string): LanguageModel {
  switch (provider) {
    case 'anthropic':
      return createAnthropic({ apiKey })(model);
    case 'openai':
      return createOpenAI({ apiKey })(model);
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unknown provider: ${String(exhaustive)}`);
    }
  }
}
