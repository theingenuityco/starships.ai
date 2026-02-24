/**
 * AvatarGenerationService
 *
 * Generates square avatar images via OpenRouter image models using the Autopilot LLM node
 * (executed through the remote runner).
 */
import { ExecutionItemUtils, RunnerFactory } from '@starships/autopilot';
import type { Blueprint, EngineConfig, LlmMessage } from '@starships/autopilot';
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
    agentRole?: string;
    agentSystemPrompt?: string;
    /**
     * The agent's configured model. Historically required for Agent default blueprints which use `{{ state.model }}`.
     * NOTE: Mirror prompt generation now forces a fixed model (GPT‑5.2) regardless of this value.
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

    // Mirror prompt generation should be consistent and high-quality regardless of the agent's runtime model.
    // We route this through OpenRouter using a fixed model id.
    const mirrorModel = 'anthropic/claude-sonnet-4.5';

    type MirrorPromptSpec = {
      agent: string;
      role: string;
      background_guidance: {
        setting: 'workplace_environment';
        composition: 'uncluttered';
        focus: 'subject_in_focus_background_soft';
        dof: 'shallow';
        bokeh: 'soft_circular';
        forbid: Array<'text' | 'logos' | 'ui' | 'busy_details'>;
      };
      // Character-design guidance (NOT rendering jargon): push a loud, readable game-character look.
      character_design_guidance: {
        palette: 'very_vibrant_complementary_accents';
        contrast: 'high_value_separation';
        hair_color: 'unrestricted';
        skin_tone: 'natural_only';
        female_physique_bias?: {
          apply_when_gender: 'female';
          chest: 'fuller';
        };
        wardrobe: {
          color_rule: 'vibrant_accents_not_overpowering';
          visibility: 'upper_body_only_bust_crop';
        };
        equipment: {
          surface_detail: 'iconic_shapes_not_micro_detail';
          effects: 'subtle_glow_allowed';
          forbid: Array<'brand_names' | 'logos' | 'text' | 'real_world_gun_model'>;
        };
        specificity: {
          level: 'high';
          style: 'concrete_visual_terms';
          avoid: Array<'vague_adjectives_only' | 'metaphors_without_visuals'>;
        };
        forbid: Array<'render_terms' | 'camera_terms' | 'engine_terms' | 'game_names'>;
      };
      out: {
        format: 'json_object_only';
        schema_id: 'mirror_prompt_v1';
        extra_text: 'forbidden';
        required_keys: ['gender', 'age', 'face_skin', 'eyes', 'hair', 'outfit', 'apparatus', 'background'];
      };
      rules: {
        fictional_original: true;
        adult_only: true;
        no_real_person_likeness: true;
        no_celebs: true;
        no_copyrighted_characters: true;
        no_brands_logos: true;
        bodily_marks: 'rare_max_1_subtle_only_if_implied';
        forbid_render_style_terms: true;
        allow_game_like_colors: true;
        allow_non_human_skin_tones: false;
        encourage_distinctive_palette: 'vivid_readable';
      };
    };

    type MirrorPromptOutput = {
      v: 'mirror_prompt_v1';
      gender: 'male' | 'female';
      age: string;
      face_skin: string;
      eyes: string;
      hair: string;
      outfit: string;
      apparatus: string;
      background: string;
    };

    const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

    const tryParseJson = (raw: string): unknown => {
      const s = String(raw || '').trim();
      if (!s) return undefined;
      try {
        return JSON.parse(s);
      } catch {
        // Best-effort: extract the first {...} block (models sometimes wrap JSON in prose).
        const start = s.indexOf('{');
        const end = s.lastIndexOf('}');
        if (start >= 0 && end > start) {
          const inner = s.slice(start, end + 1);
          try {
            return JSON.parse(inner);
          } catch {
            return undefined;
          }
        }
        return undefined;
      }
    };

    const normalizeMirrorOutput = (value: unknown): MirrorPromptOutput | undefined => {
      if (!isRecord(value)) return undefined;
      const genderRaw = value['gender'];
      const gender = typeof genderRaw === 'string' ? (genderRaw.trim().toLowerCase() as string) : '';
      const genderNorm = gender === 'male' || gender === 'female' ? (gender as 'male' | 'female') : undefined;

      const getStr = (k: keyof Omit<MirrorPromptOutput, 'v'>): string | undefined => {
        const v = value[k as string];
        if (typeof v !== 'string') return undefined;
        const t = v.trim();
        if (!t) return undefined;
        return t.length > 220 ? `${t.slice(0, 220)}…` : t;
      };

      const out: MirrorPromptOutput = {
        v: 'mirror_prompt_v1',
        gender: genderNorm as 'male' | 'female',
        age: getStr('age') ?? '',
        face_skin: getStr('face_skin') ?? '',
        eyes: getStr('eyes') ?? '',
        hair: getStr('hair') ?? '',
        outfit: getStr('outfit') ?? '',
        apparatus: getStr('apparatus') ?? '',
        background: getStr('background') ?? '',
      };

      const requiredOk =
        !!genderNorm &&
        !!out.age &&
        !!out.face_skin &&
        !!out.eyes &&
        !!out.hair &&
        !!out.outfit &&
        !!out.apparatus &&
        !!out.background;
      return requiredOk ? out : undefined;
    };

    const mirrorJson = (() => {
      const role = typeof options.agentRole === 'string' ? options.agentRole.trim() : '';
      const spec: MirrorPromptSpec = {
        agent: options.agentName,
        role,
        background_guidance: {
          setting: 'workplace_environment',
          composition: 'uncluttered',
          focus: 'subject_in_focus_background_soft',
          dof: 'shallow',
          bokeh: 'soft_circular',
          forbid: ['text', 'logos', 'ui', 'busy_details'],
        },
        character_design_guidance: {
          palette: 'very_vibrant_complementary_accents',
          contrast: 'high_value_separation',
          hair_color: 'unrestricted',
          skin_tone: 'natural_only',
          // Subtle, non-sexualized bias for female characters (express via general upper-body silhouette).
          female_physique_bias: {
            apply_when_gender: 'female',
            chest: 'fuller',
          },
          wardrobe: {
            color_rule: 'vibrant_accents_not_overpowering',
            visibility: 'upper_body_only_bust_crop',
          },
          equipment: {
            surface_detail: 'iconic_shapes_not_micro_detail',
            effects: 'subtle_glow_allowed',
            forbid: ['brand_names', 'logos', 'text', 'real_world_gun_model'],
          },
          specificity: {
            level: 'high',
            style: 'concrete_visual_terms',
            avoid: ['vague_adjectives_only', 'metaphors_without_visuals'],
          },
          forbid: ['render_terms', 'camera_terms', 'engine_terms', 'game_names'],
        },
        out: {
          format: 'json_object_only',
          schema_id: 'mirror_prompt_v1',
          extra_text: 'forbidden',
          required_keys: ['gender', 'age', 'face_skin', 'eyes', 'hair', 'outfit', 'apparatus', 'background'],
        },
        rules: {
          fictional_original: true,
          adult_only: true,
          no_real_person_likeness: true,
          no_celebs: true,
          no_copyrighted_characters: true,
          no_brands_logos: true,
          bodily_marks: 'rare_max_1_subtle_only_if_implied',
          forbid_render_style_terms: true,
          allow_game_like_colors: true,
          allow_non_human_skin_tones: false,
          encourage_distinctive_palette: 'vivid_readable',
        },
      };
      const json = JSON.stringify(spec, null, 2);
      JSON.parse(json);
      return json;
    })();

    const sanitizeTemplateDelimiters = (s: string): string => s.split('{{').join('{ {').split('}}').join('} }');

    const truncateSystemPrompt = (s: unknown, max = 6000): string => {
      const v = typeof s === 'string' ? s : '';
      if (!v) return '';
      const truncated = v.length > max ? `${v.slice(0, max)}…` : v;
      // IMPORTANT:
      // Autopilot validates template expressions in ALL strings inside node parameters.
      // Many system prompts contain literal `{{ ... }}` which would be treated as template syntax
      // and can fail validation ("partial template usage is not supported" / "Unexpected token").
      // We want to pass these through literally to the LLM, so we break the `{{` / `}}` sequences.
      return sanitizeTemplateDelimiters(truncated);
    };
    const systemPrompt = truncateSystemPrompt(options.agentSystemPrompt, 6000);

    const agentRoleForInstruction = typeof options.agentRole === 'string' ? options.agentRole.trim() : '';
    const mirrorInstruction = sanitizeTemplateDelimiters(
      `You (the agent) are ${options.agentName}${agentRoleForInstruction ? ` (${agentRoleForInstruction})` : ''} and you just looked into the mirror - describe yourself.`
    );

    const messages: LlmMessage[] = [
      ...(systemPrompt ? ([{ role: 'system', content: systemPrompt }] as LlmMessage[]) : []),
      ...(mirrorInstruction ? ([{ role: 'system', content: mirrorInstruction }] as LlmMessage[]) : []),
      { role: 'user', content: mirrorJson },
    ];

    const responseFormat = {
      type: 'json_schema',
      json_schema: {
        name: 'mirror_prompt_v1',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            gender: { type: 'string', enum: ['male', 'female'] },
            age: { type: 'string' },
            face_skin: { type: 'string' },
            eyes: { type: 'string' },
            hair: { type: 'string' },
            outfit: { type: 'string' },
            apparatus: { type: 'string' },
            background: { type: 'string' },
          },
          required: ['gender', 'age', 'face_skin', 'eyes', 'hair', 'outfit', 'apparatus', 'background'],
        },
      },
    } as Record<string, unknown>;

    const buildMirrorBlueprint = (): Blueprint => ({
      nodes: [
        { ref: 'start_1', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
        {
          ref: 'llm_1',
          type: 'llm',
          name: 'Generate mirror prompt',
          description: 'Generate structured mirror prompt JSON',
          parameters: {
            model: mirrorModel,
            messages,
            responseFormat,
            maxTokens: 512,
            temperature: 0.9,
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
    const exec = ExecutionItemUtils.createExecution();
    exec.state = { ...(exec.state ?? {}), starshipId: options.starshipId };

    const resultItems = await this.withRetry(() => runner.run(buildMirrorBlueprint(), exec, engineConfig), {
      attempts: 2,
      label: 'mirror_description',
    });
    const llmJson = ExecutionItemUtils.unwrapSingle(resultItems);
    const firstError = (resultItems as Array<{ error?: unknown }> | undefined)?.[0]?.error;
    if (typeof llmJson === 'undefined' && typeof firstError === 'string' && firstError.length > 0) {
      throw new Error(`Mirror description LLM node failed: ${firstError}`);
    }

    // Mirror execution may return either a direct provider response OR an execution.results array.
    // Prefer extracting the LLM node output when the results array shape is present.
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

    let llmNodeJson: unknown = llmJson;
    if (Array.isArray(llmJson)) {
      const extracted = extractNodeJsonFromExecutionResults(llmJson, 'llm_1');
      if (typeof extracted === 'undefined') {
        const nodeError = extractNodeErrorFromExecutionResults(llmJson, 'llm_1');
        if (nodeError) {
          throw new Error(`Mirror description LLM node failed: ${nodeError}`);
        }
        const nodeRefs = llmJson
          .map((e) => (e && typeof e === 'object' ? (e as Record<string, unknown>).nodeRef : undefined))
          .filter((x): x is string => typeof x === 'string');
        throw new Error(
          `Mirror description workflow returned execution.results, but no output was found for nodeRef "llm_1". nodeRefs=${JSON.stringify(
            nodeRefs
          )}`
        );
      }
      llmNodeJson = extracted;
    }

    type AnyRecord = Record<string, unknown>;

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
    const contentVal = isRecord(msg) ? (msg as AnyRecord).content : undefined;
    const parsedVal = isRecord(msg) ? (msg as AnyRecord).parsed : undefined;
    const choiceTextVal = choice0Rec && typeof (choice0Rec as AnyRecord).text === 'string' ? ((choice0Rec as AnyRecord).text as string) : undefined;

    // Structured output providers can return:
    // - message.content as a JSON string (most common)
    // - message.content as an object/array
    // - message.parsed as an object
    // - choice.text as a string (some providers flatten)
    const raw =
      typeof contentVal === 'string'
        ? contentVal.trim()
        : typeof choiceTextVal === 'string'
          ? choiceTextVal.trim()
          : isRecord(parsedVal) || Array.isArray(parsedVal)
            ? JSON.stringify(parsedVal)
            : isRecord(contentVal) || Array.isArray(contentVal)
              ? JSON.stringify(contentVal)
              : '';

    if (!raw) {
      const debug = {
        llmJsonType: llmJson === null ? 'null' : Array.isArray(llmJson) ? 'array' : typeof llmJson,
        llmJsonKeys: isRecord(llmJson) ? Object.keys(llmJson) : [],
        llmNodeJsonType: llmNodeJson === null ? 'null' : Array.isArray(llmNodeJson) ? 'array' : typeof llmNodeJson,
        llmNodeJsonKeys: isRecord(llmNodeJson) ? Object.keys(llmNodeJson) : [],
        responseKeys: responseRec ? Object.keys(responseRec) : [],
        choice0Keys: choice0Rec ? Object.keys(choice0Rec) : [],
        messageKeys: isRecord(msg) ? Object.keys(msg) : [],
        contentType:
          contentVal === null ? 'null' : Array.isArray(contentVal) ? 'array' : typeof contentVal,
        parsedType: parsedVal === null ? 'null' : Array.isArray(parsedVal) ? 'array' : typeof parsedVal,
        hasChoiceText: typeof choiceTextVal === 'string' && choiceTextVal.trim().length > 0,
      };
      throw new Error(`Mirror description returned empty content. Debug=${JSON.stringify(debug)}`);
    }

    const parsed = tryParseJson(raw);
    const normalized = normalizeMirrorOutput(parsed);
    if (!normalized) {
      const preview = raw.length > 600 ? `${raw.slice(0, 600)}…(len=${raw.length})` : raw;
      throw new Error(
        `Mirror description returned non-JSON or invalid JSON (expected mirror_prompt_v1 with required string keys). raw=${preview}`
      );
    }

    // Autopilot Agent execution resolves the LLM model from `state.model` (seeded from AgentParams.model).
    return { description: JSON.stringify(normalized), model: mirrorModel };
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
        style_id: 'starships_loud_hero_v1' | 'generic_game';
        look: 'AAA_game_character' | 'stylized_game_character';
        art_dir: 'starships_loud_hero' | 'starships_signature' | 'semi_real_stylized' | 'realistic' | 'toon_stylized';
        genre_ref: 'starships' | 'hero_shooter' | 'rpg' | 'sci_fi' | 'fantasy' | 'modern';
        pipeline: 'PBR';
        engine_hint: 'UnrealEngine5' | 'Unity_HDRP' | 'offline_renderer';
        lighting: 'studio_keyfillrim' | 'cinematic_soft' | 'neutral_hdr' | 'hero_rim_keyfill';
        materials: 'high_quality_surfaces' | 'matte_stylized' | 'stylized_pbr_punchy';
        geometry: 'clean_game_mesh' | 'highpoly_bake';
        shading: 'real_time' | 'offline';
        framing: {
          crop: 'bust_up_mid_chest';
          include: 'head_neck_shoulders_upper_chest';
          exclude: Array<'hands' | 'forearms' | 'full_torso' | 'full_body'>;
          padding: 'none_full_bleed';
          strict: true;
        };
        wardrobe_gear: {
          outfit: {
            style: 'retro_future_futuristic';
            neckline: 'visible_collar_or_harness_or_jacket';
            materials: Array<'tech_fabric' | 'synthetic_leather' | 'iridescent_trim' | 'metal_accents'>;
            color: 'vibrant_accents_medium_high_contrast';
            details: 'clean_hardware_and_trim';
          };
          equipment: {
            show: '1_to_2_iconic_role_tools';
            silhouette: 'readable';
            finish: 'pbr_metal_plastic_glass';
            emissive: 'allowed';
            forbid: Array<'logos' | 'text' | 'real_world_brand_devices'>;
          };
        };
        shaders: {
          skin: 'subsurface_profile_pbr';
          hair: 'anisotropic_strands_or_cards';
          eyes: 'parallax_cornea_catchlights';
          cloth: 'sheen';
        };
        tech: { gi: 'lumen_like' | 'baked'; shadows: 'vsm_like'; aa: 'taa' | 'fxaa' };
        post: {
          tone_map: 'filmic';
          grade: 'neutral' | 'teal_orange_subtle' | 'vibrant_lut';
          bloom: 'subtle' | 'medium' | 'strong';
          chromatic_aberration: 'none' | 'subtle';
          vignette: 'none' | 'subtle';
          sharpen: 'subtle';
          grain: 'none' | 'subtle';
        };
        camera: {
          shot: 'bust_up_mid_chest';
          pose: 'three_quarter';
          yaw_deg: number;
          facing: 'viewer_left';
          gaze: 'viewer_left';
          lens_mm: number;
          fstop: number;
          dof: 'subtle';
        };
        bg: { type: 'simple_studio' | 'soft_environment'; keep_uncluttered: true };
        palette: {
          vibe: 'starships_signature' | 'colorful_game' | 'muted_cinematic';
          saturation: 'medium_high' | 'balanced' | 'high';
          accent: 'neon_allowed' | 'neon_subtle';
          hair_color: 'unrestricted';
          eyes_color: 'unrestricted';
          skin_tone: 'natural_only';
          emissive_accents: 'allowed_subtle' | 'allowed';
        };
        // Starships signature: subtle retro‑future space tech motifs (no text/logos).
        starships: {
          motifs: Array<'retro_futurism' | 'sleek_spacefaring' | 'holo_glow_accents' | 'cosmic_palette' | 'clean_silhouette'>;
          accents: Array<'cyan_magenta_glow' | 'iridescent_edge' | 'soft_bloom'>;
          forbid_brand_marks: true;
        };
        neg: string[];
      };
      // "Mirror prompt" (content) lives here: character identity.
      id: {
        mirror?: unknown;
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

    const buildAvatarJsonPrompt = (args: { phase: 'initial' | 'continue'; previousAssistantText?: string }): string => {
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

      const tryParseMirrorJson = (raw: string): unknown => {
        const s = String(raw || '').trim();
        if (!s) return undefined;
        // Only attempt JSON parsing for obvious JSON-like strings.
        if (!s.startsWith('{') && !s.startsWith('[')) return undefined;
        try {
          return JSON.parse(s);
        } catch {
          const start = s.indexOf('{');
          const end = s.lastIndexOf('}');
          if (start >= 0 && end > start) {
            const inner = s.slice(start, end + 1);
            try {
              return JSON.parse(inner);
            } catch {
              return undefined;
            }
          }
          return undefined;
        }
      };

      const mirrorValue: unknown = (() => {
        const raw = options.subjectAvatarPrompt;
        if (typeof raw !== 'string') return undefined;
        const t = raw.trim();
        if (!t) return undefined;
        return tryParseMirrorJson(t) ?? t;
      })();

      const spec: AvatarPromptSpec = {
        v: 'agent_avatar_v2',
        task: 'avatar_3d_game_character',
        out: { n: 1, ar: '1:1' },
        render: {
          style_id: 'starships_loud_hero_v1',
          look: 'AAA_game_character',
          art_dir: 'starships_loud_hero',
          genre_ref: 'starships',
          pipeline: 'PBR',
          engine_hint: 'UnrealEngine5',
          lighting: 'hero_rim_keyfill',
          materials: 'stylized_pbr_punchy',
          geometry: 'clean_game_mesh',
          shading: 'real_time',
          framing: {
            crop: 'bust_up_mid_chest',
            include: 'head_neck_shoulders_upper_chest',
            exclude: ['hands', 'forearms', 'full_torso', 'full_body'],
            padding: 'none_full_bleed',
            strict: true,
          },
          wardrobe_gear: {
            outfit: {
              style: 'retro_future_futuristic',
              neckline: 'visible_collar_or_harness_or_jacket',
              materials: ['tech_fabric', 'synthetic_leather', 'iridescent_trim', 'metal_accents'],
              color: 'vibrant_accents_medium_high_contrast',
              details: 'clean_hardware_and_trim',
            },
            equipment: {
              show: '1_to_2_iconic_role_tools',
              silhouette: 'readable',
              finish: 'pbr_metal_plastic_glass',
              emissive: 'allowed',
              forbid: ['logos', 'text', 'real_world_brand_devices'],
            },
          },
          shaders: {
            skin: 'subsurface_profile_pbr',
            hair: 'anisotropic_strands_or_cards',
            eyes: 'parallax_cornea_catchlights',
            cloth: 'sheen',
          },
          tech: { gi: 'lumen_like', shadows: 'vsm_like', aa: 'taa' },
          post: {
            tone_map: 'filmic',
            grade: 'vibrant_lut',
            bloom: 'strong',
            chromatic_aberration: 'subtle',
            vignette: 'none',
            sharpen: 'subtle',
            grain: 'none',
          },
          camera: {
            shot: 'bust_up_mid_chest',
            pose: 'three_quarter',
            yaw_deg: 10,
            facing: 'viewer_left',
            gaze: 'viewer_left',
            lens_mm: 65,
            fstop: 2.8,
            dof: 'subtle',
          },
          bg: { type: 'soft_environment', keep_uncluttered: true },
          palette: {
            vibe: 'starships_signature',
            saturation: 'medium_high',
            accent: 'neon_subtle',
            hair_color: 'unrestricted',
            eyes_color: 'unrestricted',
            skin_tone: 'natural_only',
            emissive_accents: 'allowed',
          },
          starships: {
            motifs: ['sleek_spacefaring', 'retro_futurism', 'holo_glow_accents', 'cosmic_palette', 'clean_silhouette'],
            accents: ['cyan_magenta_glow', 'soft_bloom'],
            forbid_brand_marks: true,
          },
          neg: [
            'no_text',
            'no_logos',
            'no_watermark',
            'no_frame_border',
            'no_ui_overlay',
            'no_extra_characters',
            'no_photoreal_real_person_likeness',
            // Hard framing constraints (repeat in negatives for better compliance).
            'no_hands',
            'no_arms',
            'no_forearms',
            'no_elbows',
            'no_full_torso',
            'no_full_body',
            'tight_bust_crop_mid_chest',
          ],
        },
        id: {
          ...(typeof mirrorValue !== 'undefined' ? { mirror: mirrorValue } : {}),
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
