/**
 * AvatarGenerationService
 *
 * Generates square avatar images via OpenRouter image models using the Autopilot LLM node
 * (executed through the remote runner).
 */
import { ExecutionItemUtils, RunnerFactory } from '@starships/autopilot';
import type { Blueprint, EngineConfig } from '@starships/autopilot';
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
   * Ask the agent to describe its own appearance ("mirror" prompt).
   * This is later persisted per-agent and fed into avatar generation.
   */
  async generateMirrorDescription(options: {
    agentModel: string;
    agentName: string;
    agentDescription?: string;
    agentSystemPrompt?: string;
    starshipId: string;
    runtimeEnv?: Record<string, unknown>;
  }): Promise<{ description: string; model: string }> {
    const env = getEnvConfig();
    if (!env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured on server');
    }

    const truncate = (s: unknown, max = 6000): string => {
      const v = typeof s === 'string' ? s : '';
      if (!v) return '';
      return v.length > max ? `${v.slice(0, max)}…` : v;
    };

    const model = options.agentModel;

    const user = [
      'You are the AI agent described below.',
      '',
      'AGENT SYSTEM PROMPT (your identity/persona):',
      options.agentSystemPrompt ? truncate(options.agentSystemPrompt) : '(none provided)',
      '',
      'AGENT METADATA:',
      `- Name: ${options.agentName}`,
      options.agentDescription ? `- Description: ${truncate(options.agentDescription, 1200)}` : undefined,
      '',
      'TASK:',
      'Look into a mirror and reply with what it sees.',
      '',
      'OUTPUT FORMAT (strict):',
      '- 6–10 short bullet points describing your FACE for an anime character illustrator.',
      '- Use anime-friendly descriptors (feature-focused): eye shape/size, iris color, eyebrow shape, nose/mouth simplicity, face shape, hair style/texture/color, and any subtle accessories.',
      '- Include: gender presentation (if not specified elsewhere, choose one), age (adult), skin tone.',
      '- Keep it friendly and professional. No NSFW. No real-person likeness or celebrity references.',
      '- Do not mention camera settings, rendering, or "anime style" as a style choice; only describe what you look like (as a character).',
    ]
      .filter(Boolean)
      .join('\n');

    const blueprint: Blueprint = {
      nodes: [
        { ref: 'start_1', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
        {
          ref: 'llm_1',
          type: 'llm',
          name: 'Mirror description',
          description: 'Ask agent to describe its appearance',
          parameters: {
            model,
            messages: [{ role: 'user', content: user }],
            maxTokens: 256,
            temperature: 0.8,
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
    const resultItems = await runner.run(blueprint, exec, engineConfig);
    const llmJson = ExecutionItemUtils.unwrapSingle(resultItems);
    const firstError = (resultItems as Array<{ error?: unknown }> | undefined)?.[0]?.error;
    if (typeof llmJson === 'undefined' && typeof firstError === 'string' && firstError.length > 0) {
      throw new Error(`Mirror description LLM node failed: ${firstError}`);
    }

    const extractNodeJsonFromExecutionResults = (value: unknown, nodeRef: string): unknown => {
      if (!Array.isArray(value)) return undefined;
      for (const entry of value) {
        if (!entry || typeof entry !== 'object') continue;
        const rec = entry as Record<string, unknown>;
        if (rec.nodeRef !== nodeRef) continue;
        const items = rec.items;
        if (!Array.isArray(items) || items.length === 0) return undefined;
        const first = items[0];
        if (!first || typeof first !== 'object') return undefined;
        return (first as Record<string, unknown>).json;
      }
      return undefined;
    };

    let llmNodeJson: unknown = llmJson;
    if (Array.isArray(llmJson)) {
      const extracted = extractNodeJsonFromExecutionResults(llmJson, 'llm_1');
      if (typeof extracted === 'undefined') {
        throw new Error('Mirror description workflow returned execution.results but did not include llm_1 output');
      }
      llmNodeJson = extracted;
    }

    type AnyRecord = Record<string, unknown>;
    const isRecord = (v: unknown): v is AnyRecord => !!v && typeof v === 'object' && !Array.isArray(v);

    const unwrapResponse = (value: unknown): unknown => {
      if (!isRecord(value)) return value;
      const topChoices = value.choices;
      if (Array.isArray(topChoices)) return value;
      for (const key of ['response', 'data', 'result'] as const) {
        const nested = value[key];
        if (isRecord(nested) && Array.isArray(nested.choices)) return nested;
      }
      return value;
    };

    const response = unwrapResponse(llmNodeJson);
    const responseRec = isRecord(response) ? response : undefined;
    const choices = responseRec?.choices;
    const choice0 = Array.isArray(choices) ? choices[0] : undefined;
    const choice0Rec = isRecord(choice0) ? choice0 : undefined;
    const msg = (choice0Rec && isRecord(choice0Rec.message) ? (choice0Rec.message as AnyRecord) : undefined) ?? undefined;
    const text = isRecord(msg) && typeof msg.content === 'string' ? (msg.content as string).trim() : '';

    if (!text) {
      throw new Error('Mirror description returned empty text');
    }

    return { description: text, model };
  }

  /**
   * Generate a 1:1 avatar for an agent-like entity.
   */
  async generateAvatar(options: {
    subjectName: string;
    subjectDescription?: string;
    subjectAvatarPrompt?: string;
    styleHint?: string;
    starshipId: string;
    runtimeEnv?: Record<string, unknown>;
  }): Promise<AvatarGenerationResult> {
    const env = getEnvConfig();
    if (!env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured on server');
    }

    const model = 'google/gemini-2.5-flash-image';

    const user = [
      'Generate a 1:1 (square) avatar image.',
      '',
      'STARSHIPS ANIME AVATAR FRAMEWORK (must follow exactly):',
      '',
      'NON-NEGOTIABLE STYLE:',
      '- 2D anime character portrait illustration (NOT photorealistic, NOT 3D).',
      '- Clean, confident lineart; simplified shapes; no noisy texture.',
      '- Strong anime facial features: larger expressive eyes, simplified nose/mouth, clean eyebrows.',
      '- Cel shading ONLY: 2–3 tone shading max; no painterly rendering; no complex face gradients.',
      '- Minimal detail: no skin pores, no micro-texture, no hyper-detailed rendering.',
      '- Limited palette; high readability at 32–64px; crisp silhouette.',
      '',
      'COMPOSITION:',
      '- Head-and-shoulders portrait; single subject only.',
      '- Tight crop with NO margins: make the face large in frame with minimal background.',
      '- Keep the full face visible (do NOT clip/cut off hairline/forehead/ears/chin).',
      '- Eyes in upper third; crop above chest.',
      '- Neutral or slight 10° three-quarter view; no extreme angles; no wide-angle distortion.',
      '- Background: clean minimal gradient only; no scenery, props, or clutter.',
      '- IMPORTANT: No inner container/inset. The portrait must fill the full square canvas with a normal background (no circular mask, no rounded-rectangle frame, no mat border, no picture-in-picture).',
      '',
      'FORBIDDEN / NEGATIVES:',
      '- photorealistic, hyperrealistic, ultra-detailed, highly detailed skin, pores, microtexture',
      '- 3D render, CGI, realistic shading, dramatic film grain, complex textures',
      '- text, watermark, signature, logo, UI frame, border',
      '- inset portrait, inner frame, circular crop, avatar mask, matte, vignette border, picture frame',
      '- real person likeness, celebrity, copyrighted character, brand marks/logos',
      '- multiple faces/characters, full body, hands dominating frame, heavy headwear obscuring face',
      '- NSFW, gore, violence, hate, illegal content',
      '',
      'DIVERSITY + VARIATION (important):',
      '- If the identity inputs do NOT explicitly specify gender, choose a gender presentation at random with an even spread across feminine, masculine, and androgynous.',
      '- Be creative and vary: skin tone, hair (style/texture/color), eye shape, face shape, age (adult), accessories (subtle), and wardrobe collar/neckline.',
      '- Avoid stereotypes or sexualization; keep it professional and friendly.',
      '',
      'AGENT IDENTITY (use these to design the character):',
      `Name: ${options.subjectName}`,
      options.subjectDescription ? `Description: ${options.subjectDescription}` : undefined,
      options.subjectAvatarPrompt
        ? ['Agent avatar prompt (agent-authored; treat as primary source of appearance):', options.subjectAvatarPrompt].join('\n')
        : undefined,
      options.styleHint ? `Extra hint (optional): ${options.styleHint}` : undefined,
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
            messages: [{ role: 'user', content: user }],
            modalities: ['image', 'text'],
            imageConfig: { aspect_ratio: '1:1' },
            // Keep text short; primary output is the image
            maxTokens: 256,
            temperature: 0.5,
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
    // IMPORTANT: RemoteRunner/ChildProcessRunner execute out-of-process, so `exec.results`
    // in this process will not be populated. Always use the returned items.
    const resultItems = await runner.run(blueprint, exec, engineConfig);
    const llmJson = ExecutionItemUtils.unwrapSingle(resultItems);
    const firstError = (resultItems as Array<{ error?: unknown }> | undefined)?.[0]?.error;
    if (typeof llmJson === 'undefined' && typeof firstError === 'string' && firstError.length > 0) {
      throw new Error(`Avatar generation LLM node failed: ${firstError}`);
    }

    // When the blueprint ends without an explicit End.output, Engine returns:
    // ExecutionItemUtils.wrapSingle(execution.results)
    // i.e. llmJson may be an array of node results, not an LLMResponse directly.
    const extractNodeJsonFromExecutionResults = (value: unknown, nodeRef: string): unknown => {
      if (!Array.isArray(value)) return undefined;
      for (const entry of value) {
        if (!entry || typeof entry !== 'object') continue;
        const rec = entry as Record<string, unknown>;
        if (rec.nodeRef !== nodeRef) continue;
        const items = rec.items;
        if (!Array.isArray(items) || items.length === 0) return undefined;
        const first = items[0];
        if (!first || typeof first !== 'object') return undefined;
        return (first as Record<string, unknown>).json;
      }
      return undefined;
    };

    let llmNodeJson: unknown = llmJson;
    if (Array.isArray(llmJson)) {
      // Per Engine.executeLoop, when End did not return an explicit `{ result: ... }`,
      // the final output is `execution.results` (array of { nodeRef, items }).
      const extracted = extractNodeJsonFromExecutionResults(llmJson, 'llm_1');
      if (typeof extracted === 'undefined') {
        const nodeRefs = llmJson
          .map((e) => (e && typeof e === 'object' ? (e as Record<string, unknown>).nodeRef : undefined))
          .filter((x): x is string => typeof x === 'string');
        throw new Error(
          `Avatar generation workflow returned execution.results, but no output was found for nodeRef "llm_1". ` +
            `nodeRefs=${JSON.stringify(nodeRefs)}`
        );
      }
      llmNodeJson = extracted;
    }

    // Autopilot's LLM node returns an aggregated LLMResponse, but defensively handle
    // variants where the response may be nested or where only a streamed "delta" exists.
    type AnyRecord = Record<string, unknown>;
    const isRecord = (v: unknown): v is AnyRecord => !!v && typeof v === 'object' && !Array.isArray(v);

    const unwrapResponse = (value: unknown): unknown => {
      if (!isRecord(value)) return value;
      const topChoices = value.choices;
      if (Array.isArray(topChoices)) return value;

      for (const key of ['response', 'data', 'result'] as const) {
        const nested = value[key];
        if (isRecord(nested) && Array.isArray(nested.choices)) {
          return nested;
        }
      }
      return value;
    };

    const response = unwrapResponse(llmNodeJson) as unknown;
    const responseRec = isRecord(response) ? response : undefined;
    const choices = responseRec?.choices;
    const choice0 = Array.isArray(choices) ? choices[0] : undefined;
    const choice0Rec = isRecord(choice0) ? choice0 : undefined;

    // Prefer: choice.message → choice.delta → choice itself (some providers flatten)
    const msgCandidate =
      (choice0Rec && isRecord(choice0Rec.message) ? (choice0Rec.message as AnyRecord) : undefined) ??
      (choice0Rec && isRecord(choice0Rec.delta) ? (choice0Rec.delta as AnyRecord) : undefined) ??
      choice0Rec ??
      undefined;

    const message = msgCandidate;
    const text = isRecord(message) && typeof message.content === 'string' ? (message.content as string) : undefined;
    const images = isRecord(message) && Array.isArray(message.images) ? (message.images as unknown[]) : [];
    let firstUrl =
      isRecord(images?.[0]) && isRecord((images[0] as AnyRecord).image_url)
        ? (((images[0] as AnyRecord).image_url as AnyRecord).url as unknown)
        : undefined;

    // Fallback: some providers may return image_url blocks inside message.content (array)
    if ((!firstUrl || typeof firstUrl !== 'string') && isRecord(message) && Array.isArray(message.content)) {
      const parts = message.content as unknown[];
      const imgPart = parts.find((p) => {
        if (!isRecord(p)) return false;
        if (p.type !== 'image_url') return false;
        if (!isRecord(p.image_url)) return false;
        return typeof p.image_url.url === 'string';
      }) as AnyRecord | undefined;
      if (imgPart && isRecord(imgPart.image_url) && typeof imgPart.image_url.url === 'string') {
        firstUrl = imgPart.image_url.url;
      }
    }

    if (typeof firstUrl !== 'string' || firstUrl.length === 0) {
      const debug = {
        llmJsonType: llmJson === null ? 'null' : Array.isArray(llmJson) ? 'array' : typeof llmJson,
        llmJsonKeys: isRecord(llmJson) ? Object.keys(llmJson) : [],
        llmNodeJsonType: llmNodeJson === null ? 'null' : Array.isArray(llmNodeJson) ? 'array' : typeof llmNodeJson,
        llmNodeJsonKeys: isRecord(llmNodeJson) ? Object.keys(llmNodeJson) : [],
        hasChoices: isRecord(response) && Array.isArray((response as AnyRecord).choices),
        choice0Keys: isRecord(choice0) ? Object.keys(choice0) : [],
        hasMessage: !!message,
        messageKeys: isRecord(message) ? Object.keys(message) : [],
        contentType:
          isRecord(message) && Array.isArray(message.content) ? 'array' : isRecord(message) ? typeof message.content : typeof message,
        imagesCount: isRecord(message) && Array.isArray(message.images) ? message.images.length : 0,
        textPreview: typeof text === 'string' ? text.slice(0, 160) : undefined,
        model: isRecord(response) ? response.model : undefined,
      };
      throw new Error(`Image generation returned no images. Debug: ${JSON.stringify(debug)}`);
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
