import OpenAI from 'openai';
import sharp from 'sharp';
import { getEnvConfig } from '@starships/env';
import { ExecutionItemUtils, LLM } from '@starships/autopilot';
import type { AgentTemplateModel } from '@starships/protocol';
import type { ContentBlock, HostRuntime, LlmHostRequest, LlmMessage, LlmParams, LLMResponse, NodeHandlerOptions } from '@starships/autopilot';

type ProfileImageType = 'problem_statements' | 'capabilities' | 'try_these_prompts';

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
};

function getBackgroundColor(category?: string): string {
  return CATEGORY_COLORS[String(category || 'general')] || 'gray';
}

function decodeDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const url = String(dataUrl || '');
  if (!url.startsWith('data:')) {
    throw new Error('Expected image data URL');
  }
  const commaIdx = url.indexOf(',');
  if (commaIdx < 0) {
    throw new Error('Invalid data URL (missing comma)');
  }
  const header = url.slice(5, commaIdx);
  const payload = url.slice(commaIdx + 1);
  const headerParts = header.split(';').map((s) => s.trim());
  const mimeType = headerParts[0] || 'application/octet-stream';
  const isBase64 = headerParts.includes('base64');
  if (!isBase64) {
    throw new Error('Expected base64 data URL');
  }
  return { mimeType, buffer: Buffer.from(payload, 'base64') };
}

async function optimizeToWebp(input: { buffer: Buffer; mimeType: string }, maxSize = 1024): Promise<{ buffer: Buffer; mimeType: string }> {
  if (!input.mimeType.startsWith('image/')) return input;
  if (input.mimeType === 'image/gif') return input;
  try {
    const out = await sharp(input.buffer)
      .rotate()
      .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toBuffer();
    return { buffer: out, mimeType: 'image/webp' };
  } catch {
    return input;
  }
}

function createOpenRouterHostRuntime(): HostRuntime {
  const env = getEnvConfig();
  if (!env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured on server');
  }

  const openai = new OpenAI({
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
  });

  return {
    http: async () => {
      throw new Error('HostRuntime.http is not available for template marketing generation');
    },
    connectorAction: async () => {
      throw new Error('HostRuntime.connectorAction is not available for template marketing generation');
    },
    llm: async (request: LlmHostRequest): Promise<AsyncIterable<unknown>> => {
      // The Autopilot LLM node expects an AsyncIterable of OpenAI-style chunks.
      // Force stream=true so the return value is always iterable (even for image models).
      const req = { ...request, stream: true } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
      return (await openai.chat.completions.create(req)) as unknown as AsyncIterable<unknown>;
    },
  };
}

function buildReusableJsonPrompt(args: {
  template: AgentTemplateModel;
  type: ProfileImageType;
  coreCapabilities: string;
  domainContext: string;
}): string {
  const { template, type, coreCapabilities, domainContext } = args;
  const speechBubbleText =
    type === 'problem_statements'
      ? "Hmm I've seen this before"
      : type === 'capabilities'
        ? "Here's how I can fix it for you."
        : 'Just tell me what to do';

  const spec = {
    version: 'marketplace_marketing_image_v1',
    task: 'generate_single_square_marketing_image',
    output: {
      images: 1,
      aspect_ratio: '1:1',
      no_text_outside_speech_bubble: true,
    },
    style: {
      art_style: 'high-resolution comic strip style',
      lighting: 'clean, readable, professional',
      palette: 'warm, modern, readable',
      // Keep the speech bubble consistent across generations.
      speech_bubble_style: {
        bubble_shape: 'rounded white speech bubble',
        outline: { color: 'black', thickness: 'medium' },
        fill: 'solid white',
        tail: { required: true, points_to: 'subject mouth area', direction_hint: 'from upper-right toward subject' },
        font: {
          // Be very explicit. Providers may not have named fonts; treat these as strong hints with fallbacks.
          family_primary: 'Arial',
          family_fallbacks: ['Helvetica', 'sans-serif'],
          case: 'preserve',
          color: 'black',
          weight: 500,
          // Calibrated for a 1024×1024 image. Keep consistent across generations.
          // (We state both px-equivalent and canvas-relative guidance.)
          size_px_equivalent_range_1024: { min: 26, max: 34 },
          size_canvas_height_percent_range: { min: 2.6, max: 3.4 },
          line_height: 1.1,
          letter_spacing: 0.0,
          text_alignment: 'center',
          max_lines: 2,
          wrap_behavior: 'wrap words (no hyphenation)',
        },
        placement: {
          anchor: 'upper-right',
          margin_percent: 6,
          max_width_percent: 55,
        },
      },
      background: {
        type: 'solid_or_subtle_gradient',
        color_hint: getBackgroundColor(template.category),
      },
      constraints: {
        no_logos: true,
        no_watermarks: true,
        no_signatures: true,
        no_frames: true,
        no_multiple_panels: true,
        no_real_person_likeness: true,
        // Extra hard constraints for consistency:
        speech_bubble_only_text: true,
        speech_bubble_count: 1,
      },
    },
    subject: {
      name: template.name || 'Agent',
      role: (template.role || '').slice(0, 80),
      category: template.category || 'general',
      domain_context: domainContext,
      core_capabilities: coreCapabilities,
      reference_image_policy: {
        use_reference_image_as_primary_character_identity: true,
        preserve_face_hair_age_clothing_style: true,
      },
    },
    composition: {
      camera: 'medium shot',
      aspect: 'square 1:1',
      eye_contact: 'subject must look directly at the camera/viewer',
      setting: 'clean modern tech workspace with subtle domain cues (not cluttered)',
      speech_bubble: {
        required: true,
        text: speechBubbleText,
        exact_text_required: true,
        // Reinforce standardization at the composition-level too.
        anchor: 'upper-right',
        style_ref: 'style.speech_bubble_style',
      },
    },
    slot: {
      kind: type,
      intent:
        type === 'problem_statements'
          ? 'empathetic understanding of user challenges'
          : type === 'capabilities'
            ? 'actively demonstrating capabilities while welcoming the viewer'
            : 'approachable, ready to help and conversational',
      negative_constraints: [
        'no busy backgrounds',
        'no unreadable small text',
        'no additional characters',
        'no brand marks',
        'avoid overly casual tone; keep professional',
      ],
    },
  };

  return JSON.stringify(spec, null, 2);
}

