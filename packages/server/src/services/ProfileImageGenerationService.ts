/**
 * ProfileImageGenerationService
 *
 * Generates square profile images (Problem Statements, Capabilities, Try These Prompts)
 * via OpenRouter image models using the Autopilot LLM node (executed through the remote runner).
 * Reuses the same infrastructure as avatar generation.
 */
import { ExecutionItemUtils, RunnerFactory } from '@starships/autopilot';
import type { Blueprint, EngineConfig } from '@starships/autopilot';
import { getEnvConfig } from '@starships/env';
import sharp from 'sharp';
import type { AgentModel } from '@starships/protocol';
import { ToolTemplateRepository } from '@starships/models';

export type ProfileImageType = 'problem_statements' | 'capabilities' | 'try_these_prompts';

export type ProfileImageGenerationResult = {
  /** data URL from OpenRouter: data:image/png;base64,... */
  dataUrl: string;
  mimeType: string;
  buffer: Buffer;
  /** Optional text caption returned by model */
  text?: string;
  /** Model used */
  model: string;
};

// Embed the three prompt templates as constants (from AGENT_PROFILE_IMAGE_PROMPTS.md)
const PROFILE_IMAGE_PROMPTS = {
  problem_statements: `I want to create 1 square format image (1:1 aspect ratio) for {{name}} showing them understanding and empathizing with user challenges.

Identity Anchors:
- Name: {{name}}
- Role: {{role}}
- Interaction Style: Empathetic, understanding, reassuring
- Style: Comic strip
- Aspect Ratio: Square (1:1)

Shot Specifics:
- Camera: Medium shot, slightly closer than capabilities image (more intimate, understanding perspective)
- Eye Contact: {{name}} should be looking directly at the camera/viewer with empathetic, understanding expression
- Pose: Understanding, empathetic, listening - {{name}} leaning slightly forward or with a thoughtful, understanding gesture (e.g., hand near chin, or open palms showing understanding), showing they're actively listening and understanding user challenges
- Expression: Empathetic, understanding, reassuring (warm but not overly casual), looking at camera with genuine concern and understanding
- Setting: Clean, modern tech workspace with subtle elements relevant to {{domain_context}}, but less cluttered than capabilities image - focus on {{name}} and their understanding expression
- Background: Solid {{background_color}} color (matching {{category}} category) or subtle gradient
- Speech Bubble: "Hmm I've seen this before" (exact text - same for all agents)

Quality/Style:
- High-resolution comic strip style
- Square format (1:1 aspect ratio) suitable for web app display
- Warm, empathetic color palette
- Emphasis on understanding and empathy
- Professional but warm and reassuring
- Consistent character appearance with {{name}} avatar
- {{name}} must be looking directly at the camera/viewer
- Expression should convey genuine understanding and empathy

Negative Constraints:
- Avoid overly technical or action-oriented poses
- Keep it empathetic and understanding, not dismissive or casual
- Maintain character consistency with {{name}} avatar
- Background should be simple (solid color or subtle gradient)
- Don't make it too casual - maintain professional, empathetic tone
- Single cohesive image, not multiple panels
- Ensure composition works well in square format
- Show {{name}} understanding user pain points in their domain
- {{name}} must maintain eye contact with the camera/viewer
- Speech bubble must say exactly "Hmm I've seen this before" - keep this consistent for all agents
- Avoid making {{name}} look sad or overly concerned - should be understanding and reassuring`,

  capabilities: `I want to create 1 square format image (1:1 aspect ratio) for {{name}} showing them actively using their capabilities.

Identity Anchors:
- Name: {{name}}
- Role: {{role}}
- Core Capabilities: {{core_capabilities}}
- Style: Comic strip
- Aspect Ratio: Square (1:1)

Shot Specifics:
- Camera: Medium shot
- Eye Contact: {{name}} should be looking directly at the camera/viewer
- Pose: Active, working, focused - {{name}} engaged with their domain (e.g. typing, reviewing screens, or managing tools) but with head turned toward camera
- Action: Demonstrating active use of their capabilities (tools, interfaces, or workflows relevant to {{domain_context}}) while maintaining eye contact with viewer
- Setting: Modern tech workspace with screens or tools relevant to {{domain_context}}
- Expression: Confident, professional, focused, welcoming (friendly but not overly casual), looking at camera
- Background: Solid {{background_color}} color (matching {{category}} category) or subtle gradient
- Speech Bubble: "Here's what I can do." (exact text, with period)

Quality/Style:
- High-resolution comic strip style
- Square format (1:1 aspect ratio) suitable for web app display
- Action-oriented composition showing {{name}} actively working
- Clear visual storytelling of their expertise
- Professional but engaging and welcoming
- Consistent character appearance with {{name}} avatar
- {{name}} must be looking directly at the camera/viewer
- Expression should be welcoming, friendly, and approachable while maintaining professionalism

Negative Constraints:
- Avoid cluttered backgrounds - keep it simple with solid color or subtle gradient
- Show active engagement with tools/screens relevant to their role
- Keep it professional, not overly cartoonish
- Speech bubble must say exactly "Here's what I can do." (with period) - keep this consistent for all agents
- Single cohesive image, not multiple panels
- Ensure composition works well in square format
- Maintain character consistency with {{name}} avatar
- {{name}} must maintain eye contact with the camera/viewer - do not have them looking away or down at screens
- Expression should be welcoming and friendly, not serious or stern`,

  try_these_prompts: `I want to create 1 square format image (1:1 aspect ratio) for {{name}} showing them ready to help users.

Identity Anchors:
- Name: {{name}}
- Role: {{role}}
- Interaction Style: Conversational, helpful, approachable
- Style: Comic strip
- Aspect Ratio: Square (1:1)

Shot Specifics:
- Camera: Medium shot, slightly angled toward viewer (inviting perspective), adjusted for square format
- Eye Contact: {{name}} should be looking directly at the camera/viewer
- Pose: Welcoming, conversational, open - {{name}} sitting at a desk or standing, turned toward viewer with a friendly gesture, ready to help
- Expression: Friendly, ready to help, approachable (can smile), looking at camera
- Setting: Clean, modern tech workspace with subtle elements relevant to {{domain_context}} (e.g. screens or tools in background)
- Background: Solid {{background_color}} color (matching {{category}} category) or subtle gradient
- Speech Bubble: "Just tell me what to do" (exact text - same for all agents)

Quality/Style:
- High-resolution comic strip style
- Square format (1:1 aspect ratio) suitable for web app display
- Warm, inviting color palette
- Emphasis on approachability and friendliness
- Professional but welcoming
- Consistent character appearance with {{name}} avatar
- {{name}} must be looking directly at the camera/viewer

Negative Constraints:
- Avoid intimidating or overly technical poses
- Keep it conversational and friendly
- Maintain character consistency with {{name}} avatar
- Background should be simple (solid color or subtle gradient)
- Don't make it too casual - maintain professional tone
- Single cohesive image, not multiple panels
- Ensure composition works well in square format
- Show {{name}} ready to engage in conversation about their domain
- {{name}} must maintain eye contact with the camera/viewer
- Speech bubble must say exactly "Just tell me what to do" - keep this consistent for all agents`,
} as const;

