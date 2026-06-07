// Cheap authenticated check that an API key works, used by the Settings UI's "Test"
// button. Hits each provider's models endpoint (free, no generation).
import type { ProviderId } from './types';

export async function validateKey(provider: ProviderId, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  if (!apiKey) return { ok: false, error: 'Empty key' };
  try {
    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    }
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
