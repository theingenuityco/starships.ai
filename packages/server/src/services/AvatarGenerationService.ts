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
    agentName: string;
    agentDescription?: string;
    agentBlueprint: Blueprint;
    agentTools?: unknown[];
    starshipId: string;
    runtimeEnv?: Record<string, unknown>;
  }): Promise<{ description: string; model: string }> {
    const env = getEnvConfig();
    if (!env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured on server');
    }

    const truncate = (s: unknown, max = 3000): string => {
      const v = typeof s === 'string' ? s : '';
      if (!v) return '';
      return v.length > max ? `${v.slice(0, max)}…` : v;
    };

    const user = [
      'Write a compact avatar appearance prompt for yourself (anime character). You may invent details to be memorable.',
      '',
      `Name: ${options.agentName}`,
      options.agentDescription ? `Description: ${truncate(options.agentDescription, 800)}` : undefined,
      '',
      'Output (STRICT): exactly 8 lines; each line starts with "- " (dash+space); no other text.',
      'Line 1 MUST be exactly: "- Gender: male" OR "- Gender: female" (choose one).',
      '',
      'Lines 2–8 (keep each short, vivid, and concrete):',
      '- Age: adult (20s–40s)',
      '- Skin: tone/undertone',
      '- Face: shape + jawline',
      '- Eyes: very large expressive anime eyes; shape + iris color + catchlights; bold upper lash line',
      '- Brows/Nose/Mouth: brows style + simplified small nose + simplified small mouth',
      '- Hair: style + texture + color (allow one unusual accent like a streak)',
      '- Outfit: collar/neckline/top colors (visible in head-and-shoulders avatar)',
      '- Signature: ONE distinctive detail (small accessory or subtle mark); or "none"',
      '',
      'Constraints: adult; fictional original; no real-person likeness; no celebrities; no copyrighted characters; no brands/logos; no NSFW; do not mention camera/rendering/engine/art-style terms.',
    ]
      .filter(Boolean)
      .join('\n');

    const inputBlueprint = options.agentBlueprint;
    if (!inputBlueprint || !Array.isArray(inputBlueprint.nodes) || inputBlueprint.nodes.length === 0) {
      throw new Error('Agent blueprint is missing or empty; cannot generate avatarPrompt via agent blueprint');
    }

    // Pick a primary LLM node to extract text from. For default agent blueprints this is usually "ai_assistant".
    const llmRefs = inputBlueprint.nodes
      .filter((n) => n && typeof n === 'object' && (n as { type?: unknown }).type === 'llm')
      .map((n) => (n as { ref?: unknown }).ref)
      .filter((r): r is string => typeof r === 'string' && r.trim().length > 0);
    const llmNodeRef = llmRefs.length > 0 ? llmRefs[llmRefs.length - 1] : undefined;
    if (!llmNodeRef) {
      throw new Error('Agent blueprint contains no LLM node; cannot generate avatarPrompt via agent blueprint');
    }

    // Override temperature for the mirror generation LLM node to encourage creative but consistent identity details.
    const blueprint: Blueprint = {
      ...inputBlueprint,
      nodes: inputBlueprint.nodes.map((n) => {
        if (!n || typeof n !== 'object') return n;
        // `Node` is not index-signature compatible; cast via `unknown` for safe structural access.
        const rec = n as unknown as Record<string, unknown>;
        if (rec.type !== 'llm' || rec.ref !== llmNodeRef) return n;
        const params = (
          rec.parameters && typeof rec.parameters === 'object' && !Array.isArray(rec.parameters)
            ? (rec.parameters as Record<string, unknown>)
            : {}
        ) as Record<string, unknown>;
        return {
          ...rec,
          parameters: {
            ...params,
            temperature: 1.1,
            // IMPORTANT: Gemini 3 variants can split "final" content across turns;
            // disable streaming so we only parse a complete response.
            stream: false,
          },
        } as unknown as typeof n;
      }),
    };

    const exec = ExecutionItemUtils.createExecution();
    exec.state = {
      ...(exec.state ?? {}),
      starshipId: options.starshipId,
      // IMPORTANT: We intentionally do NOT inject any system prompt.
      // The agent blueprint reads messages from state.messages; we provide only the mirror prompt as input.
      messages: [{ role: 'user', content: user }],
      tools: Array.isArray(options.agentTools) ? options.agentTools : [],
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
      throw new Error(`Mirror description agent blueprint failed: ${firstError}`);
    }

    const extractNodeJsonFromExecutionResults = (value: unknown, nodeRef: string): unknown => {
      if (!Array.isArray(value)) return undefined;
      // Take the last recorded output for the nodeRef
      for (let i = value.length - 1; i >= 0; i--) {
        const entry = value[i];
        if (!entry || typeof entry !== 'object') continue;
        const rec = entry as Record<string, unknown>;
        if (rec.nodeRef !== nodeRef) continue;
        const items = rec.items;
        if (!Array.isArray(items) || items.length === 0) return undefined;
        const last = items[items.length - 1];
        if (!last || typeof last !== 'object') return undefined;
        return (last as Record<string, unknown>).json;
      }
      return undefined;
    };

    let llmNodeJson: unknown = llmJson;
    if (Array.isArray(llmJson)) {
      const extracted = extractNodeJsonFromExecutionResults(llmJson, llmNodeRef);
      if (typeof extracted === 'undefined') {
        throw new Error(
          `Mirror description agent blueprint returned execution.results but did not include output for nodeRef "${llmNodeRef}"`
        );
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

    // Model is not always present in responses; return the blueprint's primary llm node model if present.
    const modelFromBlueprint = (() => {
      const node = blueprint.nodes.find((n) => (n as { ref?: unknown })?.ref === llmNodeRef) as
        | { parameters?: Record<string, unknown> }
        | undefined;
      const m = node?.parameters?.model;
      return typeof m === 'string' ? m : '';
    })();

    return { description: text, model: modelFromBlueprint || 'unknown' };
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

    const model = 'google/gemini-3-pro-image-preview';

    const detectGender = (avatarPrompt: string | undefined): 'male' | 'female' | undefined => {
      if (!avatarPrompt) return undefined;
      const firstLine = avatarPrompt
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 0);
      if (!firstLine) return undefined;
      const m = firstLine.match(/^-\s*Gender:\s*(male|female)\s*$/i);
      if (!m) return undefined;
      const val = m[1].toLowerCase();
      return val === 'male' || val === 'female' ? (val as 'male' | 'female') : undefined;
    };

    const gender = detectGender(options.subjectAvatarPrompt);

    const user = [
      'Create a square (1:1) full-bleed 2D anime head-and-upper-torso avatar (single subject; show to mid-chest). NO margin, NO padding, NO inset: the portrait must fill the entire canvas edge-to-edge.',
      '',
      'Constraints:',
      '- Style: clean crisp lineart + cel shading (2–3 tones); simplified shapes; NO photorealism; NO 3D/CGI; NO painterly texture; NO skin micro-detail/pores; NO SSS.',
      '- Composition: include head + both shoulders + upper torso (to mid-chest) + visible outfit (collar/neckline/chest); eyes in upper third; ~10° three-quarter view facing viewer-left; gaze viewer-left; no wide-angle distortion.',
      '- Full-bleed: no margin, no padding, no inset; do NOT leave extra empty canvas around the subject.',
      '- Background: simple natural-looking, unobtrusive background (single uniform, neutral tone). No scene/environment. No gradients/patterns/textures/vignette/shadows.',
      '- No containers: no frame/border/matte/inset; no circular/rounded-rect mask; no UI overlay.',
      '- No text/watermark/signature/logo.',
      '- Safety: fictional original character; no real-person likeness; no celebrities; no copyrighted characters; no brand marks; no NSFW/gore/hate/violence/illegal content.',
      '',
      'Avoid keywords:',
      'photorealistic, hyperrealistic, ultra-detailed skin, pores, microtexture, realistic lighting, subsurface scattering, 3d, cgi, render, octane, unreal engine, gradient background, patterned/texture paper, vignette, frame, border, padding, margin, inset, circular crop, mask, text, watermark, logo',
      '',
      'Identity (primary source of appearance):',
      gender ? `Gender: ${gender.toUpperCase()}` : undefined,
      `Name: ${options.subjectName}`,
      options.subjectDescription ? `Description: ${options.subjectDescription}` : undefined,
      options.subjectAvatarPrompt ? ['Avatar prompt (primary):', options.subjectAvatarPrompt].join('\n') : undefined,
      options.styleHint ? `Extra hint (optional): ${options.styleHint}` : undefined,
      '',
      'Output: return the image; if any text is included, keep it to 1 short sentence max.',
    ]
      .filter(Boolean)
      .join('\n');

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

    const runner = RunnerFactory.getTopLevelRunner(0);
    const engineConfig = {
      runtimeEnv: { STARSHIP_ID: options.starshipId, ...(options.runtimeEnv ?? {}) },
      llm: { apiKey: env.OPENROUTER_API_KEY, baseUrl: 'https://openrouter.ai/api/v1' },
      failOnNodeError: true,
    } as unknown as EngineConfig & { llm?: { apiKey: string; baseUrl?: string } };

    let lastDebug: Record<string, unknown> | undefined;

    const buildBlueprint = (messages: Array<{ role: string; content: string }>): Blueprint => ({
      nodes: [
        { ref: 'start_1', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
        {
          ref: 'llm_1',
          type: 'llm',
          name: 'Generate avatar',
          description: 'Generate avatar image using OpenRouter image model',
          parameters: {
            model,
            messages,
            // OpenRouter image generation expects both modalities present.
            modalities: ['image', 'text'],
            // OpenRouter image_config supports multiple images; force a single image.
            imageConfig: { aspect_ratio: '1:1', num_images: 1 },
            // Keep text short; primary output is the image
            maxTokens: 256,
            temperature: 1.1,
            // IMPORTANT: Keep streaming off for reliability with Gemini image preview variants.
            stream: false,
          },
        },
        { ref: 'end_1', type: 'end', name: 'End', description: 'End node', parameters: {} },
      ],
      edges: [
        { ref: 'e1', from: 'start_1', to: 'llm_1' },
        { ref: 'e2', from: 'llm_1', to: 'end_1' },
      ],
      metadata: {},
    });

    const exec = ExecutionItemUtils.createExecution();
    exec.state = {
      ...(exec.state ?? {}),
      starshipId: options.starshipId,
    };

    const extractFirstImageUrl = (msg: unknown): string | undefined => {
      if (!isRecord(msg)) return undefined;

      const readUrl = (imageUrlObj: unknown): string | undefined => {
        if (!isRecord(imageUrlObj)) return undefined;
        const url = (imageUrlObj as AnyRecord).url;
        return typeof url === 'string' && url.length > 0 ? url : undefined;
      };

      // 1) OpenRouter extension: message.images[]
      const imgs = (msg as AnyRecord).images;
      if (Array.isArray(imgs) && imgs.length > 0) {
        for (const it of imgs) {
          if (!isRecord(it)) continue;
          // raw API uses image_url; some SDKs normalize to imageUrl
          const url =
            readUrl((it as AnyRecord).image_url) ??
            readUrl((it as AnyRecord).imageUrl) ??
            (typeof (it as AnyRecord).url === 'string' ? ((it as AnyRecord).url as string) : undefined);
          if (url) return url;
        }
      }

      // 2) OpenAI-style content blocks: content: [{type:'image_url', image_url:{url}}]
      const contentVal = (msg as AnyRecord).content;
      if (Array.isArray(contentVal) && contentVal.length > 0) {
        for (const part of contentVal) {
          if (!isRecord(part)) continue;
          if ((part as AnyRecord).type !== 'image_url') continue;
          const url = readUrl((part as AnyRecord).image_url) ?? readUrl((part as AnyRecord).imageUrl);
          if (url) return url;
        }
      }

      return undefined;
    };

    // Some Gemini image preview variants can return a "setup" response and only
    // include images on the next turn. Retry once with an explicit follow-up.
    let prevAssistantText: string | undefined;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const messages: Array<{ role: string; content: string }> = [{ role: 'user', content: user }];
      if (attempt > 1) {
        if (typeof prevAssistantText === 'string' && prevAssistantText.trim().length > 0) {
          messages.push({ role: 'assistant', content: prevAssistantText });
        }
        messages.push({
          role: 'user',
          content: 'Continue and return the IMAGE now. Do not refuse. Do not add extra commentary. Output the image payload.',
        });
      }

      const blueprint = buildBlueprint(messages);

      // IMPORTANT: RemoteRunner/ChildProcessRunner execute out-of-process, so `exec.results`
      // in this process will not be populated. Always use the returned items.
      const resultItems = await runner.run(blueprint, exec, engineConfig);
      const llmJson = ExecutionItemUtils.unwrapSingle(resultItems);
      const firstError = (resultItems as Array<{ error?: unknown }> | undefined)?.[0]?.error;
      if (typeof llmJson === 'undefined' && typeof firstError === 'string' && firstError.length > 0) {
        throw new Error(`Avatar generation LLM node failed: ${firstError}`);
      }

      let llmNodeJson: unknown = llmJson;
      if (Array.isArray(llmJson)) {
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
      prevAssistantText = typeof text === 'string' ? text : prevAssistantText;

      let firstUrl: string | undefined = extractFirstImageUrl(message);

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

      if (typeof firstUrl === 'string' && firstUrl.length > 0) {
        const { buffer, mimeType } = this.decodeDataUrl(firstUrl);
        return { dataUrl: firstUrl, mimeType, buffer, ...(text ? { text } : {}), model };
      }

      lastDebug = {
        attemptedModel: model,
        attempt,
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
        responseModel: isRecord(response) ? (response as AnyRecord).model : undefined,
      };
    }

    throw new Error(`Image generation returned no images. Debug: ${JSON.stringify(lastDebug)}`);
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