export class TemplateMarketingImageGenerationService {
  private hostRuntime: HostRuntime;
  constructor() {
    this.hostRuntime = createOpenRouterHostRuntime();
  }

  async generateProfileImage(args: {
    template: AgentTemplateModel;
    avatarImageUrl: string;
    type: ProfileImageType;
    coreCapabilities: string;
    domainContext: string;
  }): Promise<{ buffer: Buffer; mimeType: string; model: string }> {
    const model = 'google/gemini-3-pro-image-preview';
    const jsonPrompt = buildReusableJsonPrompt({
      template: args.template,
      type: args.type,
      coreCapabilities: args.coreCapabilities,
      domainContext: args.domainContext,
    });

    const userText = [
      'You are generating a single marketplace marketing image.',
      'Follow the JSON spec exactly.',
      'Use the provided reference avatar image as the character identity (same character).',
      'Return exactly ONE image. Do not return multiple images.',
      'Do not add any extra commentary.',
      '',
      'JSON_SPEC:',
      jsonPrompt,
    ].join('\n');

    const contentBlocks: ContentBlock[] = [
      { type: 'text', text: userText },
      { type: 'image_url', image_url: { url: args.avatarImageUrl } },
    ];

    const messages: LlmMessage[] = [{ role: 'user', content: contentBlocks }];

    const params: LlmParams = {
      model,
      // Multimodal input: text + reference avatar image
      messages,
      modalities: ['image', 'text'],
      // Be very explicit about only generating 1 image.
      imageConfig: { aspect_ratio: '1:1', num_images: 1 },
      temperature: 1.05,
      maxTokens: 128,
      stream: true,
    };

    const nodeOptions: NodeHandlerOptions = {
      hostRuntime: this.hostRuntime,
      runtimeEnv: { TEMPLATE_ID: args.template.id },
    };

    const llm = new LLM(params, nodeOptions);

    const items = await llm.execute();
    const response = ExecutionItemUtils.unwrapSingle(items) as unknown as LLMResponse;
    const images = response?.choices?.[0]?.message?.images;

    const list = Array.isArray(images) ? images : [];
    if (list.length !== 1) {
      throw new Error(`Expected exactly 1 generated image, got ${list.length}`);
    }
    const url = list[0]?.image_url?.url;
    if (typeof url !== 'string' || !url.trim()) {
      throw new Error('Generated image missing url');
    }

    let decoded: { buffer: Buffer; mimeType: string };
    if (url.startsWith('data:')) {
      decoded = decodeDataUrl(url);
    } else {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to fetch generated image: ${resp.status} ${resp.statusText}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      const mimeType = resp.headers.get('content-type') || 'image/png';
      decoded = { buffer: buf, mimeType };
    }

    const optimized = await optimizeToWebp(decoded, 1024);
    return { buffer: optimized.buffer, mimeType: optimized.mimeType, model };
  }
}

