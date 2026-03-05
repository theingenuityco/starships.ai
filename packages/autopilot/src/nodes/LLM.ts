/**
 * LLM Class
 *
 * Executable LLM (Large Language Model) that handles AI model interactions via OpenRouter.
 * Uses OpenAI SDK for reliable streaming and tool call accumulation.
 */

import { BaseNode } from './BaseNode';
import type { LlmParams, ToolParams } from '@/types/node-parameters';
import { ValidationResult, ValidationError } from '@/types/validation';
import { ExecutionItem } from '@/types';
import { NodeHandlerOptions } from '@/types/node-handler';
import {
  Cacheable,
  CacheableSystemMessage,
  ContentBlock,
  GeneratedImage,
  LLMMessageRole,
  LLMResponse,
  LLMUsage,
  LlmMessage,
  ReasoningDetail,
  LlmToolCall,
  MessageContent,
} from '@/types/llm';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import OpenAI from 'openai';

// Gate LLM prompt/arg logging behind a single constant.
//
// Short-circuit behavior:
// - In non-production, default to ON (so developers see the exact provider request without extra config).
// - In production, require explicit opt-in via env var to avoid accidental prompt leakage in logs.
const ENABLE_LLM_LOGGING = (() => {
  try {
    const env = typeof process !== 'undefined' && typeof process.env !== 'undefined' ? process.env : undefined;
    const nodeEnv = env && typeof env.NODE_ENV === 'string' ? env.NODE_ENV : '';
    if (nodeEnv !== 'production') return true;
    return env?.ENABLE_LLM_LOGGING === 'true';
  } catch {
    // Safe default: log in dev-like environments
    return true;
  }
})();

