import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: generate-character-variant
 * Generate 1 new character image variant with strong character consistency using a reference Starships image attachment
 */
export const generateCharacterVariantTool: ToolParams = {
  name: 'Generate Character Variant',
  slug: 'generate-character-variant',
  description:
    'Generate 1 new character image variant with strong character consistency using a reference Starships image attachment (from agentSlug or attachmentId) + a prompt, via google/gemini-3-pro-image-preview. Supports optional output dimensions via size (e.g., "1024x1024") or explicit width/height.',
  parameters: {
    type: 'object',
    required: ['prompt'],
    properties: {
      size: {
        type: 'string',
        description: 'Optional output size preset like "1024x1024". Mutually exclusive with width/height.',
      },
      width: {
        type: 'integer',
        maximum: 4096,
        minimum: 64,
        description: 'Optional output width in pixels. Must be provided together with height. Mutually exclusive with size.',
      },
      height: {
        type: 'integer',
        maximum: 4096,
        minimum: 64,
        description: 'Optional output height in pixels. Must be provided together with width. Mutually exclusive with size.',
      },
      prompt: {
        type: 'string',
        description: 'Instruction describing the desired change (pose, camera, scene, expression, etc.) while keeping the same character identity.',
      },
      agentSlug: {
        type: 'string',
        description: 'Slug of an agent in this starship. The tool will fetch the agent record and try to extract an attachmentId from it (e.g., avatar or reference image). Used when attachmentId is not provided.',
      },
      attachmentId: {
        type: 'string',
        description: 'Starships attachment id for the reference character image. If provided, this takes precedence over agentSlug.',
      },
      agentAttachmentField: {
        type: 'string',
        description: 'Optional dot-path to the attachmentId inside the get-agent response body (e.g., \'data.agent.avatarAttachmentId\'). If omitted, the tool tries common fields.',
      },
    },
  },
  blueprint: {
    edges: [
      {
        to: 'init',
        ref: 'e1',
        from: 'start',
      },
      {
        to: 'route',
        ref: 'e2',
        from: 'init',
      },
      {
        to: 'direct_attachment',
        ref: 'e3',
        from: 'route',
        condition: 'direct',
      },
      {
        to: 'get_agent',
        ref: 'e4',
        from: 'route',
        condition: 'agent',
      },
      {
        to: 'extract_attachment',
        ref: 'e5',
        from: 'get_agent',
      },
      {
        to: 'resolve_preview',
        ref: 'e6',
        from: 'direct_attachment',
      },
      {
        to: 'resolve_preview',
        ref: 'e7',
        from: 'extract_attachment',
      },
      {
        to: 'extract_preview_url',
        ref: 'e8',
        from: 'resolve_preview',
      },
      {
        to: 'prep_messages',
        ref: 'e9',
        from: 'extract_preview_url',
      },
      {
        to: 'llm',
        ref: 'e10',
        from: 'prep_messages',
      },
      {
        to: 'extract_image',
        ref: 'e11',
        from: 'llm',
      },
      {
        to: 'end',
        ref: 'e12',
        from: 'extract_image',
      },
    ],
    nodes: [
      {
        ref: 'start',
        name: 'Start',
        type: 'start',
        parameters: {},
      },
      {
        ref: 'init',
        name: 'Validate + Choose Source',
        type: 'code',
        parameters: {
          code: `async function main(ctx) {
  const input = ctx.input || {};

  const prompt = String(input.prompt ?? '').trim();
  if (!prompt) throw new Error('prompt is required (string)');

  const attachmentId = typeof input.attachmentId === 'string' && input.attachmentId.trim().length
    ? input.attachmentId.trim()
    : '';

  const agentSlug = typeof input.agentSlug === 'string' && input.agentSlug.trim().length
    ? input.agentSlug.trim()
    : '';

  if (!attachmentId && !agentSlug) {
    throw new Error('Provide attachmentId or agentSlug');
  }

  const agentAttachmentField = typeof input.agentAttachmentField === 'string' && input.agentAttachmentField.trim().length
    ? input.agentAttachmentField.trim()
    : '';

  // Optional output dimensions
  // Supports either a preset string like "1024x1024" or explicit width+height numbers.
  const size = typeof input.size === 'string' && input.size.trim().length ? input.size.trim() : '';

  const widthRaw = input.width;
  const heightRaw = input.height;

  const width = (widthRaw === undefined || widthRaw === null || widthRaw === '') ? null : Number(widthRaw);
  const height = (heightRaw === undefined || heightRaw === null || heightRaw === '') ? null : Number(heightRaw);

  const hasWH = width !== null || height !== null;

  if (hasWH) {
    if (width === null || height === null) throw new Error('If providing width/height you must provide both.');
    if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error('width and height must be numbers');
    if (!Number.isInteger(width) || !Number.isInteger(height)) throw new Error('width and height must be integers');
    if (width < 64 || height < 64) throw new Error('width/height must be >= 64');
    if (width > 4096 || height > 4096) throw new Error('width/height must be <= 4096');
  }

  if (size) {
    // light validation: "<int>x<int>"
    const m = size.match(/^(\\d{2,5})x(\\d{2,5})$/i);
    if (!m) throw new Error('size must look like "1024x1024"');
  }

  if (size && hasWH) {
    throw new Error('Provide either size OR width/height (not both).');
  }

  return {
    prompt,
    attachmentId: attachmentId || null,
    agentSlug: agentSlug || null,
    agentAttachmentField: agentAttachmentField || null,
    // dimension controls (optional)
    size: size || null,
    width: hasWH ? width : null,
    height: hasWH ? height : null,
    route: attachmentId ? 'direct' : 'agent'
  };
}`,
          timeout: 3000,
        },
      },
      {
        ref: 'route',
        name: 'Route (direct vs agent)',
        type: 'conditional',
        parameters: {
          condition: "{{ String((lastOutputOf('init') || {}).route) }}",
        },
      },
      {
        ref: 'direct_attachment',
        name: 'Use Direct attachmentId',
        type: 'code',
        parameters: {
          code: `async function main(ctx) {
  const init = ctx.lastOutputOf('init') || {};
  const attachmentId = typeof init.attachmentId === 'string' ? init.attachmentId : '';
  if (!attachmentId) throw new Error('attachmentId missing after init');
  return {
    prompt: String(init.prompt || ''),
    attachmentId,
    size: init.size ?? null,
    width: init.width ?? null,
    height: init.height ?? null,
  };
}`,
          timeout: 2000,
        },
      },
      {
        ref: 'get_agent',
        name: 'Starships: Get Agent',
        type: 'connector_action',
        parameters: {
          args: "{{ ({ starshipId: String(env('STARSHIP_ID') ?? ''), slug: String((lastOutputOf('init') || {}).agentSlug ?? '') }) }}",
          action: 'get-agent',
          timeout: 15000,
          connector: 'starships',
          failOnNon2xx: true,
        },
      },
      {
        ref: 'extract_attachment',
        name: 'Extract attachmentId from Agent',
        type: 'code',
        parameters: {
          code: `async function main(ctx) {
  const init = ctx.lastOutputOf('init') || {};
  const resp = ctx.lastOutputOf('get_agent') || {};

  const status = Number(resp.status);
  if (!Number.isFinite(status) || status < 200 || status >= 300) {
    const snippet = (() => {
      try { return JSON.stringify(resp.body); } catch { return String(resp.body ?? ''); }
    })();
    throw new Error(\`Failed to get agent (status \${resp.status}). body: \${snippet.slice(0, 600)}\`);
  }

  const body = resp.body;

  function getByPath(obj, path) {
    if (!obj || typeof obj !== 'object') return undefined;
    if (!path) return undefined;
    const parts = String(path).split('.').filter(Boolean);
    let cur = obj;
    for (const p of parts) {
      if (!cur || typeof cur !== 'object') return undefined;
      cur = cur[p];
    }
    return cur;
  }

  function pickFirstString(values) {
    for (const v of values) {
      if (typeof v === 'string' && v.trim().length) return v.trim();
    }
    return '';
  }

  let attachmentId = '';

  // 1) Explicit dot-path
  if (typeof init.agentAttachmentField === 'string' && init.agentAttachmentField.trim().length) {
    const v = getByPath(body, init.agentAttachmentField.trim());
    if (typeof v === 'string' && v.trim().length) attachmentId = v.trim();
  }

  // 2) Common fields
  if (!attachmentId) {
    const candidates = [
      'data.agent.avatarAttachmentId',
      'data.agent.avatar_attachment_id',
      'data.agent.imageAttachmentId',
      'data.agent.image_attachment_id',
      'data.agent.referenceAttachmentId',
      'data.agent.reference_attachment_id',
      'data.agent.profileImageAttachmentId',
      'data.agent.profile_image_attachment_id',
      'data.agent.attachmentId',
      'data.agent.attachment_id',
      'agent.avatarAttachmentId',
      'agent.imageAttachmentId',
      'avatarAttachmentId',
      'imageAttachmentId',
      'referenceAttachmentId',
    ];
    attachmentId = pickFirstString(candidates.map((p) => getByPath(body, p)));
  }

  // 3) Heuristic scan (shallow)
  if (!attachmentId) {
    const agentObj = (body && typeof body === 'object')
      ? (body.data && typeof body.data === 'object'
          ? (body.data.agent && typeof body.data.agent === 'object' ? body.data.agent : body.data)
          : (body.agent && typeof body.agent === 'object' ? body.agent : body))
      : null;

    if (agentObj && typeof agentObj === 'object') {
      const keys = Object.keys(agentObj);
      for (const k of keys) {
        const v = agentObj[k];
        const key = String(k).toLowerCase();
        if (typeof v === 'string' && v.trim().length) {
          if (key.includes('avatar') && key.includes('attachment') && key.endsWith('id')) { attachmentId = v.trim(); break; }
          if (key.includes('image') && key.includes('attachment') && key.endsWith('id')) { attachmentId = v.trim(); break; }
          if (key.includes('reference') && key.includes('attachment') && key.endsWith('id')) { attachmentId = v.trim(); break; }
          if (key.includes('attachment') && key.endsWith('id')) { attachmentId = v.trim(); break; }
        }
      }
    }
  }

  if (!attachmentId) {
    const debugKeys = (() => {
      try {
        const agentObj = body?.data?.agent ?? body?.data ?? body?.agent ?? body;
        return agentObj && typeof agentObj === 'object' ? Object.keys(agentObj).slice(0, 80) : [];
      } catch {
        return [];
      }
    })();
    throw new Error('Could not find attachmentId on agent. Provide attachmentId directly or set agentAttachmentField. agent keys (partial): ' + JSON.stringify(debugKeys));
  }

  return {
    prompt: String(init.prompt || ''),
    attachmentId,
    size: init.size ?? null,
    width: init.width ?? null,
    height: init.height ?? null,
  };
}`,
          timeout: 5000,
        },
      },
      {
        ref: 'resolve_preview',
        name: 'Starships: Resolve Attachment Preview URL',
        type: 'connector_action',
        parameters: {
          args: "{{ ({ starshipId: String(env('STARSHIP_ID') ?? ''), ids: [String(((lastOutputOf('direct_attachment') || lastOutputOf('extract_attachment') || {}).attachmentId) ?? '')] }) }}",
          action: 'get-attachments-preview-urls',
          timeout: 15000,
          connector: 'starships',
          failOnNon2xx: true,
        },
      },
      {
        ref: 'extract_preview_url',
        name: 'Extract previewUrl',
        type: 'code',
        parameters: {
          code: `async function main(ctx) {
  const resp = ctx.input || {};
  const upstream = ctx.lastOutputOf('direct_attachment') || ctx.lastOutputOf('extract_attachment') || {};

  const status = Number(resp.status);
  if (!Number.isFinite(status) || status < 200 || status >= 300) {
    const snippet = (() => {
      try { return JSON.stringify(resp.body); } catch { return String(resp.body ?? ''); }
    })();
    throw new Error(\`Failed to resolve attachment preview URL (status \${resp.status}). body: \${snippet.slice(0, 600)}\`);
  }

  const body = resp.body;

  function pushIfUrl(arr, v) {
    if (typeof v === 'string' && /^https?:\\/\\//.test(v)) arr.push(v);
  }

  const urls = [];

  if (body && typeof body === 'object') {
    const data = body.data ?? body;

    // Shape A: { data: { attachments: [ { id, previewUrl } ] } }
    if (data && typeof data === 'object') {
      if (Array.isArray(data.attachments)) {
        for (const a of data.attachments) {
          if (a && typeof a === 'object') {
            pushIfUrl(urls, a.previewUrl);
            pushIfUrl(urls, a.preview_url);
            pushIfUrl(urls, a.url);
          }
        }
      }

      // Shape B: { data: { items: [ ... ] } }
      if (Array.isArray(data.items)) {
        for (const a of data.items) {
          if (a && typeof a === 'object') {
            pushIfUrl(urls, a.previewUrl);
            pushIfUrl(urls, a.preview_url);
            pushIfUrl(urls, a.url);
          }
        }
      }

      // Shape C: { data: { <id>: { previewUrl } } }
      if (!Array.isArray(data)) {
        for (const k of Object.keys(data)) {
          const v = data[k];
          if (v && typeof v === 'object') {
            pushIfUrl(urls, v.previewUrl);
            pushIfUrl(urls, v.preview_url);
            pushIfUrl(urls, v.url);
          }
        }
      }

      // Shape D: { data: { id: 'att...', previewUrl: '...' } }
      pushIfUrl(urls, data.previewUrl);
      pushIfUrl(urls, data.preview_url);
      pushIfUrl(urls, data.url);

      // Shape E: { data: [ { previewUrl } ] }
      if (Array.isArray(data)) {
        for (const a of data) {
          if (a && typeof a === 'object') {
            pushIfUrl(urls, a.previewUrl);
            pushIfUrl(urls, a.preview_url);
            pushIfUrl(urls, a.url);
          }
        }
      }
    }
  }

  const previewUrl = urls[0] || '';
  if (!previewUrl) {
    const debugPreview = (() => {
      try { return JSON.stringify(body).slice(0, 1200); } catch { return String(body ?? '').slice(0, 1200); }
    })();
    throw new Error('previewUrl not found in attachments response. body: ' + debugPreview);
  }

  return {
    prompt: String(upstream.prompt || ''),
    attachmentId: String(upstream.attachmentId || ''),
    imageUrl: previewUrl,
    size: upstream.size ?? null,
    width: upstream.width ?? null,
    height: upstream.height ?? null,
  };
}`,
          timeout: 5000,
        },
      },
      {
        ref: 'prep_messages',
        name: 'Prepare Gemini Messages',
        type: 'code',
        parameters: {
          code: `async function main(ctx) {
  const input = ctx.input || {};

  const prompt = String(input.prompt ?? '').trim();
  if (!prompt) throw new Error('prompt is required (string)');

  const imageUrl = String(input.imageUrl ?? '').trim();
  if (!/^https?:\\/\\//.test(imageUrl)) throw new Error('imageUrl must be a resolved http(s) preview URL');

  // Dimension controls (optional)
  const size = typeof input.size === 'string' && input.size.trim().length ? input.size.trim() : '';
  const width = (input.width === null || input.width === undefined || input.width === '') ? null : Number(input.width);
  const height = (input.height === null || input.height === undefined || input.height === '') ? null : Number(input.height);

  let imageConfig = { n: 1 };

  // Best-effort: pass through whichever dimension fields the host/model supports.
  // (LLM node treats imageConfig as an opaque object; provider decides supported keys.)
  if (size) {
    imageConfig = { ...imageConfig, size };
  } else if (width !== null && height !== null) {
    imageConfig = { ...imageConfig, width, height };
  }

  const sizeHint = size
    ? \`Output size: \${size}.\\n\`
    : (width !== null && height !== null)
      ? \`Output size: \${width}x\${height}.\\n\`
      : '';

  const instruction =
    'You are generating a new image variant of the SAME character shown in the reference image.\\n' +
    'Maintain character identity and consistency: same face, hairstyle, body shape, skin tone, distinctive features, and outfit/branding unless explicitly changed.\\n' +
    'You may change pose, camera angle, expression, lighting, background, and composition as requested.\\n' +
    'Do not introduce a different person. Preserve the art style of the reference.\\n' +
    (sizeHint ? ('\\n' + sizeHint) : '\\n') +
    '\\nRequested change:\\n' + prompt +
    '\\n\\nGenerate exactly ONE output image. Return the image only (no extra text).';

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: instruction },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    },
  ];

  return {
    messages,
    modalities: ['text', 'image'],
    imageConfig,
    original: { prompt, imageUrl, attachmentId: input.attachmentId || null, size: size || null, width, height },
  };
}`,
          timeout: 3000,
        },
      },
      {
        ref: 'llm',
        name: 'Gemini (character ref)',
        type: 'llm',
        parameters: {
          model: 'google/gemini-3-pro-image-preview',
          stream: false,
          timeout: 120000,
          messages: "{{ (input || {}).messages }}",
          maxTokens: 4096,
          modalities: "{{ (input || {}).modalities }}",
          imageConfig: "{{ (input || {}).imageConfig }}",
          temperature: 0.7,
        },
      },
      {
        ref: 'extract_image',
        name: 'Extract 1 Image',
        type: 'code',
        parameters: {
          code: `async function main(ctx) {
  const resp = ctx.input || {};
  const prep = ctx.lastOutputOf('prep_messages') || {};

  const choice = (resp.choices && resp.choices[0]) ? resp.choices[0] : {};
  const message = choice.message || {};
  const content = message.content;

  function normalizeImageUrl(url) {
    if (typeof url !== 'string' || !url.trim()) return null;
    const u = url.trim();
    if (u.startsWith('data:image/')) return { kind: 'data_url', value: u };
    return { kind: 'url', value: u };
  }

  function pickFromContent(c) {
    if (Array.isArray(c)) {
      for (const part of c) {
        if (!part || typeof part !== 'object') continue;
        if (part.type === 'image_url' && part.image_url && typeof part.image_url.url === 'string') {
          return normalizeImageUrl(part.image_url.url);
        }
        if (part.type === 'image') {
          const data = typeof part.data === 'string' ? part.data : undefined;
          const mimeType = typeof part.mimeType === 'string' ? part.mimeType : undefined;
          if (data && data.startsWith('data:')) return { kind: 'data_url', value: data, mimeType };
          if (data && mimeType) return { kind: 'data_url', value: \`data:\${mimeType};base64,\${data}\`, mimeType };
          if (data) return { kind: 'base64', value: data, mimeType };
        }
      }
    }

    if (typeof c === 'string') {
      const mData = c.match(/data:image\\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);
      if (mData) return { kind: 'data_url', value: mData[0] };

      const mUrl = c.match(/https?:\\/\\/\\S+\\.(?:png|jpg|jpeg|webp)(?:\\?\\S+)?/i);
      if (mUrl) return { kind: 'url', value: mUrl[0] };
    }

    return null;
  }

  let image = pickFromContent(content);

  if (!image && Array.isArray(message.images) && message.images.length) {
    const v = message.images[0];
    if (typeof v === 'string') {
      image = normalizeImageUrl(v);
    } else if (v && typeof v === 'object') {
      if (v.type === 'image_url' && v.image_url && typeof v.image_url.url === 'string') {
        image = normalizeImageUrl(v.image_url.url);
      }
      if (!image && typeof v.url === 'string') image = normalizeImageUrl(v.url);
      if (!image && typeof v.data === 'string') {
        const mimeType = typeof v.mimeType === 'string' ? v.mimeType : undefined;
        image = mimeType
          ? { kind: 'data_url', value: \`data:\${mimeType};base64,\${v.data}\`, mimeType }
          : { kind: 'base64', value: v.data, mimeType };
      }
    }
  }

  if (!image) {
    const debug = {
      hasChoices: Array.isArray(resp.choices),
      messageKeys: message && typeof message === 'object' ? Object.keys(message) : [],
      contentType: Array.isArray(content) ? 'array' : typeof content,
      contentPreview: typeof content === 'string' ? content.slice(0, 4000) : content,
    };

    return {
      ok: false,
      model: String(resp.model || 'google/gemini-3-pro-image-preview'),
      prompt: (prep.original || {}).prompt,
      referenceImage: (prep.original || {}).imageUrl,
      image: null,
      debug,
    };
  }

  return {
    ok: true,
    model: String(resp.model || 'google/gemini-3-pro-image-preview'),
    prompt: (prep.original || {}).prompt,
    referenceImage: (prep.original || {}).imageUrl,
    image,
  };
}`,
          timeout: 5000,
        },
      },
      {
        ref: 'end',
        name: 'End',
        type: 'end',
        parameters: {
          output: "{{ (lastOutputOf('extract_image') || {}).image }}",
        },
      },
    ],
  },
};

export const generateCharacterVariantToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: generateCharacterVariantTool.name,
  description: generateCharacterVariantTool.description,
  parameters: generateCharacterVariantTool.parameters,
  blueprint: generateCharacterVariantTool.blueprint,
  transforms: null,
  mutations: null,
  condition: null,

  slug: 'generate-character-variant',
  version: '1.0.0',
  category: 'creative',
  exampleUsage:
    '{ "agentSlug": "clara", "prompt": "same character, but looking thoughtful with hand on chin, background is a modern office" }',
  requiresApiKey: false,
  configurationFields: [],
};
