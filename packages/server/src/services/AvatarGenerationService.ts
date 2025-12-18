/**
 * AvatarGenerationService
 *
 * Generates square avatar images via OpenRouter image models using the Autopilot LLM node
 * (executed through the remote runner).
 */
import { ExecutionItemUtils, RunnerFactory } from '@starships/autopilot';
import type { Blueprint, EngineConfig, LLMResponse } from '@starships/autopilot';
import { getEnvConfig } from '@starships/env';

export type AvatarGenerationResult = {
  /** data URL from OpenRouter: data:image/png;base64,... */
  dataUrl: string;
  mimeType: string;
  buffer: Buffer;
  /** Optional text caption returned by model */
  text?: string;
  /** Model used */
  model: string;
};

export class AvatarGenerationService {
  /**
   * Generate a 1:1 avatar for an agent-like entity.
   */
  async generateAvatar(options: {
    subjectName: string;
    subjectDescription?: string;
    styleHint?: string;
    starshipId: string;
    runtimeEnv?: Record<string, unknown>;
  }): Promise<AvatarGenerationResult> {
    const env = getEnvConfig();
    if (!env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured on server');
    }

    const model = 'google/gemini-2.5-flash-image';

    const system = [
      'You generate high-quality square avatar images for AI agents.',
      'Safety and style rules:',
      '- Do not depict real people, celebrities, brand logos, or copyrighted characters.',
      '- No NSFW, violence, hate, or illegal content.',
      '- Keep it friendly, professional, and readable at small sizes.',
      '- Prefer a clean background and a single clear subject silhouette/mark.',
      '- Return an image. Text output (if any) must be short.',
    ].join('\n');

    const user = [
      `Create a 1:1 avatar image for an AI agent.`,
      `Name: ${options.subjectName}`,
      options.subjectDescription ? `Description: ${options.subjectDescription}` : undefined,
      options.styleHint ? `Style hint: ${options.styleHint}` : undefined,
    ]
      .filter(Boolean)
      .join('\n');

    const blueprint: Blueprint = {
      nodes: [
        { ref: 'start_1', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
        {
          ref: 'llm_1',
          type: 'llm',
          name: 'Generate avatar',
          description: 'Generate avatar image using OpenRouter image model',
          parameters: {
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            modalities: ['image', 'text'],
            imageConfig: { aspect_ratio: '1:1' },
            // Keep text short; primary output is the image
            maxTokens: 256,
            temperature: 0.7,
          },
        },
        { ref: 'end_1', type: 'end', name: 'End', description: 'End node', parameters: {} },
      ],
      edges: [
        { ref: 'e1', from: 'start_1', to: 'llm_1' },
        { ref: 'e2', from: 'llm_1', to: 'end_1' },
      ],
      metadata: {},
    };

    const exec = ExecutionItemUtils.createExecution();
    exec.state = {
      ...(exec.state ?? {}),
      starshipId: options.starshipId,
    };

    const engineConfig = {
      runtimeEnv: { STARSHIP_ID: options.starshipId, ...(options.runtimeEnv ?? {}) },
      llm: { apiKey: env.OPENROUTER_API_KEY, baseUrl: 'https://openrouter.ai/api/v1' },
      failOnNodeError: true,
    } as unknown as EngineConfig & { llm?: { apiKey: string; baseUrl?: string } };

    const runner = RunnerFactory.getTopLevelRunner(exec.depth ?? 0);
    await runner.run(blueprint, exec, engineConfig);

    const llmResult = [...(exec.results || [])].reverse().find((r) => r.nodeRef === 'llm_1');
    const llmJson = llmResult?.items?.[0]?.json as unknown;
    const response = llmJson as LLMResponse | undefined;

    const message = response?.choices?.[0]?.message as any;
    const text = typeof message?.content === 'string' ? message.content : undefined;
    const images = Array.isArray(message?.images) ? message.images : [];
    const firstUrl = images?.[0]?.image_url?.url;
    if (typeof firstUrl !== 'string' || firstUrl.length === 0) {
      throw new Error('Image generation returned no images');
    }

    const { buffer, mimeType } = this.decodeDataUrl(firstUrl);
    return { dataUrl: firstUrl, mimeType, buffer, ...(text ? { text } : {}), model };
  }

  private decodeDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
    const url = String(dataUrl || '');
    if (!url.startsWith('data:')) {
      throw new Error('Expected image data URL from OpenRouter');
    }

    const commaIdx = url.indexOf(',');
    if (commaIdx < 0) {
      throw new Error('Invalid data URL (missing comma)');
    }

    const header = url.slice(5, commaIdx); // after 'data:'
    const payload = url.slice(commaIdx + 1);

    const headerParts = header.split(';').map((s) => s.trim());
    const mimeType = headerParts[0] || 'application/octet-stream';
    const isBase64 = headerParts.includes('base64');
    if (!isBase64) {
      throw new Error('Expected base64 data URL');
    }

    return { mimeType, buffer: Buffer.from(payload, 'base64') };
  }
}