// Typed view over the normalized streaming chunk we forward to the ConversationService
type NormalizedToolCallDelta = {
  index?: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

type NormalizedDelta = {
  content?: string;
  role?: string;
  toolCalls?: NormalizedToolCallDelta[];
};

type NormalizedMessage = {
  role?: string;
  content?: string;
  reasoning?: string;
  toolCalls?: Array<{
    id?: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
};

type NormalizedChoice = {
  index: number;
  finishReason?: string;
  delta?: NormalizedDelta;
  message?: NormalizedMessage;
};

type NormalizedUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  completionTokensDetails?: { reasoningTokens?: number };
};

type NormalizedChunk = {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices: NormalizedChoice[];
  usage?: NormalizedUsage;
};

export class LLM extends BaseNode<LlmParams> {
  private emittedToolCalls: Set<string> = new Set();
  private static readonly DEBUG_TOOLCALLS = false;

  constructor(params: LlmParams, options?: NodeHandlerOptions) {
    super(params, options);
  }

  private redactUrl(url: string): string {
    try {
      const u = new URL(url);
      // Drop querystring (often contains auth tokens) and keep only origin + pathname.
      return `${u.origin}${u.pathname}`;
    } catch {
      // If it isn't a URL, still avoid logging long token-like strings.
      return url.length > 200 ? url.slice(0, 200) + '…' : url;
    }
  }

  private summarizeContentForLog(content: unknown): unknown {
    if (typeof content === 'string') {
      return content;
    }
    if (!Array.isArray(content)) return content;

    // Multimodal content blocks: redact URL-bearing fields.
    return content.map((b) => {
      if (!b || typeof b !== 'object') return b;
      const rec = b as Record<string, unknown>;
      const type = typeof rec.type === 'string' ? rec.type : 'unknown';

      if (type === 'image_url') {
        const iu = rec.image_url && typeof rec.image_url === 'object' ? (rec.image_url as Record<string, unknown>) : null;
        const rawUrl = iu && typeof iu.url === 'string' ? iu.url : '';
        return {
          type: 'image_url',
          image_url: { ...(iu ? iu : {}), ...(rawUrl ? { url: this.redactUrl(rawUrl) } : {}) },
        };
      }
      if (type === 'file') {
        const f = rec.file && typeof rec.file === 'object' ? (rec.file as Record<string, unknown>) : null;
        const raw = f && typeof f.file_data === 'string' ? f.file_data : '';
        return {
          type: 'file',
          file: { ...(f ? f : {}), ...(raw ? { file_data: this.redactUrl(raw) } : {}) },
        };
      }
      if (type === 'text') {
        const text = typeof rec.text === 'string' ? rec.text : '';
        return { ...rec, ...(text ? { text } : {}) };
      }
      return rec;
    });
  }

  /**
   * Drop tool-result messages that no longer have their corresponding tool-call in context.
   *
   * This can happen when the host provides a truncated message window (e.g. last-N),
   * where an assistant tool_call message is outside the window but its tool result remains inside.
   * Some providers reject such prompts with 400s.
   */
  private dropOrphanToolResults(messages: LlmMessage[]): LlmMessage[] {
    const toolCallIdsSeen = new Set<string>();
    const out: LlmMessage[] = [];

    for (const m of Array.isArray(messages) ? messages : []) {
      if (!m || typeof m !== 'object') continue;

      if (m.role === 'assistant' && Array.isArray((m as unknown as { toolCalls?: unknown[] }).toolCalls)) {
        const calls = (m as unknown as { toolCalls?: unknown[] }).toolCalls as unknown[];
        for (const c of calls) {
          if (!c || typeof c !== 'object') continue;
          const id = (c as Record<string, unknown>).id;
          if (typeof id === 'string' && id.trim()) toolCallIdsSeen.add(id.trim());
        }
      }

      if (m.role === 'tool') {
        const toolCallId = (m as unknown as { toolCallId?: unknown }).toolCallId;
        if (typeof toolCallId === 'string' && toolCallId.trim()) {
          if (!toolCallIdsSeen.has(toolCallId.trim())) {
            // Orphan tool result; skip it for provider requests.
            continue;
          }
        } else {
          // Tool message without a toolCallId is not provider-safe; drop it.
          continue;
        }
      }

      out.push(m);
    }

    return out;
  }

  private formatMessagesForLog(args: { messages: unknown[] }): string {
    const out: string[] = [];

    for (let i = 0; i < args.messages.length; i++) {
      const m = args.messages[i] as Record<string, unknown>;
      const role = typeof m?.role === 'string' ? m.role : 'unknown';
      const name = typeof m['name'] === 'string' ? String(m['name']) : '';
      const toolCallId = typeof m['tool_call_id'] === 'string' ? String(m['tool_call_id']) : '';
      const headerParts = [`#${i + 1}`, role];
      if (name) headerParts.push(`name=${name}`);
      if (toolCallId) headerParts.push(`tool_call_id=${toolCallId}`);
      out.push(headerParts.join(' '));

      // Surface reasoning preservation fields (OpenRouter extension) without printing the full text.
      // This makes it visible in logs that we are "sending reasoning back".
      try {
        const r = typeof (m as { reasoning?: unknown }).reasoning === 'string' ? ((m as { reasoning: string }).reasoning as string) : '';
        const rd = (m as { reasoning_details?: unknown }).reasoning_details;
        const rdCount = Array.isArray(rd) ? rd.length : 0;
        if (role === 'assistant') {
          if (rdCount > 0) out.push(`[reasoning_details] count=${rdCount}`);
          if (r.trim().length > 0) out.push(`[reasoning] len=${r.length}`);
        }
      } catch {
        // ignore
      }

      const summarized = this.summarizeContentForLog((m as { content?: unknown })?.content);
      if (typeof summarized === 'string') {
        out.push(summarized);
      } else if (Array.isArray(summarized)) {
        for (const block of summarized) {
          if (!block || typeof block !== 'object') continue;
          const rec = block as Record<string, unknown>;
          const type = typeof rec.type === 'string' ? rec.type : 'unknown';
          if (type === 'text') {
            const t = typeof rec.text === 'string' ? rec.text : '';
            if (t) out.push(`[text] ${t}`);
          } else if (type === 'image_url') {
            const iu = rec.image_url && typeof rec.image_url === 'object' ? (rec.image_url as Record<string, unknown>) : null;
            const url = iu && typeof iu.url === 'string' ? iu.url : '';
            out.push(url ? `[image_url] ${url}` : '[image_url]');
          } else if (type === 'file') {
            const f = rec.file && typeof rec.file === 'object' ? (rec.file as Record<string, unknown>) : null;
            const filename = f && typeof f.filename === 'string' ? f.filename : '';
            const fileData = f && typeof f.file_data === 'string' ? f.file_data : '';
            const parts = ['[file]'];
            if (filename) parts.push(`filename=${filename}`);
            if (fileData) parts.push(`file_data=${fileData}`);
            out.push(parts.join(' '));
          } else {
            out.push(`[${type}]`);
          }
        }
      } else if (summarized != null) {
        out.push(String(summarized));
      }

      out.push(''); // blank line between messages
    }

    return out.join('\n').trim();
  }

  private static extractToolAttachmentIds(raw: string): string[] {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
      const rec = parsed as Record<string, unknown>;
      const attachments = Array.isArray(rec.attachments) ? rec.attachments : [];
      const ids: string[] = [];
      for (const a of attachments) {
        if (!a || typeof a !== 'object') continue;
        const id = (a as Record<string, unknown>).id;
        if (typeof id === 'string' && id.trim().length > 0) ids.push(id.trim());
      }
      const seen = new Set<string>();
      const uniq: string[] = [];
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        uniq.push(id);
      }
      return uniq;
    } catch {
      return [];
    }
  }

  private async maybeResolveToolAttachmentPreviewUrls(args: {
    providerMessages: LlmMessage[];
    hostRuntime: NonNullable<NodeHandlerOptions['hostRuntime']>;
    runtimeEnv?: Record<string, unknown>;
  }): Promise<Map<string, string>> {
    const starshipIdRaw = args.runtimeEnv ? (args.runtimeEnv as Record<string, unknown>).STARSHIP_ID : undefined;
    const starshipId = typeof starshipIdRaw === 'string' && starshipIdRaw.trim().length > 0 ? starshipIdRaw.trim() : '';
    if (typeof args.hostRuntime.connectorAction !== 'function') return new Map();

    const idsNeedingUrls: string[] = [];
    const seen = new Set<string>();

    for (const m of Array.isArray(args.providerMessages) ? args.providerMessages : []) {
      if (!m || typeof m !== 'object') continue;
      const role = (m as unknown as { role?: unknown }).role;
      if (role !== 'tool') continue;
      const c = (m as unknown as { content?: unknown }).content;
      if (typeof c !== 'string' || !c.includes('"attachments"')) continue;
      if (c.includes('previewUrl')) continue; // already has previewUrl(s)
      for (const id of LLM.extractToolAttachmentIds(c)) {
        if (seen.has(id)) continue;
        seen.add(id);
        idsNeedingUrls.push(id);
      }
    }

    if (idsNeedingUrls.length === 0) return new Map();

    try {
      const resp = await args.hostRuntime.connectorAction({
        connector: 'starships',
        action: 'get-attachments-preview-urls',
        args: { ...(starshipId ? { starshipId } : {}), ids: idsNeedingUrls.join(',') },
        timeoutMs: 15000,
      });

      const body = resp?.body as unknown;
      const list = Array.isArray(body)
        ? body
        : body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>).data)
          ? ((body as Record<string, unknown>).data as unknown[])
          : body &&
              typeof body === 'object' &&
              (body as Record<string, unknown>).success === true &&
              Array.isArray((body as Record<string, unknown>).data)
            ? ((body as Record<string, unknown>).data as unknown[])
            : [];

      const out = new Map<string, string>();
      for (const a of list) {
        if (!a || typeof a !== 'object') continue;
        const rec = a as Record<string, unknown>;
        const id = rec.id;
        const previewUrl = rec.previewUrl;
        if (typeof id === 'string' && id.trim() && typeof previewUrl === 'string' && previewUrl.trim()) {
          out.set(id.trim(), previewUrl.trim());
        }
      }

      return out;
    } catch {
      return new Map();
    }
  }

  private coerceMaybeJson<T = unknown>(value: unknown): T | undefined {
    if (value == null) return undefined;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      try {
        return JSON.parse(trimmed) as T;
      } catch {
        return undefined;
      }
    }
    return value as T;
  }

  private mergeSystemMessagesIntoOne(messages: LlmMessage[]): LlmMessage[] {
    const list = Array.isArray(messages) ? messages : [];
    if (list.length === 0) return [];

    const toText = (content: unknown): string => {
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        // ContentBlock[] – only text parts are meaningful for system prompts
        return (content as Array<{ type?: unknown; text?: unknown }>)
          .map((p) => (p && p.type === 'text' && typeof p.text === 'string' ? p.text : ''))
          .filter(Boolean)
          .join('\n');
      }
      try {
        return JSON.stringify(content ?? '');
      } catch {
        return '';
      }
    };

    let firstSystemIndex = -1;
    const systemParts: string[] = [];
    const out: LlmMessage[] = [];

    for (const m of list) {
      if (!m || typeof m !== 'object') continue;
      const role = (m as unknown as { role?: unknown }).role;
      if (role === 'system') {
        const txt = toText((m as unknown as { content?: unknown }).content).trim();
        if (txt) systemParts.push(txt);
        if (firstSystemIndex === -1) {
          firstSystemIndex = out.length;
          // placeholder; content replaced after loop
          out.push({ role: 'system', content: '' } as LlmMessage);
        }
        continue;
      }
      out.push(m);
    }

    if (firstSystemIndex >= 0) {
      const combined = systemParts.join('\n\n').trim();
      (out[firstSystemIndex] as unknown as { content?: unknown }).content = combined.length > 0 ? combined : 'System instructions';
    }

    return out;
  }

  /**
   * Compute a non-overlapping append by trimming any prefix of 'fragment' that
   * already exists as a suffix of 'base'. This mirrors the ConversationService
   * behavior to avoid duplicated reasoning/content fragments.
   */
  private static computeNonOverlappingAppend(base: string, fragment: string): string {
    if (!fragment) return '';
    const maxCheck = Math.min(base.length, fragment.length);
    for (let k = maxCheck; k > 0; k--) {
      if (base.endsWith(fragment.slice(0, k))) {
        return fragment.slice(k);
      }
    }
    return fragment;
  }

  /**
   * Execute the LLM request with streaming and optional input items
   * Uses OpenAI SDK for reliable streaming and tool call handling
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.getParams();
    const opts = this.getOptions();
    const hostRuntime = opts?.hostRuntime;
    if (!hostRuntime || typeof hostRuntime.llm !== 'function') {
      throw this.handleExecutionError(new Error('Host runtime LLM is not configured.'));
    }

    try {
      // Use input data as user message if no explicit messages provided
      let messages = params.messages;
      if (input && input.length > 0 && (!messages || (Array.isArray(messages) && messages.length === 0))) {
        const inputData = ExecutionItemUtils.unwrapSingle(input);
        const inputContent = typeof inputData === 'string' ? inputData : JSON.stringify(inputData);
        messages = [{ role: 'user', content: inputContent }];
      }

      // Canonical messages for LLM execution
      const sourceMessages = this.coerceToLlmMessages(messages || params.messages);

      // IMPORTANT:
      // Tool results can contain extremely large payloads (notably base64 images embedded in JSON).
      // Never send those verbatim to the upstream provider, or we'll hit prompt token limits.
      // We sanitize ONLY the provider request (does not mutate state/messages).
      const providerMessages = this.sanitizeMessagesForProvider(sourceMessages);
      const resolvedPreviewUrlsById = await this.maybeResolveToolAttachmentPreviewUrls({
        providerMessages,
        hostRuntime,
        runtimeEnv: opts?.runtimeEnv,
      });

      const providerMessagesWithResolved: LlmMessage[] = [];
      for (const m of Array.isArray(providerMessages) ? providerMessages : []) {
        providerMessagesWithResolved.push(m);
        if (!m || typeof m !== 'object') continue;
        const role = (m as unknown as { role?: unknown }).role;
        if (role !== 'tool') continue;
        const c = (m as unknown as { content?: unknown }).content;
        if (typeof c !== 'string') continue;
        if (!c.includes('"attachments"')) continue;
        if (c.includes('previewUrl')) continue; // sanitizeMessagesForProvider already handles these cases
        const ids = LLM.extractToolAttachmentIds(c);
        if (ids.length === 0) continue;
        const previewUrls = ids
          .map((id) => resolvedPreviewUrlsById.get(id))
          .filter((u): u is string => typeof u === 'string' && u.length > 0);
        if (previewUrls.length === 0) continue;
        providerMessagesWithResolved.push({
          role: 'user',
          content: [
            { type: 'text', text: '[Tool produced image attachment(s)]' },
            ...previewUrls.slice(0, 8).map((url) => ({ type: 'image_url', image_url: { url } })),
          ],
        } as LlmMessage);
      }

      // Ensure provider request is valid even when host truncates history:
      // remove tool results that no longer have their corresponding tool call in context.
      const providerMessagesForRequest = this.mergeSystemMessagesIntoOne(
        this.dropOrphanToolResults(providerMessagesWithResolved)
      );
      // Condensed request log: essential params only, with truncated message previews
      // const truncate = (text: unknown, max = 160): string => {
      //   if (typeof text !== 'string') return typeof text === 'undefined' ? '' : '[non-text content]';
      //   const compact = text.replace(/\s+/g, ' ').trim();
      //   return compact.length > max ? `${compact.slice(0, max)}…` : compact;
      // };

      // const summarizedMessages = sourceMessages.map((m, i) => {
      //   const summary: {
      //     index: number;
      //     role: LLMMessageRole;
      //     contentPreview?: string;
      //     toolCalls?: string[];
      //   } = { index: i, role: m.role };

      //   if (typeof m.content === 'string') {
      //     summary.contentPreview = truncate(m.content);
      //   }
      //   if (Array.isArray(m.toolCalls)) {
      //     summary.toolCalls = m.toolCalls.map((tc) => tc.function.name).filter((name): name is string => Boolean(name));
      //   }
      //   return summary;
      // });

      // const requestSummary = {
      //   model: requestOptions.model,
      //   stream: requestOptions.stream === true,
      //   params: {
      //     temperature: typeof requestOptions.temperature === 'number' ? requestOptions.temperature : 'default',
      //     top_p: typeof requestOptions.top_p === 'number' ? requestOptions.top_p : 'default',
      //     max_tokens: typeof requestOptions.max_tokens === 'number' ? requestOptions.max_tokens : 'default',
      //     presence_penalty: typeof requestOptions.presence_penalty === 'number' ? requestOptions.presence_penalty : 'default',
      //     frequency_penalty: typeof requestOptions.frequency_penalty === 'number' ? requestOptions.frequency_penalty : 'default',
      //   },
      //   tools: requestOptions.tools
      //     ? {
      //         count: requestOptions.tools.length,
      //         parallel: requestOptions.parallel_tool_calls ?? false,
      //         choice: requestOptions.tool_choice ?? 'auto',
      //         slugs: requestOptions.tools
      //           .map((t) => (t.type === 'function' ? t.function.name : undefined))
      //           .filter((name): name is string => Boolean(name)),
      //       }
      //     : undefined,
      //   messages: summarizedMessages,
      // };

      // Delegate provider selection and credential management to HostRuntime;
      // the host returns an AsyncIterable of provider-native chunks.
      const modalities = this.coerceMaybeJson<Array<'text' | 'image'>>(params.modalities);
      const imageConfig = this.coerceMaybeJson<Record<string, unknown>>(params.imageConfig);
      const plugins = this.coerceMaybeJson<Array<{ id: string; max_results?: number }>>(params.plugins);
      const streamFlag = this.coerceMaybeJson<boolean>(params.stream);
      const responseFormat = this.coerceMaybeJson<Record<string, unknown>>(params.responseFormat);

      const openAiMessagesForRequest = this.convertMessagesToOpenAI(providerMessagesForRequest);
      const runtime = (opts?.runtimeEnv && typeof opts.runtimeEnv === 'object' ? opts.runtimeEnv : {}) as Record<string, unknown>;
      const endUserIdRaw = typeof runtime.AUTH_USER_ID === 'string' ? runtime.AUTH_USER_ID : '';
      const endUserId = typeof endUserIdRaw === 'string' ? endUserIdRaw.trim().slice(0, 128) : '';

      // Log the prompt we are about to send (safe + bounded) ONLY when explicitly enabled.
      // This logs the provider request (after sanitization), with URL redaction for multimodal blocks.
      if (ENABLE_LLM_LOGGING) {
        try {
          const conversationId = typeof runtime.CONVERSATION_ID === 'string' ? runtime.CONVERSATION_ID : undefined;
          const starshipId = typeof runtime.STARSHIP_ID === 'string' ? runtime.STARSHIP_ID : undefined;
          const agentId = typeof runtime.AGENT_ID === 'string' ? runtime.AGENT_ID : undefined;

          const tools = Array.isArray(params.tools) ? (params.tools as ToolParams[]) : undefined;
          const toolSlugs = Array.isArray(tools)
            ? tools
                .map((t) => (t && typeof t === 'object' ? (t as unknown as { slug?: unknown }).slug : undefined))
                .filter((s): s is string => typeof s === 'string' && s.length > 0)
            : [];

          const pretty = this.formatMessagesForLog({
            messages: Array.isArray(openAiMessagesForRequest) ? (openAiMessagesForRequest as unknown[]) : [],
          });

          const formatReasoningForLog = (value: unknown): string | undefined => {
            if (value == null) return undefined;
            try {
              const raw = typeof value === 'string' ? value : JSON.stringify(value);
              const trimmed = raw.trim();
              if (!trimmed) return undefined;
              // Keep logs bounded (avoid accidental huge payloads).
              return trimmed.length > 400 ? `${trimmed.slice(0, 400)}…` : trimmed;
            } catch {
              return undefined;
            }
          };
          const reasoningForLog = formatReasoningForLog(params.reasoning);

          const header = [
            '[LLM_PROMPT]',
            `model=${String(params.model)}`,
            conversationId ? `conversationId=${conversationId}` : null,
            starshipId ? `starshipId=${starshipId}` : null,
            agentId ? `agentId=${agentId}` : null,
            typeof params.temperature === 'number' ? `temperature=${params.temperature}` : null,
            typeof params.maxTokens === 'number' ? `maxTokens=${params.maxTokens}` : null,
            reasoningForLog ? `reasoning=${reasoningForLog}` : null,
            toolSlugs.length ? `tools=${toolSlugs.join(',')}` : null,
          ]
            .filter(Boolean)
            .join(' ');

          console.info(`${header}\n\n${pretty}\n`);
        } catch {
          // best-effort: never fail the LLM request because logging failed
        }
      }

      const stream = await hostRuntime.llm({
        model: params.model,
        messages: openAiMessagesForRequest,
        ...(endUserId ? { endUserId } : {}),
        tools: Array.isArray(params.tools) ? (params.tools as ToolParams[]) : undefined,
        temperature: typeof params.temperature === 'number' ? params.temperature : undefined,
        maxTokens: typeof params.maxTokens === 'number' ? params.maxTokens : undefined,
        topP: typeof params.topP === 'number' ? params.topP : undefined,
        frequencyPenalty: typeof params.frequencyPenalty === 'number' ? params.frequencyPenalty : undefined,
        presencePenalty: typeof params.presencePenalty === 'number' ? params.presencePenalty : undefined,
        reasoning: params.reasoning,
        ...(responseFormat && typeof responseFormat === 'object' ? { responseFormat } : {}),
        ...(typeof streamFlag === 'boolean' ? { stream: streamFlag } : {}),
        ...(Array.isArray(modalities) && modalities.length > 0 ? { modalities } : {}),
        ...(imageConfig && typeof imageConfig === 'object' ? { imageConfig } : {}),
        ...(Array.isArray(plugins) && plugins.length > 0 ? { plugins } : {}),
      });

      const llmResponse = await this.processOpenAIStream(stream as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>);

      return ExecutionItemUtils.wrapSingle(llmResponse, input?.[0]);
    } catch (error) {
      console.error(error);
      throw this.handleExecutionError(error, 'LLM execution failed');
    }
  }

  /**
   * Sanitize messages before sending to the upstream provider.
   *
   * - Does NOT mutate input state/messages (important for server-side persistence/debugging).
   * - Primary goal is to avoid provider token overflow caused by huge tool_result payloads.
   */
  private sanitizeMessagesForProvider(messages: LlmMessage[]): LlmMessage[] {
    const MAX_TOOL_TEXT_CHARS = 20_000;
    const MAX_ANY_TEXT_CHARS = 60_000;

    const stripEmbeddedImageDataUrls = (raw: string): { stripped: string; count: number } => {
      // Never send base64 image data URLs upstream. Providers either:
      // - support HTTPS URLs (preferred; use presigned S3 URLs), or
      // - require bytes (handled in provider adapters after fetching the URL).
      //
      // Tool outputs occasionally include `data:image/...;base64,...` inside JSON strings.
      // Replace them with a small placeholder so we keep semantics without leaking huge blobs.
      const re = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;
      let count = 0;
      const stripped = raw.replace(re, () => {
        count++;
        return '[embedded_image_omitted_use_attachments]';
      });
      return { stripped, count };
    };

    const out: LlmMessage[] = [];
    for (const m of Array.isArray(messages) ? messages : []) {
      if (!m || typeof m !== 'object') continue;

      const role = (m as unknown as { role?: unknown }).role;
      const content = (m as unknown as { content?: unknown }).content;

      if (typeof content !== 'string') {
        // Preserve multimodal blocks as-is; they are generally small and structured.
        out.push(m);
        continue;
      }

      // Enforce "URL-only" image handling: strip any embedded base64 data URLs before sending upstream.
      const { stripped: s, count: strippedCount } = stripEmbeddedImageDataUrls(content);
      const looksLikeEmbeddedImage = strippedCount > 0 || (s.includes('data:image/') && s.includes(';base64,'));

      const extractToolAttachmentPreviewUrls = (raw: string): string[] => {
        // Tool messages in Starships server-tools mode are JSON.stringify(payload),
        // where payload may include: { attachments: [{ previewUrl, mimeType, ... }] }.
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (!parsed || typeof parsed !== 'object') return [];
          const rec = parsed as Record<string, unknown>;
          const attachments = Array.isArray(rec.attachments) ? rec.attachments : [];
          const urls: string[] = [];
          for (const a of attachments) {
            if (!a || typeof a !== 'object') continue;
            const pr = (a as Record<string, unknown>).previewUrl;
            if (typeof pr === 'string' && pr.trim().length > 0) urls.push(pr.trim());
          }
          return urls;
        } catch {
          return [];
        }
      };

      // Tool results are the primary culprit (often include raw provider responses with base64 images).
      if (role === 'tool') {
        // If the tool result includes attachment preview URLs, add a provider-only multimodal hint
        // so vision models can see the image(s) without embedding huge base64 blobs.
        const previewUrls = extractToolAttachmentPreviewUrls(s);
        if (previewUrls.length > 0) {
          // Keep the tool message, but ensure we never send embedded base64 blobs.
          out.push(
            s === content
              ? m
              : ({
                  ...(m as unknown as Record<string, unknown>),
                  content: s,
                } as LlmMessage)
          );
          out.push({
            role: 'user',
            content: [
              { type: 'text', text: '[Tool produced image attachment(s)]' },
              ...previewUrls.slice(0, 8).map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
          } as LlmMessage);
          continue;
        }
        if (looksLikeEmbeddedImage || s.length > MAX_TOOL_TEXT_CHARS) {
          const prefix = s.slice(0, Math.min(MAX_TOOL_TEXT_CHARS, s.length));
          out.push({
            ...(m as unknown as Record<string, unknown>),
            content: `${prefix}\n\n[tool_result truncated for provider: originalLength=${s.length} chars]\n`,
          } as LlmMessage);
          continue;
        }
      }

      // Generic safety: never send multi-hundred KB blobs to providers.
      if (s.length > MAX_ANY_TEXT_CHARS) {
        const prefix = s.slice(0, MAX_ANY_TEXT_CHARS);
        out.push({
          ...(m as unknown as Record<string, unknown>),
          content: `${prefix}\n\n[truncated for provider: originalLength=${s.length} chars]\n`,
        } as LlmMessage);
        continue;
      }

      // If we stripped data URLs, send the stripped content (never the original).
      out.push(
        s === content
          ? m
          : ({
              ...(m as unknown as Record<string, unknown>),
              content: s,
            } as LlmMessage)
      );
    }

    return out;
  }

  /**
   * Normalize OpenRouter usage response (snake_case) to our LLMUsage type (camelCase)
   */
  private normalizeUsage(usage: unknown): LLMUsage {
    if (!usage || typeof usage !== 'object') {
      return { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 };
    }

    const usageObj = usage as Record<string, unknown>;
    const promptTokens = typeof usageObj.prompt_tokens === 'number' ? usageObj.prompt_tokens : 0;
    const completionTokens = typeof usageObj.completion_tokens === 'number' ? usageObj.completion_tokens : 0;
    const totalTokens = typeof usageObj.total_tokens === 'number' ? usageObj.total_tokens : promptTokens + completionTokens;
    // Prefer BYOK upstream provider cost when available (OpenRouter usage accounting).
    // - cost_details.upstream_inference_cost: upstream USD cost (BYOK)
    // - cost: OpenRouter billed cost (credits/USD)
    const costDetails =
      usageObj.cost_details && typeof usageObj.cost_details === 'object' ? (usageObj.cost_details as Record<string, unknown>) : null;
    const upstream = costDetails ? costDetails.upstream_inference_cost : undefined;
    const rawCost = typeof upstream === 'number' ? upstream : typeof usageObj.cost === 'number' ? usageObj.cost : 0;
    const cost = Number.isFinite(rawCost) ? rawCost : 0;

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      cost,
    };
  }

  /**
   * Convert ToolParams to OpenAI function calling format with caching
   * Adds cache_control to LAST tool definition (caches all tools as a group)
   * Uses tool.slug as the function name for consistent kebab-case format
   */
  private convertToOpenAITools(tools: ToolParams[]): Array<OpenAI.Chat.ChatCompletionTool & Cacheable> {
    if (!Array.isArray(tools) || tools.length === 0) {
      return [];
    }

    return tools.map((tool, index) => {
      const isLastTool = index === tools.length - 1;

      const toolDef: OpenAI.Chat.ChatCompletionTool & Cacheable = {
        type: 'function' as const,
        function: {
          name: tool.slug,
          description: tool.description,
          parameters: tool.parameters as Record<string, unknown>,
        },
      };

      // Add cache_control to last tool (caches ALL tool definitions)
      if (isLastTool) {
        toolDef.cache_control = { type: 'ephemeral' };
      }

      return toolDef;
    });
  }

  /**
   * Convert canonical LlmMessage[] to OpenAI ChatCompletionMessageParam[]
   * - assistant with toolCalls -> assistant with tool_calls (arguments stringified)
   * - tool with toolCallId -> tool with tool_call_id
   */
  private convertMessagesToOpenAI(messages: LlmMessage[] | undefined): OpenAI.Chat.ChatCompletionMessageParam[] {
    const list = Array.isArray(messages) ? messages : [];
    return list.map((m) => this.convertMessageToOpenAI(m));
  }

  private sanitizeOpenAIName(name: unknown): string | undefined {
    if (typeof name !== 'string') return undefined;
    const raw = name.trim();
    if (!raw) return undefined;
    // OpenAI expects <=64 chars and a restricted charset; keep it conservative for OpenRouter too.
    const safe = raw
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 64);
    return safe || undefined;
  }

  private nameFromStarshipsMeta(meta: unknown): string | undefined {
    if (!meta || typeof meta !== 'object') return undefined;
    const m = meta as Record<string, unknown>;
    const authorType = typeof m.authorType === 'string' ? m.authorType : '';
    const authorId = typeof m.authorId === 'string' ? m.authorId : '';
    if (!authorId) return undefined;
    const safeId = this.sanitizeOpenAIName(authorId);
    if (!safeId) return undefined;
    const prefix = authorType === 'agent' ? 'a_' : authorType === 'user' ? 'u_' : 'x_';
    return `${prefix}${safeId}`.slice(0, 64);
  }

  private convertMessageToOpenAI(m: LlmMessage): OpenAI.Chat.ChatCompletionMessageParam {
    const role = m.role as OpenAI.Chat.ChatCompletionMessageParam['role'];
    const contentVal = m.content;
    const mRec = m as unknown as Record<string, unknown>;
    const name = this.nameFromStarshipsMeta(m.starshipsMeta ?? mRec['starshipsMeta']);

    // OpenRouter reasoning preservation extension (only some providers accept these fields).
    // We attach them only on assistant messages, and downstream host runtimes that can't accept
    // unknown fields (e.g. Azure OpenAI) must sanitize them out.
    const reasoningForProvider = (() => {
      try {
        if (role !== 'assistant') return {};
        const details =
          Array.isArray(m.reasoningDetails) && m.reasoningDetails.length > 0
            ? m.reasoningDetails
            : (() => {
                // Compatibility: some callers may still provide snake_case `reasoning_details`.
                const snake = mRec['reasoning_details'];
                if (!Array.isArray(snake) || snake.length === 0) return undefined;
                return snake.every((x) => x && typeof x === 'object') ? (snake as ReasoningDetail[]) : undefined;
              })();
        if (details?.length) {
          return { reasoning_details: details } satisfies Record<string, unknown>;
        }
        const r = typeof m.reasoning === 'string' ? m.reasoning : '';
        return r.trim().length > 0 ? ({ reasoning: r } satisfies Record<string, unknown>) : {};
      } catch {
        return {};
      }
    })();

    // Helper to get string content (for roles that require string)
    const getStringContent = (): string => {
      const base = typeof contentVal === 'string' ? contentVal : contentVal[0]?.type === 'text' ? contentVal[0].text : '';
      const raw = base;
      if (!raw) return '';

      // LAST-LINE-OF-DEFENSE:
      // Some workflows/tools can produce extremely large tool_result payloads (e.g. base64 images embedded in JSON).
      // Even if upstream sanitization is missed for any reason, never send multi-MB strings to the provider.
      const looksLikeEmbeddedImage = raw.includes('data:image/') && raw.includes(';base64,');
      const maxToolChars = 20_000;
      const maxAnyChars = 60_000;

      if (role === 'tool' && (looksLikeEmbeddedImage || raw.length > maxToolChars)) {
        const prefix = raw.slice(0, Math.min(maxToolChars, raw.length));
        return `${prefix}\n\n[tool_result truncated for provider: originalLength=${raw.length} chars]\n`;
      }

      if (raw.length > maxAnyChars) {
        const prefix = raw.slice(0, maxAnyChars);
        return `${prefix}\n\n[truncated for provider: originalLength=${raw.length} chars]\n`;
      }

      return raw;
    };

    if (role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
      const toolCalls = m.toolCalls.map((tc) => ({
        id: typeof tc.id === 'string' ? tc.id : undefined,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === 'string'
              ? (tc.function.arguments as string)
              : (() => {
                  try {
                    return JSON.stringify(tc.function.arguments ?? {});
                  } catch {
                    return '{}';
                  }
                })(),
        },
      }));
      return {
        role: 'assistant',
        content: getStringContent(),
        tool_calls: toolCalls,
        ...(reasoningForProvider as Record<string, unknown>),
        ...(name ? { name } : {}),
      } as unknown as OpenAI.Chat.ChatCompletionAssistantMessageParam;
    }

    if (role === 'tool') {
      const toolCallId = typeof m.toolCallId === 'string' ? m.toolCallId : '';
      return {
        role: 'tool',
        content: getStringContent(),
        tool_call_id: toolCallId,
      } as OpenAI.Chat.ChatCompletionToolMessageParam;
    }

    // SYSTEM MESSAGE: Add caching (universal for all OpenRouter providers)
    // Note: cache_control is an OpenRouter extension not in OpenAI's types
    if (role === 'system') {
      const message: CacheableSystemMessage = {
        role: 'system',
        content: [
          {
            type: 'text',
            text: getStringContent(),
            cache_control: { type: 'ephemeral' },
          },
        ],
      };
      return message as OpenAI.Chat.ChatCompletionSystemMessageParam;
    }

    // ASSISTANT MESSAGE (no tool calls): must be a string (OpenAI chat schema).
    if (role === 'assistant') {
      return {
        role: 'assistant',
        content: getStringContent(),
        ...(reasoningForProvider as Record<string, unknown>),
        ...(name ? { name } : {}),
      } as unknown as OpenAI.Chat.ChatCompletionAssistantMessageParam;
    }

    // USER MESSAGE: Support multimodal content (images, etc.)
    // If content is already an array of ContentBlocks, pass directly.
    // OpenAI SDK supports both string and ContentPart[] for user messages.
    return { role: 'user', content: contentVal, ...(name ? { name } : {}) } as OpenAI.Chat.ChatCompletionUserMessageParam;
  }

  /**
   * Coerce arbitrary messages into canonical LlmMessage[] (handles legacy snake_case fields).
   */
  private coerceToLlmMessages(messagesParam: unknown): LlmMessage[] {
    if (!Array.isArray(messagesParam)) return [];
    const out: LlmMessage[] = [];

    for (const item of messagesParam) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;

      const role = (typeof obj.role === 'string' ? obj.role : 'user') as LLMMessageRole;
      // Preserve content as-is if it's a string or array (multimodal content blocks)
      // Only stringify if it's neither (fallback for unexpected types)
      const content: MessageContent =
        typeof obj.content === 'string'
          ? obj.content
          : Array.isArray(obj.content)
            ? (obj.content as ContentBlock[])
            : JSON.stringify(obj.content ?? '');

      const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning : undefined;
      const reasoningDetailsCamel = obj['reasoningDetails'];
      const reasoningDetailsSnake = obj['reasoning_details'];
      const reasoningDetailsRaw: unknown[] | undefined =
        Array.isArray(reasoningDetailsCamel) && reasoningDetailsCamel.length > 0
          ? (reasoningDetailsCamel as unknown[])
          : Array.isArray(reasoningDetailsSnake) && reasoningDetailsSnake.length > 0
            ? (reasoningDetailsSnake as unknown[])
            : undefined;
      const reasoningDetails =
        Array.isArray(reasoningDetailsRaw) && reasoningDetailsRaw.every((x) => x && typeof x === 'object')
          ? (reasoningDetailsRaw as ReasoningDetail[])
          : undefined;

      let toolCalls: LlmToolCall[] | undefined;
      const toolCallsCanonical = (obj as { toolCalls?: unknown }).toolCalls;
      const toolCallsSnake = (obj as { tool_calls?: unknown }).tool_calls;

      const normalizeToolCall = (tcUnknown: unknown): LlmToolCall | null => {
        if (!tcUnknown || typeof tcUnknown !== 'object') return null;
        const rec = tcUnknown as Record<string, unknown>;
        const id = typeof rec.id === 'string' ? rec.id : undefined;

        let name = '';
        let args: unknown = {};
        const fn = rec.function;
        if (fn && typeof fn === 'object') {
          const fnRec = fn as Record<string, unknown>;
          name = typeof fnRec.name === 'string' ? fnRec.name : '';
          const rawArgs = fnRec.arguments;
          if (typeof rawArgs === 'string') {
            try {
              args = JSON.parse(rawArgs);
            } catch {
              args = {};
            }
          } else if (rawArgs && typeof rawArgs === 'object') {
            args = rawArgs;
          } else {
            args = {};
          }
        }

        if (!name) return null;
        return { id, type: 'function', function: { name, arguments: args } };
      };

      if (Array.isArray(toolCallsCanonical)) {
        toolCalls = toolCallsCanonical.map((tc) => normalizeToolCall(tc)).filter((x): x is LlmToolCall => x !== null);
      } else if (Array.isArray(toolCallsSnake)) {
        toolCalls = toolCallsSnake.map((tc) => normalizeToolCall(tc)).filter((x): x is LlmToolCall => x !== null);
      }

      let toolCallId: string | undefined;
      if (typeof (obj as { toolCallId?: unknown }).toolCallId === 'string') {
        toolCallId = (obj as { toolCallId?: string }).toolCallId;
      } else if (typeof (obj as { tool_call_id?: unknown }).tool_call_id === 'string') {
        toolCallId = (obj as { tool_call_id?: string }).tool_call_id;
      }

      const canonical: LlmMessage = {
        role,
        content,
        ...(reasoning ? { reasoning } : {}),
        ...(reasoningDetails && reasoningDetails.length > 0 ? { reasoningDetails } : {}),
        ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
        ...(toolCallId ? { toolCallId } : {}),
      };
      // Preserve optional Starships metadata for provider `name` mapping.
      const sm = obj['starshipsMeta'];
      if (sm && typeof sm === 'object') {
        (canonical as unknown as Record<string, unknown>)['starshipsMeta'] = sm;
      }
      out.push(canonical);
    }

    return out;
  }

  /**
   * Process OpenAI-compatible streaming response.
   * Expects an AsyncIterable of ChatCompletionChunk values (as returned by
   * the hostRuntime.llm provider implementation).
   */
  private async processOpenAIStream(stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>): Promise<LLMResponse> {
    const executionDepth = this.getOptions()?.execution?.depth ?? 0;
    const eventCallback = this.getEventCallback();

    let responseMetadata = {
      id: '',
      model: '',
      created: Math.floor(Date.now() / 1000),
      object: 'chat.completion' as const,
    };

    let usage: LLMUsage | undefined;
    let lastUsageHadExplicitCost = false;
    let content = '';
    let reasoning = '';
    let reasoningDetails: ReasoningDetail[] = [];
    let images: GeneratedImage[] = [];
    let toolCalls: Array<{
      id?: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }> = [];
    let finishReason: string | null = null;
    // Track provider-snapshot arguments per tool call index if present
    const providerArgs: string[] = [];
    // Micro-buffer and state for token-safe flushing per tool call index
    const argStaging: string[] = [];
    const argState: Array<{ inStr: boolean; esc: boolean; depth: number }> = [];

    const flushSafePrefix = (s: string, st: { inStr: boolean; esc: boolean; depth: number }): number => {
      let safeIdx = 0;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (st.esc) {
          st.esc = false;
          continue;
        }
        if (st.inStr) {
          if (ch === '\\') {
            st.esc = true;
          } else if (ch === '"') {
            st.inStr = false;
          }
        } else {
          if (ch === '"') {
            st.inStr = true;
          } else if (ch === '{' || ch === '[') {
            st.depth++;
          } else if (ch === '}' || ch === ']') {
            if (st.depth > 0) st.depth--;
            // Closing a structure is safe to flush up to
            safeIdx = i + 1;
          } else if (ch === ',') {
            // Comma between elements/props outside string is a safe boundary
            safeIdx = i + 1;
          }
        }
      }
      return safeIdx;
    };

    try {
      for await (const chunk of stream) {
        // Update metadata from first chunk
        if (chunk.id && !responseMetadata.id) responseMetadata.id = chunk.id;
        if (chunk.model && !responseMetadata.model) responseMetadata.model = chunk.model;
        if (chunk.created) responseMetadata.created = chunk.created;

        // IMPORTANT: Some providers (including OpenAI/OpenRouter when stream_options.include_usage=true)
        // send a final "usage-only" chunk with no choices. We must still capture usage from it.
        if (chunk.usage) {
          usage = this.normalizeUsage(chunk.usage);
          // Track whether provider explicitly reported cost. If not, downstream (server) should compute cost from catalog.
          try {
            const u = chunk.usage as unknown as Record<string, unknown>;
            const hasCost = typeof u.cost === 'number' && Number.isFinite(u.cost);
            const costDetails = u.cost_details;
            const cd = costDetails && typeof costDetails === 'object' ? (costDetails as Record<string, unknown>) : null;
            const hasUpstream = cd ? typeof cd.upstream_inference_cost === 'number' && Number.isFinite(cd.upstream_inference_cost) : false;
            lastUsageHadExplicitCost = hasCost || hasUpstream;
          } catch {
            lastUsageHadExplicitCost = false;
          }
        }

        const choice = chunk.choices[0];
        if (!choice) continue;

        // Accumulate content (providers may send non-string content blocks; only append strings)
        if (typeof choice.delta?.content === 'string') {
          const piece = choice.delta.content;
          content += piece;
        }

        // Non-stream compatibility: when the host runtime wraps a non-stream completion as a
        // single "chunk-like" object, there may be no delta at all and the full content only
        // exists on choice.message.content. In that case, populate our accumulator from the
        // message snapshot.
        //
        // NOTE: We only do this when we haven't accumulated any content yet, so we don't
        // overwrite a genuine streaming accumulation.
        if (!content) {
          const msg = (choice as unknown as { message?: unknown }).message as unknown;
          if (msg && typeof msg === 'object') {
            const msgRec = msg as Record<string, unknown>;
            const msgContent = msgRec.content;
            if (typeof msgContent === 'string') {
              content = msgContent;
            } else if (Array.isArray(msgContent)) {
              // OpenAI/OpenRouter multimodal content blocks; extract text blocks only
              const textParts: string[] = [];
              for (const part of msgContent as unknown[]) {
                if (!part || typeof part !== 'object') continue;
                const p = part as Record<string, unknown>;
                if (p.type === 'text' && typeof p.text === 'string') {
                  textParts.push(p.text);
                }
              }
              if (textParts.length > 0) {
                content = textParts.join('');
              }
            }
          }
        }

        // Capture image generation outputs.
        // OpenRouter image models may return:
        // - message.images[] (OpenRouter extension)
        // - or image_url blocks inside message.content (array)
        try {
          const extractImages = (node: unknown): GeneratedImage[] => {
            if (!node || typeof node !== 'object') return [];
            const rec = node as Record<string, unknown>;
            const out: GeneratedImage[] = [];

            // 1) OpenRouter extension: images[]
            const imgs = (rec as { images?: unknown }).images;
            if (Array.isArray(imgs) && imgs.length > 0) {
              for (const it of imgs) {
                if (!it || typeof it !== 'object') continue;
                const item = it as Record<string, unknown>;
                const type = item.type;
                const imageUrl = (item as { image_url?: unknown }).image_url;
                if (type !== 'image_url' || !imageUrl || typeof imageUrl !== 'object') continue;
                const url = (imageUrl as { url?: unknown }).url;
                if (typeof url !== 'string' || url.length === 0) continue;
                out.push({ type: 'image_url', image_url: { url } });
              }
              if (out.length > 0) return out;
            }

            // 2) OpenAI-style content blocks: content: [{type:'image_url', image_url:{url}}]
            const contentVal = (rec as { content?: unknown }).content;
            if (Array.isArray(contentVal) && contentVal.length > 0) {
              for (const part of contentVal) {
                if (!part || typeof part !== 'object') continue;
                const p = part as Record<string, unknown>;
                if (p.type !== 'image_url') continue;
                const imageUrl = (p as { image_url?: unknown }).image_url;
                if (!imageUrl || typeof imageUrl !== 'object') continue;
                const url = (imageUrl as { url?: unknown }).url;
                if (typeof url !== 'string' || url.length === 0) continue;
                out.push({ type: 'image_url', image_url: { url } });
              }
            }
            return out;
          };

          const fromDelta = extractImages((choice as unknown as { delta?: unknown }).delta);
          const fromMessage = extractImages((choice as unknown as { message?: unknown }).message);
          const next = fromDelta.length > 0 ? fromDelta : fromMessage;
          if (next.length > 0) {
            images = next;
          }
        } catch {
          // Non-fatal: ignore image extraction failures
        }

        // Accumulate reasoning text from OpenRouter reasoning-capable models
        try {
          const extractReasoningDetails = (node: unknown): ReasoningDetail[] => {
            if (!node || typeof node !== 'object') return [];
            const rec = node as Record<string, unknown>;
            const details = (rec as { reasoning_details?: unknown }).reasoning_details as unknown;
            if (!Array.isArray(details) || details.length === 0) return [];
            const out: ReasoningDetail[] = [];
            for (const d of details as unknown[]) {
              if (d && typeof d === 'object') out.push(d as ReasoningDetail);
            }
            return out;
          };

          // Preserve full reasoning_details blocks when present (OpenRouter extension).
          // - Streaming: details appear in delta; append in sequence.
          // - Non-stream wrapper: details may appear once on message; set as snapshot if we don't already have any.
          try {
            const dDelta = extractReasoningDetails((choice as unknown as { delta?: unknown }).delta);
            if (dDelta.length > 0) {
              reasoningDetails.push(...dDelta);
            } else if (reasoningDetails.length === 0) {
              const dMsg = extractReasoningDetails((choice as unknown as { message?: unknown }).message);
              if (dMsg.length > 0) reasoningDetails = dMsg;
            }
          } catch {
            /* non-fatal */
          }

          // IMPORTANT: Providers may send BOTH a cumulative snapshot (reasoning.content) AND token deltas (reasoning.tokens),
          // and/or reasoning_details. Concatenating multiple sources doubles the text.
          // Choose exactly one source in priority order:
          // 1) reasoning_details (structured), else 2) reasoning.tokens (incremental), else 3) reasoning.content/text/string.
          const extractReasoning = (node: unknown): string => {
            if (!node || typeof node !== 'object') return '';
            const rec = node as Record<string, unknown>;

            // 1) Prefer structured reasoning_details if present
            const details = (rec as { reasoning_details?: unknown }).reasoning_details as unknown;
            if (Array.isArray(details) && details.length > 0) {
              const parts: string[] = [];
              for (const d of details as unknown[]) {
                if (d && typeof d === 'object') {
                  const det = d as Record<string, unknown>;
                  if (det.type === 'reasoning.text' && typeof det.text === 'string' && det.text.length > 0) {
                    parts.push(det.text);
                  } else if (det.type === 'reasoning.summary' && typeof det.summary === 'string' && det.summary.length > 0) {
                    // Some providers/models (e.g. certain OpenAI variants) only return a summary block rather than raw reasoning text.
                    // Treat it as reasoning so callers can observe "reasoning happened" without requiring full CoT.
                    parts.push(det.summary);
                  }
                }
              }
              if (parts.length > 0) return parts.join('');
            }

            const raw = (rec as { reasoning?: unknown }).reasoning as unknown;
            if (!raw) return '';

            const pickText = (obj: unknown): string => {
              if (!obj) return '';
              if (typeof obj === 'string') return obj;
              if (typeof obj !== 'object') return '';
              const r = obj as Record<string, unknown>;
              const text = typeof r.text === 'string' ? r.text : '';
              if (text) return text;
              const content = typeof r.content === 'string' ? r.content : '';
              if (content) return content;
              return '';
            };

            // 2) If reasoning is an object with tokens, prefer tokens and ignore obj.content to avoid duplication
            if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
              const obj = raw as Record<string, unknown>;
              const tokens = obj.tokens as unknown;
              if (Array.isArray(tokens) && tokens.length > 0) {
                return (tokens as unknown[]).map(pickText).join('');
              }
              return pickText(obj);
            }

            // 3) If reasoning is an array, join by text/content
            if (Array.isArray(raw)) {
              return (raw as unknown[]).map(pickText).join('');
            }

            // 4) If reasoning is a string, return as-is
            if (typeof raw === 'string') return raw;

            return '';
          };

          // Prefer delta-level reasoning; fall back to any message snapshot if present
          const fromDelta = extractReasoning((choice as unknown as { delta?: unknown }).delta);
          const fromMessage = extractReasoning((choice as unknown as { message?: unknown }).message);
          const chunkReasoning = fromDelta || fromMessage;
          if (chunkReasoning) {
            const append = LLM.computeNonOverlappingAppend(reasoning, chunkReasoning);
            if (append) {
              reasoning += append;
            }
          }
        } catch {
          // Non-fatal: if reasoning extraction fails, continue without disrupting content/tool streaming
        }

        // Handle tool calls - OpenAI SDK properly accumulates these
        if (choice.delta?.tool_calls) {
          for (const toolCallDelta of choice.delta.tool_calls) {
            const index = toolCallDelta.index ?? 0;

            // Ensure slot exists
            while (toolCalls.length <= index) {
              toolCalls.push({
                type: 'function',
                function: { name: '', arguments: '' },
              });
            }

            const target = toolCalls[index];
            if (toolCallDelta.id) target.id = toolCallDelta.id;
            if (toolCallDelta.function?.name) target.function.name = toolCallDelta.function.name;
            if (toolCallDelta.function?.arguments) {
              const frag = toolCallDelta.function.arguments;
              // Initialize staging and state
              if (typeof argStaging[index] !== 'string') argStaging[index] = '';
              if (!argState[index]) argState[index] = { inStr: false, esc: false, depth: 0 };
              argStaging[index] = argStaging[index] + frag;
              const base = typeof target.function.arguments === 'string' ? target.function.arguments : '';
              const st = argState[index];
              const cut = flushSafePrefix(argStaging[index], st);
              if (cut > 0) {
                const flush = argStaging[index].slice(0, cut);
                target.function.arguments = base + flush;
                argStaging[index] = argStaging[index].slice(cut);
                if (LLM.DEBUG_TOOLCALLS) {
                  try {
                    console.debug('[LLM] tool_call.delta', {
                      index,
                      id: toolCallDelta.id,
                      name: toolCallDelta.function?.name,
                      argsAdded: flush.length,
                      argsTotal: (target.function.arguments as string).length,
                    });
                  } catch {
                    /* non-fatal */
                  }
                }
              }
            }

            // Emit tool_call_detected on first detection
            if (toolCallDelta.function?.name && toolCallDelta.id && eventCallback) {
              if (!this.emittedToolCalls.has(toolCallDelta.id)) {
                this.emittedToolCalls.add(toolCallDelta.id);

                await eventCallback({
                  type: 'tool_call_detected',
                  timestamp: new Date().toISOString(),
                  executionDepth,
                  data: {
                    toolCallId: toolCallDelta.id,
                    toolName: toolCallDelta.function.name,
                  },
                });
              }
            }
          }
        }

        // Non-stream compatibility: tool calls may be present only on the message snapshot
        // (choice.message.tool_calls) when stream=false.
        if (toolCalls.length === 0) {
          try {
            const msg = (choice as unknown as { message?: unknown }).message as unknown;
            if (msg && typeof msg === 'object') {
              const msgRec = msg as Record<string, unknown>;
              const rawToolCalls = msgRec.tool_calls as unknown;
              if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
                for (const raw of rawToolCalls) {
                  if (!raw || typeof raw !== 'object') continue;
                  const tc = raw as Record<string, unknown>;
                  const fn = tc.function as unknown;
                  const fnRec = fn && typeof fn === 'object' ? (fn as Record<string, unknown>) : undefined;
                  const name = fnRec && typeof fnRec.name === 'string' ? fnRec.name : '';
                  const args = fnRec && typeof fnRec.arguments === 'string' ? fnRec.arguments : '';
                  if (!name) continue;
                  toolCalls.push({
                    id: typeof tc.id === 'string' ? tc.id : undefined,
                    type: 'function',
                    function: { name, arguments: args },
                  });
                }
              }
            }
          } catch {
            // Non-fatal: ignore tool call extraction failures
          }
        }

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }

        // Broadcast content chunk for streaming - normalize tool_calls to toolCalls
        if (eventCallback) {
          const normalizedChunk = this.normalizeChunkToolCalls(chunk);

          // Synthesize snapshot of current toolCalls into choices[0].message.toolCalls so consumers
          // can render incremental arguments even when provider doesn't emit delta.tool_calls.
          try {
            if (Array.isArray(normalizedChunk.choices) && normalizedChunk.choices.length > 0) {
              const choice0 = normalizedChunk.choices[0];
              // Preserve provider-snapshot toolCalls if present, and capture their arguments for final parsing fallback
              try {
                const msg = (choice0 as unknown as { message?: { toolCalls?: Array<{ function?: { arguments?: unknown } }> } }).message;
                if (msg && Array.isArray(msg.toolCalls)) {
                  for (let i = 0; i < msg.toolCalls.length; i++) {
                    const a =
                      msg.toolCalls[i] && msg.toolCalls[i].function
                        ? (msg.toolCalls[i].function as { arguments?: unknown }).arguments
                        : undefined;
                    if (typeof a === 'string' && a.length > 0) {
                      providerArgs[i] = a;
                    }
                  }
                }
              } catch {
                /* noop */
              }
              // Synthesize toolCalls snapshot
              const current: NonNullable<NormalizedMessage['toolCalls']> = toolCalls
                .filter((tc) => tc.function.name && tc.function.name.length > 0)
                .map((tc) => ({
                  id: tc.id,
                  type: 'function' as const,
                  function: { name: tc.function.name, arguments: tc.function.arguments },
                }));
              // Always include an authoritative message.content snapshot to preserve correct ordering on the client
              // This is the cumulatively accumulated content so far
              const existing = (choice0 as unknown as { message?: NormalizedMessage }).message ?? ({} as NormalizedMessage);
              const nextMessage: NormalizedMessage = { ...(existing as NormalizedMessage) } as NormalizedMessage;
              (nextMessage as unknown as { content?: string }).content = content;
              // If we have images and provider didn't supply them, synthesize them for consumers
              if (images.length > 0 && !(existing as unknown as { images?: unknown }).images) {
                (nextMessage as unknown as { images?: GeneratedImage[] }).images = images;
              }
              // Only synthesize toolCalls if provider didn't supply them
              if (!existing.toolCalls || (Array.isArray(existing.toolCalls) && existing.toolCalls.length === 0)) {
                if (current.length > 0) nextMessage.toolCalls = current;
              }
              (choice0 as unknown as { message?: NormalizedMessage }).message = nextMessage;
            }
          } catch {
            void 0;
          }

          await eventCallback({
            type: 'content_chunk',
            timestamp: new Date().toISOString(),
            executionDepth,
            data: { chunk: normalizedChunk as unknown as Record<string, unknown> },
          });
        }
      }

      // Flush any remaining staged tool-call fragments at end of stream
      try {
        for (let i = 0; i < toolCalls.length; i++) {
          if (typeof argStaging[i] === 'string' && argStaging[i].length > 0) {
            toolCalls[i].function.arguments += argStaging[i];
            argStaging[i] = '';
          }
        }
      } catch {
        /* noop */
      }

      // Emit completion event
      if (eventCallback && usage) {
        await eventCallback({
          type: 'content_complete',
          timestamp: new Date().toISOString(),
          executionDepth,
          data: {
            model: responseMetadata.model,
            usage: {
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
              ...(lastUsageHadExplicitCost ? { cost: usage.cost } : {}),
            },
          },
        });
      }

      // Build final response with properly parsed tool calls
      const parsedToolCalls = toolCalls
        .filter((tc) => tc.function.name.length > 0)
        .map((tc, i) => {
          let argsObj: unknown = {};

          const prefer =
            typeof providerArgs[i] === 'string' && providerArgs[i].length >= (tc.function.arguments?.length || 0)
              ? providerArgs[i]
              : tc.function.arguments;
          if (prefer) {
            try {
              argsObj = JSON.parse(prefer);
            } catch (parseError) {
              console.error(`[LLM FINAL] Failed to parse tool '${tc.function.name}' arguments:`, {
                argsLength: prefer.length,
                error: parseError instanceof Error ? parseError.message : String(parseError),
              });
              // Log full args for debugging ONLY when explicitly enabled (may contain secrets).
              if (ENABLE_LLM_LOGGING) {
                console.error(`[LLM FINAL] Full arguments:`, prefer);
              }
              argsObj = {};
            }
          }

          return {
            id: tc.id || `call_${i}`,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: argsObj,
            },
          };
        });

      return {
        id: responseMetadata.id,
        object: responseMetadata.object,
        created: responseMetadata.created,
        model: responseMetadata.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as LLMMessageRole,
              content,
              ...(reasoning ? { reasoning } : {}),
              ...(reasoningDetails.length > 0 ? { reasoningDetails } : {}),
              ...(images.length > 0 ? { images } : {}),
              ...(parsedToolCalls.length > 0 ? { toolCalls: parsedToolCalls } : {}),
            },
            finishReason: finishReason || 'stop',
          },
        ],
        usage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Streaming failed';
      throw new Error(`LLM streaming execution failed: ${errorMessage}`);
    }
  }

  /**
   * Normalize OpenAI SDK chunks to use camelCase throughout
   * Converts: finish_reason → finishReason, tool_calls → toolCalls, etc.
   * This ensures compatibility with ConversationService expectations
   */
  private normalizeChunkToolCalls(chunk: OpenAI.Chat.Completions.ChatCompletionChunk): NormalizedChunk {
    if (!chunk.choices || !Array.isArray(chunk.choices)) {
      return chunk as unknown as NormalizedChunk;
    }

    const normalizedChoices: NormalizedChoice[] = chunk.choices.map((choice) => {
      const normalized: NormalizedChoice = {
        index: choice.index,
      };

      // Normalize finish_reason → finishReason
      if (choice.finish_reason) {
        normalized.finishReason = choice.finish_reason;
      }

      // Normalize delta object
      if (choice.delta && typeof choice.delta === 'object') {
        const delta = choice.delta as Record<string, unknown>;
        const normalizedDelta: NormalizedDelta = {};

        // Copy standard fields
        if (typeof delta.content === 'string') normalizedDelta.content = delta.content as string;
        if (typeof delta.role === 'string') normalizedDelta.role = delta.role as string;

        // Normalize tool_calls → toolCalls
        if ('tool_calls' in delta && Array.isArray(delta.tool_calls)) {
          normalizedDelta.toolCalls = delta.tool_calls;
        }

        // Handle any other delta fields
        Object.keys(delta).forEach((key) => {
          if (!['content', 'role', 'tool_calls'].includes(key)) {
            (normalizedDelta as unknown as Record<string, unknown>)[key] = delta[key];
          }
        });

        normalized.delta = normalizedDelta;
      }

      return normalized;
    });

    // Normalize usage from snake_case to camelCase
    let normalizedUsage: NormalizedUsage | undefined;
    if (chunk.usage) {
      const base: NormalizedUsage = {
        promptTokens: chunk.usage.prompt_tokens ?? 0,
        completionTokens: chunk.usage.completion_tokens ?? 0,
        totalTokens: chunk.usage.total_tokens ?? 0,
      };
      // Preserve cost for downstream streaming consumers (may only appear on final chunk).
      try {
        const u = chunk.usage as unknown as Record<string, unknown>;
        const costDetails = u['cost_details'];
        const cd = costDetails && typeof costDetails === 'object' ? (costDetails as Record<string, unknown>) : null;
        const upstream = cd ? cd['upstream_inference_cost'] : undefined;
        const cost = typeof upstream === 'number' ? upstream : u['cost'];
        if (typeof cost === 'number' && Number.isFinite(cost)) {
          (base as Record<string, unknown>)['cost'] = cost;
        }
      } catch {
        // ignore
      }
      if (typeof chunk.usage.completion_tokens_details === 'object' && chunk.usage.completion_tokens_details !== null) {
        const details = chunk.usage.completion_tokens_details as Record<string, unknown>;
        const r = details?.reasoning_tokens;
        base.completionTokensDetails = { reasoningTokens: typeof r === 'number' ? r : 0 };
      }
      normalizedUsage = base;
    }

    return {
      id: chunk.id,
      object: chunk.object,
      created: chunk.created,
      model: chunk.model,
      choices: normalizedChoices,
      // Include normalized usage if present
      ...(normalizedUsage ? { usage: normalizedUsage } : {}),
    } as NormalizedChunk;
  }

  /**
   * Validate LLM configuration
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const params = this.getParams();

    // Required fields using helper method
    const modelError = this.validateRequiredField(params.model, 'Model');
    if (modelError) errors.push(modelError);

    // Messages must be an array with at least one entry; upstream-input fallback is not relied on.
    const messagesError = this.validateArrayParameter(params.messages, 'Messages', 1);
    if (messagesError) errors.push(messagesError);

    // Tools validation - handle both array and string (template expression)
    if (params.tools !== undefined && !Array.isArray(params.tools) && typeof params.tools !== 'string') {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Tools must be an array of ToolParams or a template expression string',
      });
    }

    // API key validation moved to runtime via host-level callbacks only

    // Parameter range validation using helper methods
    const tempError = this.validateParameterRange(params.temperature, 'Temperature', 0, 2);
    if (tempError) errors.push(tempError);

    const tokensError = this.validateMinimumValue(params.maxTokens, 'Max tokens', 1);
    if (tokensError) errors.push(tokensError);

    const topPError = this.validateParameterRange(params.topP, 'Top P', 0, 1);
    if (topPError) errors.push(topPError);

    const freqPenaltyError = this.validateParameterRange(params.frequencyPenalty, 'Frequency penalty', -2, 2);
    if (freqPenaltyError) errors.push(freqPenaltyError);

    const presPenaltyError = this.validateParameterRange(params.presencePenalty, 'Presence penalty', -2, 2);
    if (presPenaltyError) errors.push(presPenaltyError);

    const timeoutError = this.validateMinimumValue(params.timeout, 'Timeout', 1000);
    if (timeoutError) errors.push(timeoutError);

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