// Category → Background Color mapping
const CATEGORY_COLORS: Record<string, string> = {
  automation: 'green',
  data: 'purple',
  communication: 'orange',
  coding: 'indigo',
  creative: 'pink',
  analysis: 'cyan',
  support: 'amber',
  utility: 'teal',
  general: 'gray',
} as const;

export class ProfileImageGenerationService {
  /**
   * Post-process the model output for profile image usage:
   * - Cap dimensions (profile images are rendered at small sizes in UI)
   * - Transcode to WebP to dramatically reduce bytes vs PNG
   */
  private async optimizeProfileImage(input: { buffer: Buffer; mimeType: string }): Promise<{ buffer: Buffer; mimeType: string }> {
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
   * Get background color from category
   */
  private getBackgroundColor(category?: string): string {
    return CATEGORY_COLORS[category || 'general'] || 'gray';
  }

  /**
   * Substitute placeholders in template string
   */
  private substitutePlaceholders(template: string, placeholders: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(placeholders)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
    }
    return result;
  }

  /**
   * Generate a 1:1 profile image for an agent.
   * Uses generate-character-variant tool if avatar exists for better consistency,
   * otherwise falls back to text-only generation.
   */
  async generateProfileImage(
    agent: AgentModel,
    type: ProfileImageType,
    params?: {
      coreCapabilities?: string;
      domainContext?: string;
      /**
       * Optional engine config from the host (e.g. from buildAutopilotExecutionBundle).
       * When using the remote runner, this must include modelRoutes so the runner can route
       * the image model to a provider.
       */
      engineConfigFromHost?: Record<string, unknown>;
    }
  ): Promise<ProfileImageGenerationResult> {
    // If agent has an avatar, use reference-image-based generation for better consistency
    if (agent.avatarAttachmentId && agent.slug) {
      try {
        return await this.generateProfileImageWithReference(agent, type, params);
      } catch (error) {
        console.warn(
          `[PROFILE-IMAGE] Failed to generate with reference image for agent ${agent.id} (${agent.name}), falling back to text-only:`,
          error instanceof Error ? error.message : String(error)
        );
        // Fall through to text-only approach
      }
    }

    // Text-only generation (original approach)
    return await this.generateProfileImageTextOnly(agent, type, params);
  }

