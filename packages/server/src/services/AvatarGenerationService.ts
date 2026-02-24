/**
 * AvatarGenerationService
 *
 * Generates square avatar images via OpenRouter image models using the Autopilot LLM node
 * (executed through the remote runner).
 */
import { Agent, ExecutionItemUtils, RunnerFactory } from '@starships/autopilot';
import type { AgentParams, Blueprint, EngineConfig, LlmMessage } from '@starships/autopilot';
import { getEnvConfig } from '@starships/env';
import sharp from 'sharp';

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
  private isRetryableLlmError(err: unknown): boolean {
    if (!err) return false;
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : typeof (err as { message?: unknown } | undefined)?.message === 'string'
            ? String((err as { message: unknown }).message)
            : '';
    if (!msg) return false;
    return (
      msg.toLowerCase().includes('timed out') ||
      msg.toLowerCase().includes('timeout') ||
      msg.toLowerCase().includes('econnreset') ||
      msg.toLowerCase().includes('etimedout') ||
      msg.toLowerCase().includes('all llm provider routes failed')
    );
  }

  private async withRetry<T>(fn: () => Promise<T>, options?: { attempts?: number; label?: string }): Promise<T> {
    const attempts =
      typeof options?.attempts === 'number' && Number.isFinite(options.attempts) && options.attempts > 0 ? options.attempts : 2;
    let lastErr: unknown;
    for (let i = 1; i <= attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (i >= attempts || !this.isRetryableLlmError(err)) {
          throw err;
        }
        // Best-effort single retry on transient provider/network issues.
        const label = options?.label ? ` (${options.label})` : '';
        console.warn(`[AvatarGenerationService] transient LLM error${label}; retrying [${i}/${attempts}]`, err);
      }
    }
    // Should be unreachable.
    throw lastErr instanceof Error ? lastErr : new Error('Unknown error');
  }

  /**
   * Post-process the model output for avatar usage:
   * - Cap dimensions (avatars are rendered at small sizes in UI)
   * - Transcode to WebP to dramatically reduce bytes vs PNG
   */
  private async optimizeAvatarImage(input: { buffer: Buffer; mimeType: string }): Promise<{ buffer: Buffer; mimeType: string }> {
    // Keep this conservative: we only optimize common still-image formats.
    if (!input.mimeType.startsWith('image/')) return input;
    if (input.mimeType === 'image/gif') return input; // avoid breaking animated gifs

    try {
      // Typical UI sizes are 14–40px; largest preview in app is ~384px.
      // 512px gives a crisp result with minimal over-download.
      const targetMax = 512;
      const out = await sharp(input.buffer)
        .rotate()
        .resize(targetMax, targetMax, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toBuffer();

      return { buffer: out, mimeType: 'image/webp' };
    } catch {
      // If optimization fails for any reason, fall back to original bytes.
      return input;
    }
  }

  /**
   * Ask the agent to describe its own appearance ("mirror" prompt).
   * This is later persisted per-agent and fed into avatar generation.
   */
  async generateMirrorDescription(options: {
    agentName: string;
    agentDescription?: string;
    /**
     * The agent's configured model. Required for Agent default blueprints which use `{{ state.model }}`.
     * When executing a blueprint directly (bypassing Agent.execute()), callers must seed runtime config
     * into execution.state for template resolution and node validation.
     */
    agentModel: string;
    agentBlueprint: Blueprint;
    agentTools?: unknown[];
    starshipId: string;
    runtimeEnv?: Record<string, unknown>;
    /**
     * Optional engine config from the host (e.g. from buildAutopilotExecutionBundle).
     * When using the remote runner, this must include modelRoutes so the runner can route
     * the agent's model (e.g. anthropic/claude-sonnet-4.5) to a provider.
     */
    engineConfigFromHost?: Record<string, unknown>;
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
      'Write a compact avatar appearance prompt for yourself (original fictional character). You may invent details to be memorable.',
      '',
      `Name: ${options.agentName}`,
      options.agentDescription ? `Description: ${truncate(options.agentDescription, 800)}` : undefined,
      '',
      'Output (STRICT): exactly 7 lines; each line starts with "- " (dash+space); no other text.',
      '',
      'Lines 1–7 (keep each short, vivid, and concrete):',
      '- Age: adult (20s–40s)',
      '- Face/Skin: face shape + jawline + skin tone/undertone + one defining facial feature (prefer non-mark traits like brows/cheekbones; bodily marks are rare)',
      '- Eyes: shape + iris color + catchlights; slightly exaggerated for readability (bigger eyes/clear shapes)',
      '- Hair: style + texture + color (allow unusual colors)',
      '- Outfit: collar/neckline/top colors (visible in head-and-shoulders avatar)',
      '- Apparatus: 1–2 role-related items visible in a portrait (no brands/logos). REQUIRED.',
      '- Background: their workplace environment (1 short phrase). REQUIRED. No text, no logos, no UI.',
      '',
      'Bodily marks policy: scars/tattoos/birthmarks/freckles/moles are RARE; avoid unless strongly implied by the agent description/role. If included, at most ONE subtle mark.',
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

    // IMPORTANT:
    // Use Agent.execute() (the same contract ConversationService uses) rather than calling runner.run() directly.
    // This ensures the Agent node seeds runtime config into execution.state, which the default agent blueprint
    // expects (e.g. LLM node model: `{{ state.model }}`).
    //
    // We intentionally do NOT inject any system prompt here. Mirror generation should be driven purely by the
    // user prompt and the agent's blueprint behavior.
    const agentParams: AgentParams = {
      name: options.agentName,
      description: options.agentDescription,
      model: options.agentModel,
      // Encourage creative but consistent identity details
      temperature: 1.1,
      // Hard-disable tool calling by providing no tools
      state: { messages: [], tools: [] },
      blueprint: inputBlueprint,
    };

    const runtimeEnv = { STARSHIP_ID: options.starshipId, ...(options.runtimeEnv ?? {}) };
    const baseConfig = {
      runtimeEnv,
      llm: { apiKey: env.OPENROUTER_API_KEY, baseUrl: 'https://openrouter.ai/api/v1' },
      failOnNodeError: true,
    };
    const engineConfig = {
      ...baseConfig,
      ...(options.engineConfigFromHost ?? {}),
      runtimeEnv: (options.engineConfigFromHost?.runtimeEnv as Record<string, unknown>) ?? runtimeEnv,
    } as unknown as EngineConfig & { llm?: { apiKey: string; baseUrl?: string } };

    const runner = RunnerFactory.getTopLevelRunner(0);
    const agent = new Agent(agentParams, {
      runtimeEnv,
      runner,
      // Forward remote-runner configuration (llm credentials, modelRoutes, etc.)
      runnerConfig: engineConfig as unknown as Record<string, unknown>,
    });

    const inputMessages: LlmMessage[] = [{ role: 'user', content: user }];
    const resultItems = await this.withRetry(() => agent.execute(ExecutionItemUtils.wrapSingle(inputMessages)), {
      attempts: 2,
      label: 'mirror_description',
    });
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

    const extractNodeErrorFromExecutionResults = (value: unknown, nodeRef: string): string | undefined => {
      if (!Array.isArray(value)) return undefined;
      for (let i = value.length - 1; i >= 0; i--) {
        const entry = value[i];
        if (!entry || typeof entry !== 'object') continue;
        const rec = entry as Record<string, unknown>;
        if (rec.nodeRef !== nodeRef) continue;
        const items = rec.items;
        if (!Array.isArray(items) || items.length === 0) return undefined;
        const last = items[items.length - 1];
        if (!last || typeof last !== 'object') return undefined;
        const err = (last as Record<string, unknown>).error;
        return typeof err === 'string' && err.trim().length > 0 ? err.trim() : undefined;
      }
      return undefined;
    };

    let llmNodeJson: unknown = llmJson;
    if (Array.isArray(llmJson)) {
      const extracted = extractNodeJsonFromExecutionResults(llmJson, llmNodeRef);
      if (typeof extracted === 'undefined') {
        const nodeError = extractNodeErrorFromExecutionResults(llmJson, llmNodeRef);
        if (nodeError) {
          throw new Error(`Mirror description agent blueprint failed: ${nodeError}`);
        }
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

    // Autopilot Agent execution resolves the LLM model from `state.model`.
    // For mirror generation we require agentModel, so report it as the effective model used.
    return { description: text, model: options.agentModel };
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
    /**
     * Optional engine config from the host (e.g. from buildAutopilotExecutionBundle).
     * When using the remote runner, this must include modelRoutes so the runner can route
     * the image model to a provider.
     */
    engineConfigFromHost?: Record<string, unknown>;
  }): Promise<AvatarGenerationResult> {
    const env = getEnvConfig();
    if (!env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured on server');
    }

    const model = 'google/gemini-3-pro-image-preview';

    type AvatarPromptSpec = {
      v: 'agent_avatar_v2';
      task: 'avatar_3d_game_character';
      out: { n: 1; ar: '1:1' };
      // "Template prompt" (style) lives here: concise, technical, 3D/game focused.
      render: {
        look: 'AAA_game_character' | 'stylized_game_character';
        pipeline: 'PBR';
        engine_hint: 'UnrealEngine5' | 'Unity_HDRP' | 'offline_renderer';
        lighting: 'studio_keyfillrim' | 'cinematic_soft' | 'neutral_hdr';
        materials: 'high_quality_surfaces' | 'matte_stylized';
        geometry: 'clean_game_mesh' | 'highpoly_bake';
        shading: 'real_time' | 'offline';
        post: { tone_map: 'filmic'; sharpen: 'subtle'; grain: 'none' | 'subtle' };
        camera: {
          shot: 'head_and_shoulders_to_mid_chest';
          pose: 'three_quarter';
          yaw_deg: number;
          facing: 'viewer_left';
          gaze: 'viewer_left';
          lens_mm: number;
          fstop: number;
          dof: 'subtle';
        };
        neg: string[];
      };
      // "Mirror prompt" (content) lives here: character identity.
      id: {
        mirror?: string;
      };
      safe: {
        fictional_only: true;
        no_real_person: true;
        no_celebs: true;
        no_copyrighted_character: true;
        no_brands: true;
        no_nsfw: true;
      };
    };

    const buildAvatarJsonPrompt = (args: {
      phase: 'initial' | 'continue';
      previousAssistantText?: string;
    }): string => {
      if (args.phase === 'continue') {
        const continuation = {
          v: 'agent_avatar_v2',
          task: 'continue_return_image_only',
          out: { n: 1, ar: '1:1' },
          // Some providers need a reminder on retry; keep it short and JSON-only.
          instr: 'return_1_image_only_no_text',
          prev: typeof args.previousAssistantText === 'string' ? args.previousAssistantText : undefined,
        } as const;
        return JSON.stringify(continuation, null, 2);
      }

      const spec: AvatarPromptSpec = {
        v: 'agent_avatar_v2',
        task: 'avatar_3d_game_character',
        out: { n: 1, ar: '1:1' },
        render: {
          look: 'AAA_game_character',
          pipeline: 'PBR',
          engine_hint: 'UnrealEngine5',
          lighting: 'studio_keyfillrim',
          materials: 'high_quality_surfaces',
          geometry: 'clean_game_mesh',
          shading: 'real_time',
          post: { tone_map: 'filmic', sharpen: 'subtle', grain: 'none' },
          camera: {
            shot: 'head_and_shoulders_to_mid_chest',
            pose: 'three_quarter',
            yaw_deg: 10,
            facing: 'viewer_left',
            gaze: 'viewer_left',
            lens_mm: 65,
            fstop: 2.8,
            dof: 'subtle',
          },
          neg: ['no_text', 'no_logos', 'no_watermark', 'no_frame_border', 'no_ui_overlay', 'no_extra_characters'],
        },
        id: {
          ...(options.subjectAvatarPrompt ? { mirror: options.subjectAvatarPrompt } : {}),
        },
        safe: {
          fictional_only: true,
          no_real_person: true,
          no_celebs: true,
          no_copyrighted_character: true,
          no_brands: true,
          no_nsfw: true,
        },
      };

      // Defensive: ensure we only ever send valid JSON to the image model.
      const json = JSON.stringify(spec, null, 2);
      JSON.parse(json);
      return json;
    };

    const userJson = buildAvatarJsonPrompt({ phase: 'initial' });

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

    const extractNodeErrorFromExecutionResults = (value: unknown, nodeRef: string): string | undefined => {
      if (!Array.isArray(value)) return undefined;
      for (const entry of value) {
        if (!entry || typeof entry !== 'object') continue;
        const rec = entry as Record<string, unknown>;
        if (rec.nodeRef !== nodeRef) continue;
        const items = rec.items;
        if (!Array.isArray(items) || items.length === 0) return undefined;
        const first = items[0];
        if (!first || typeof first !== 'object') return undefined;
        const err = (first as Record<string, unknown>).error;
        return typeof err === 'string' && err.trim().length > 0 ? err.trim() : undefined;
      }
      return undefined;
    };

    const runtimeEnv = { STARSHIP_ID: options.starshipId, ...(options.runtimeEnv ?? {}) };
    const baseConfig = {
      runtimeEnv,
      llm: { apiKey: env.OPENROUTER_API_KEY, baseUrl: 'https://openrouter.ai/api/v1' },
      failOnNodeError: true,
    };
    const engineConfig = {
      ...baseConfig,
      ...(options.engineConfigFromHost ?? {}),
      runtimeEnv: (options.engineConfigFromHost?.runtimeEnv as Record<string, unknown>) ?? runtimeEnv,
    } as unknown as EngineConfig & { llm?: { apiKey: string; baseUrl?: string } };

    const runner = RunnerFactory.getTopLevelRunner(0);
    let lastDebug: Record<string, unknown> | undefined;
    const safeStringifyForDebug = (value: unknown, maxChars = 8000): string => {
      try {
        const s = JSON.stringify(value, (_k, v) => {
          if (typeof v === 'string') {
            // Never dump full data URLs into logs.
            if (v.startsWith('data:image/')) {
              return `<data:image/... len=${v.length}>`;
            }
            // Avoid flooding logs with huge strings.
            if (v.length > 800) {
              return `${v.slice(0, 800)}…(len=${v.length})`;
            }
          }
          return v;
        });
        if (typeof s !== 'string') return String(s);
        return s.length > maxChars ? `${s.slice(0, maxChars)}…(len=${s.length})` : s;
      } catch (err) {
        return `[unstringifiable:${err instanceof Error ? err.message : String(err)}]`;
      }
    };

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
      // IMPORTANT: image generation should only receive JSON prompts (template+mirror are merged into JSON).
      const messages: Array<{ role: string; content: string }> = [{ role: 'user', content: userJson }];
      if (attempt > 1) {
        // Keep the follow-up JSON-only as well (do not inject raw assistant text as an assistant message).
        messages.push({ role: 'user', content: buildAvatarJsonPrompt({ phase: 'continue', previousAssistantText: prevAssistantText }) });
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
          const nodeError = extractNodeErrorFromExecutionResults(llmJson, 'llm_1');
          if (nodeError) {
            throw new Error(`Avatar generation LLM node failed: ${nodeError}`);
          }
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
      const finishReason =
        (choice0Rec && typeof (choice0Rec as AnyRecord).finishReason === 'string'
          ? ((choice0Rec as AnyRecord).finishReason as string)
          : undefined) ??
        (choice0Rec && typeof (choice0Rec as AnyRecord).finish_reason === 'string'
          ? ((choice0Rec as AnyRecord).finish_reason as string)
          : undefined);

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
        const decoded = this.decodeDataUrl(firstUrl);
        const optimized = await this.optimizeAvatarImage(decoded);
        const dataUrl = `data:${optimized.mimeType};base64,${optimized.buffer.toString('base64')}`;
        return { dataUrl, mimeType: optimized.mimeType, buffer: optimized.buffer, ...(text ? { text } : {}), model };
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
        finishReason,
        hasMessage: !!message,
        messageKeys: isRecord(message) ? Object.keys(message) : [],
        contentType:
          isRecord(message) && Array.isArray(message.content) ? 'array' : isRecord(message) ? typeof message.content : typeof message,
        imagesCount: isRecord(message) && Array.isArray(message.images) ? message.images.length : 0,
        textPreview: typeof text === 'string' ? text.slice(0, 160) : undefined,
        responseModel: isRecord(response) ? (response as AnyRecord).model : undefined,
        // Raw payload previews (truncated/sanitized) for debugging provider behavior.
        responsePreview: safeStringifyForDebug(response),
        choice0Preview: safeStringifyForDebug(choice0),
        messagePreview: safeStringifyForDebug(message),
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