  /**
   * Generate profile image using generate-character-variant tool with avatar as reference.
   * This provides better character consistency than text-only prompts.
   */
  private async generateProfileImageWithReference(
    agent: AgentModel,
    type: ProfileImageType,
    params?: {
      coreCapabilities?: string;
      domainContext?: string;
      engineConfigFromHost?: Record<string, unknown>;
    }
  ): Promise<ProfileImageGenerationResult> {
    const env = getEnvConfig();
    if (!env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured on server');
    }

    // Get the generate-character-variant tool template
    const toolTemplateRepo = new ToolTemplateRepository();
    const toolTemplateId = await toolTemplateRepo.resolveTemplateIdForAssignedSlug('generate-character-variant');
    if (!toolTemplateId) {
      throw new Error('generate-character-variant tool template not found');
    }

    const toolTemplate = await toolTemplateRepo.findById(toolTemplateId);
    if (!toolTemplate || !toolTemplate.blueprint) {
      throw new Error('generate-character-variant tool template missing blueprint');
    }

    // Build the prompt for the variant (extract key parts from the template)
    const template = PROFILE_IMAGE_PROMPTS[type];
    if (!template) {
      throw new Error(`Unknown profile image type: ${type}`);
    }

    const placeholders: Record<string, string> = {
      name: agent.name || 'Agent',
      role: (agent.role || '').slice(0, 32),
      category: agent.category || 'general',
      background_color: this.getBackgroundColor(agent.category),
      core_capabilities: params?.coreCapabilities || agent.role || 'general assistance',
      domain_context: params?.domainContext || agent.description?.slice(0, 100) || agent.role || 'general assistance',
    };

    let prompt = this.substitutePlaceholders(template, placeholders);

    // Extract the key instruction from the prompt (Shot Specifics section)
    const shotSpecificsIndex = prompt.indexOf('Shot Specifics:');
    let variantPrompt = prompt;
    if (shotSpecificsIndex >= 0) {
      const shotSpecifics = prompt.slice(shotSpecificsIndex);
      // Extract the core instruction (pose, expression, setting, etc.)
      const qualityIndex = shotSpecifics.indexOf('Quality/Style:');
      if (qualityIndex >= 0) {
        variantPrompt = shotSpecifics.slice(0, qualityIndex).trim();
      } else {
        variantPrompt = shotSpecifics.trim();
      }
    }

    // Simplify the prompt for the variant tool (it already has the reference image)
    variantPrompt = variantPrompt
      .replace(/Shot Specifics:/g, '')
      .replace(/{{[^}]+}}/g, '')
      .replace(/\n+/g, ' ')
      .trim();

    // Build tool arguments
    const toolArgs = {
      agentSlug: agent.slug,
      prompt: variantPrompt,
      size: '1024x1024', // Square format for profile images
    };

    // Build blueprint that calls the tool
    const blueprint: Blueprint = {
      nodes: [
        { ref: 'start_1', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
        {
          ref: 'prepare_args',
          type: 'code',
          name: 'Prepare Tool Arguments',
          description: 'Prepare arguments for generate-character-variant',
          parameters: {
            code: `async function main(ctx) {
              return ${JSON.stringify(toolArgs)};
            }`,
            timeout: 2000,
          },
        },
        {
          ref: 'call_tool',
          type: 'tool',
          name: 'Generate Character Variant',
          description: 'Generate profile image variant using reference avatar',
          parameters: {
            name: toolTemplate.name,
            slug: 'generate-character-variant',
            description: toolTemplate.description || '',
            parameters: toolTemplate.parameters || { type: 'object', properties: {} },
            blueprint: toolTemplate.blueprint,
          },
        },
        { ref: 'end_1', type: 'end', name: 'End', description: 'End node', parameters: {} },
      ],
      edges: [
        { ref: 'e1', from: 'start_1', to: 'prepare_args' },
        { ref: 'e2', from: 'prepare_args', to: 'call_tool' },
        { ref: 'e3', from: 'call_tool', to: 'end_1' },
      ],
      metadata: {},
    };

    const runtimeEnv = { STARSHIP_ID: agent.starshipId };
    const baseConfig = {
      runtimeEnv,
      llm: { apiKey: env.OPENROUTER_API_KEY, baseUrl: 'https://openrouter.ai/api/v1' },
      failOnNodeError: true,
    };
    const engineConfig = {
      ...baseConfig,
      ...(params?.engineConfigFromHost ?? {}),
      runtimeEnv: (params?.engineConfigFromHost?.runtimeEnv as Record<string, unknown>) ?? runtimeEnv,
    } as unknown as EngineConfig & { llm?: { apiKey: string; baseUrl?: string } };

    const runner = RunnerFactory.getTopLevelRunner(0);
    const exec = ExecutionItemUtils.createExecution();
    exec.state = {
      ...(exec.state ?? {}),
      starshipId: agent.starshipId,
    };

    // Execute the blueprint
    const resultItems = await runner.run(blueprint, exec, engineConfig);

    // Extract image from tool result
    // The tool's end node outputs: (lastOutputOf('extract_image') || {}).image
    // Which is: { kind: 'data_url' | 'url', value: string, mimeType?: string }
    // The Tool node unwraps the nested blueprint's end node output and wraps it in an ExecutionItem
    // So we can use unwrapSingle() directly to get the end node output (the image object)
    type AnyRecord = Record<string, unknown>;
    const isRecord = (v: unknown): v is AnyRecord => !!v && typeof v === 'object' && !Array.isArray(v);

    // Use unwrapSingle() directly - Tool node already handled unwrapping
    const actualResult = ExecutionItemUtils.unwrapSingle(resultItems);

    if (!isRecord(actualResult)) {
      const debugInfo = {
        actualResultType: typeof actualResult,
        actualResultIsArray: Array.isArray(actualResult),
        actualResultIsNull: actualResult === null,
        resultItemsType: typeof resultItems,
        resultItemsIsArray: Array.isArray(resultItems),
        resultItemsLength: Array.isArray(resultItems) ? resultItems.length : 0,
      };
      throw new Error(`Tool returned invalid result format: ${typeof actualResult}. Debug: ${JSON.stringify(debugInfo, null, 2)}`);
    }

    // The end node outputs just the image object directly: { kind, value, mimeType? }
    // actualResult IS the image object (no need to extract from nested structure)
    const imageObj = actualResult;
    if (!isRecord(imageObj)) {
      throw new Error(`Tool result missing image field. Result keys: ${Object.keys(actualResult).join(', ')}`);
    }

    const kind = typeof imageObj.kind === 'string' ? imageObj.kind : undefined;
    const value = typeof imageObj.value === 'string' ? imageObj.value : undefined;

    if (!value) {
      throw new Error(`Tool result missing image value. Image object keys: ${Object.keys(imageObj).join(', ')}`);
    }

    let dataUrl: string;
    if (kind === 'data_url' || value.startsWith('data:image/')) {
      dataUrl = value;
    } else if (kind === 'url' || value.startsWith('http://') || value.startsWith('https://')) {
      // Fetch the image URL and convert to data URL
      const response = await fetch(value);
      if (!response.ok) {
        throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const mimeType = response.headers.get('content-type') || 'image/png';
      dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
    } else {
      throw new Error(`Unsupported image format: kind=${kind}, value starts with ${value.slice(0, 20)}`);
    }

    // Decode and optimize
    const decoded = this.decodeDataUrl(dataUrl);
    const optimized = await this.optimizeProfileImage(decoded);

    return {
      dataUrl: `data:${optimized.mimeType};base64,${optimized.buffer.toString('base64')}`,
      mimeType: optimized.mimeType,
      buffer: optimized.buffer,
      model: 'google/gemini-3-pro-image-preview',
    };
  }

  /**
   * Generate profile image using text-only prompts (original approach).
   * Used as fallback when avatar is not available.
   */
  private async generateProfileImageTextOnly(
    agent: AgentModel,
    type: ProfileImageType,
    params?: {
      coreCapabilities?: string;
      domainContext?: string;
      engineConfigFromHost?: Record<string, unknown>;
    }
  ): Promise<ProfileImageGenerationResult> {
    const env = getEnvConfig();
    if (!env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured on server');
    }

    const model = 'google/gemini-3-pro-image-preview';

    // Get template for this type
    const template = PROFILE_IMAGE_PROMPTS[type];
    if (!template) {
      throw new Error(`Unknown profile image type: ${type}`);
    }

    // Build placeholders
    const placeholders: Record<string, string> = {
      name: agent.name || 'Agent',
      role: (agent.role || '').slice(0, 32), // Truncate to 32 chars
      category: agent.category || 'general',
      background_color: this.getBackgroundColor(agent.category),
      core_capabilities: params?.coreCapabilities || agent.role || 'general assistance',
      domain_context: params?.domainContext || agent.description?.slice(0, 100) || agent.role || 'general assistance',
    };

    // Substitute placeholders
    let prompt = this.substitutePlaceholders(template, placeholders);

    // Inject avatarPrompt in "Identity" section (matching avatar pattern)
    // CRITICAL: This is the primary source of character consistency
    if (agent.avatarPrompt) {
      const identitySection = prompt.indexOf('Identity Anchors:');
      if (identitySection >= 0) {
        const beforeIdentity = prompt.slice(0, identitySection);
        const afterIdentity = prompt.slice(identitySection);
        // Find the end of Identity Anchors section (before Shot Specifics)
        const shotSpecificsIndex = afterIdentity.indexOf('Shot Specifics:');
        if (shotSpecificsIndex >= 0) {
          const identityContent = afterIdentity.slice(0, shotSpecificsIndex);
          const rest = afterIdentity.slice(shotSpecificsIndex);
          prompt = [
            beforeIdentity,
            identityContent,
            '',
            'CRITICAL - Character Identity (MUST match avatar exactly — this is the reference for ALL character features):',
            agent.avatarPrompt,
            '',
            'CONSISTENCY REQUIREMENT:',
            '- Face shape, features, hair, age, and all physical characteristics MUST match the avatar description above',
            '- Use the avatar description as the PRIMARY reference for character appearance',
            '- Do NOT deviate from the avatar description - maintain exact character consistency',
            '- All three profile images (problem statements, capabilities, try these prompts) must show the SAME character',
            '',
            rest,
          ].join('\n');
        }
      } else {
        // If no Identity Anchors section, prepend the avatar prompt at the beginning
        prompt = [
          'CRITICAL - Character Identity (MUST match avatar exactly):',
          agent.avatarPrompt,
          '',
          'CONSISTENCY REQUIREMENT: Maintain exact character consistency with the avatar description above.',
          '',
          prompt,
        ].join('\n');
      }
    } else {
      // Warn if avatarPrompt is missing - consistency will be poor
      console.warn(`[PROFILE-IMAGE] Agent ${agent.id} (${agent.name}) missing avatarPrompt - character consistency may be poor`);
    }

    // Build user message
    const user = prompt;

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

    const runtimeEnv = { STARSHIP_ID: agent.starshipId };
    const baseConfig = {
      runtimeEnv,
      llm: { apiKey: env.OPENROUTER_API_KEY, baseUrl: 'https://openrouter.ai/api/v1' },
      failOnNodeError: true,
    };
    const engineConfig = {
      ...baseConfig,
      ...(params?.engineConfigFromHost ?? {}),
      runtimeEnv: (params?.engineConfigFromHost?.runtimeEnv as Record<string, unknown>) ?? runtimeEnv,
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
          name: 'Generate profile image',
          description: 'Generate profile image using OpenRouter image model',
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
      starshipId: agent.starshipId,
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
        throw new Error(`Profile image generation LLM node failed: ${firstError}`);
      }

      let llmNodeJson: unknown = llmJson;
      if (Array.isArray(llmJson)) {
        const extracted = extractNodeJsonFromExecutionResults(llmJson, 'llm_1');
        if (typeof extracted === 'undefined') {
          const nodeRefs = llmJson
            .map((e) => (e && typeof e === 'object' ? (e as Record<string, unknown>).nodeRef : undefined))
            .filter((x): x is string => typeof x === 'string');
          throw new Error(
            `Profile image generation workflow returned execution.results, but no output was found for nodeRef "llm_1". ` +
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
        const optimized = await this.optimizeProfileImage(decoded);
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
