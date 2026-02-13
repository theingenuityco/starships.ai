import type { LlmHostRequest } from '@starships/autopilot';
import OpenAI from 'openai';
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type Message as BedrockMessage,
  type ContentBlock as BedrockContentBlock,
  type Tool as BedrockTool,
  type ToolConfiguration as BedrockToolConfiguration,
  type ImageFormat as BedrockImageFormat,
  type ConverseStreamCommandInput,
} from '@aws-sdk/client-bedrock-runtime';

export interface InvokeBedrockOptions {
  client: BedrockRuntimeClient;
  signal?: AbortSignal;
}

const redactPresignedUrlForLogs = (
  raw: string
): {
  kind: 's3_https' | 'other';
  bucket?: string;
  key?: string;
  host?: string;
  path?: string;
} => {
  try {
    const u = new URL(raw);
    const host = u.hostname;
    const path = u.pathname;
    const m = raw.match(/^https:\/\/([a-z0-9.-]+)\.s3[.-][a-z0-9-]+\.amazonaws\.com\/([^?]+)(?:\?|$)/i);
    if (m) {
      return { kind: 's3_https', bucket: m[1], key: decodeURIComponent(m[2]) };
    }
    return { kind: 'other', host, path };
  } catch {
    return { kind: 'other', host: undefined, path: undefined };
  }
};

const sanitizeDocumentNameForBedrock = (raw: string): string => {
  // Allowed: alphanumeric, whitespace, hyphens, parentheses, square brackets.
  // Collapse multiple spaces, trim, and fallback if empty.
  const replaced = raw.replace(/[^A-Za-z0-9\s\-()[\]]+/g, ' ');
  const collapsed = replaced.replace(/\s+/g, ' ').trim();
  return collapsed.length > 0 ? collapsed : 'Document';
};

export async function invokeBedrock(
  request: LlmHostRequest,
  providerModelId: string,
  options: InvokeBedrockOptions
): Promise<AsyncIterable<unknown>> {
  const client = options.client;

  type AdditionalModelRequestFields = Record<string, unknown> & {
    thinking?: { type: 'enabled'; budget_tokens: number };
  };

  // Extract reasoning config
  const reasoningCfg = (request as unknown as { reasoning?: unknown }).reasoning as unknown;
  const reasoningRec =
    reasoningCfg && typeof reasoningCfg === 'object' && !Array.isArray(reasoningCfg)
      ? (reasoningCfg as Record<string, unknown>)
      : undefined;
  const reasoningEnabled = reasoningRec?.enabled === true && reasoningRec?.exclude !== true;
  const computeThinkingBudgetTokens = (): number => {
    if (!reasoningEnabled) return 0;
    const effort = typeof reasoningRec?.effort === 'string' ? reasoningRec.effort : undefined;
    const requestedBudget = typeof reasoningRec?.max_tokens === 'number' ? reasoningRec.max_tokens : undefined;
    let budgetTokens =
      typeof requestedBudget === 'number' && Number.isFinite(requestedBudget) && requestedBudget > 0
        ? Math.floor(requestedBudget)
        : effort === 'low'
          ? 256
          : effort === 'high'
            ? 2048
            : 1024; // default/medium

    const maxTokens =
      typeof request.maxTokens === 'number' && Number.isFinite(request.maxTokens) ? Math.floor(request.maxTokens) : undefined;
    // Bedrock/Claude requires maxTokens > budget_tokens, so clamp conservatively.
    if (typeof maxTokens === 'number') {
      if (maxTokens <= 1) {
        budgetTokens = 0;
      } else if (budgetTokens >= maxTokens) {
        budgetTokens = Math.max(1, maxTokens - 1);
      }
    }
    return budgetTokens;
  };
  const thinkingBudgetTokens = computeThinkingBudgetTokens();
  let thinkingWillBeEnabled = thinkingBudgetTokens > 0;

  // Separate system prompts from messages
  const bedrockMessages: BedrockMessage[] = [];
  const system: { text: string }[] = [];

  const rawMessages = request.messages as OpenAI.Chat.ChatCompletionMessageParam[];

  // Claude extended thinking may require that prior assistant turns include provider-issued
  // thinking/reasoning blocks (including signatures) exactly as returned.
  // We currently do not persist those provider-native blocks. Historically we disabled thinking
  // when assistant history existed; however, this can prevent thinking entirely in normal chats.
  // We now allow thinking even with assistant history, and rely on runtime validation to confirm
  // whether Bedrock accepts it for this model/profile.

  for (const m of rawMessages) {
    if (m.role === 'system') {
      // OpenAI messages may represent system content as a string OR as an array of content parts
      // (e.g. when we attach OpenRouter cache_control extensions).
      let sysText = '';
      if (typeof m.content === 'string') {
        sysText = m.content;
      } else if (Array.isArray(m.content)) {
        const parts = m.content as Array<{ type?: unknown; text?: unknown }>;
        sysText = parts
          .map((p) => (p && p.type === 'text' && typeof p.text === 'string' ? p.text : ''))
          .filter(Boolean)
          .join('\n');
      }

      const trimmed = sysText.trim();
      system.push({ text: trimmed.length > 0 ? trimmed : 'System instructions' });
      continue;
    }

    const content: BedrockContentBlock[] = [];
    // Preserve provider-native reasoning blocks (Bedrock ContentBlock.reasoningContent) when present.
    // This is required for multi-turn "thinking" replay when Bedrock provides signatures.
    try {
      const mRec = m as unknown as Record<string, unknown>;
      const reasoningDetails = mRec.reasoningDetails;
      const reasoningDetailsAlt = mRec.reasoning_details;
      const rdRaw = Array.isArray(reasoningDetails) && reasoningDetails.length > 0
        ? (reasoningDetails as unknown[])
        : Array.isArray(reasoningDetailsAlt) && reasoningDetailsAlt.length > 0
          ? (reasoningDetailsAlt as unknown[])
          : [];
      if (rdRaw.length > 0) {
        for (const d of rdRaw) {
          if (!d || typeof d !== 'object') continue;
          const det = d as Record<string, unknown>;
          if (det.type === 'reasoning.text' && typeof det.text === 'string' && det.text.trim().length > 0) {
            const signature = typeof det.signature === 'string' && det.signature.trim().length > 0 ? det.signature.trim() : undefined;
            (content as unknown[]).push({
              reasoningContent: {
                reasoningText: {
                  text: det.text,
                  ...(signature ? { signature } : {}),
                },
              },
            });
          } else if (det.type === 'reasoning.encrypted' && typeof det.data === 'string' && det.data.trim().length > 0) {
            // Map encrypted reasoning payloads (base64) into Bedrock redactedContent.
            // Note: We do not log or inspect the data for safety.
            try {
              const bytes = Buffer.from(det.data, 'base64');
              (content as unknown[]).push({
                reasoningContent: {
                  redactedContent: bytes,
                },
              });
            } catch {
              // ignore invalid base64
            }
          }
        }
      }
    } catch {
      // Non-fatal
    }

    if (typeof m.content === 'string') {
      const trimmed = m.content.trim();
      // Bedrock validation requires non-blank text fields; provide a minimal placeholder
      // when the original content is empty (e.g. attachment-only messages).
      content.push({ text: trimmed.length > 0 ? trimmed : '.' });
    } else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part.type === 'text') {
          const txt = typeof part.text === 'string' ? part.text.trim() : '';
          content.push({ text: txt.length > 0 ? txt : '.' });
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const rawUrl = part.image_url.url;
          const matches = rawUrl.match(/^data:image\/([a-z]+);base64,(.+)$/);
          if (matches) {
            // data: URL with inline bytes
            const format = matches[1] as BedrockImageFormat;
            const bytes = Buffer.from(matches[2], 'base64');
            content.push({ image: { format, source: { bytes } } });
          } else {
            // For HTTPS image URLs (presigned S3), Bedrock docs allow bytes or s3Location.
            // Some Anthropic profiles reject s3Uri for images, so we fetch bytes instead.
            try {
              const resp = await fetch(rawUrl);
              if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
              }
              const ab = await resp.arrayBuffer();
              const bytes = Buffer.from(ab);
              const extMatch = rawUrl.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
              const format = (extMatch ? extMatch[1].toLowerCase() : 'png') as BedrockImageFormat;
              console.log('[RunnerHostRuntime.llm][bedrock] image_url fetched as bytes', {
                model: providerModelId,
                url: redactPresignedUrlForLogs(rawUrl),
                format,
              });
              content.push({
                image: {
                  format,
                  source: { bytes },
                },
              } as BedrockContentBlock);
            } catch {
              content.push({ text: `Image: ${rawUrl}` });
            }
          }
        } else if (part.type === 'file' && part.file?.file_data) {
          const raw = String(part.file.file_data || '');
          const name = sanitizeDocumentNameForBedrock(part.file.filename || 'Document');
          // Best-effort: fetch the PDF bytes so Bedrock can read the document directly.
          try {
            const resp = await fetch(raw);
            if (!resp.ok) {
              throw new Error(`HTTP ${resp.status}`);
            }
            const ab = await resp.arrayBuffer();
            const bytes = Buffer.from(ab);
            console.log('[RunnerHostRuntime.llm][bedrock] file block fetched as document.bytes', {
              model: providerModelId,
              filename: name,
              url: redactPresignedUrlForLogs(raw),
            });
            content.push({
              document: {
                format: 'pdf',
                name,
                source: { bytes },
              },
            } as BedrockContentBlock);
          } catch {
            content.push({ text: `File "${name}": ${raw}` });
          }
        }
      }
    }

    // Map roles to Bedrock roles.
    // - tool results should be treated like user content (toolResult blocks ideally; we at least avoid 'assistant' here)
    // - Bedrock expects 'user' or 'assistant'
    const role = m.role === 'user' || m.role === 'tool' ? 'user' : 'assistant';

    bedrockMessages.push({
      role,
      content,
    });
  }

  // Map Tools
  let toolConfig: BedrockToolConfiguration | undefined;
  if (Array.isArray(request.tools) && request.tools.length > 0) {
    const tools: BedrockTool[] = request.tools.map((t) => {
      // Safe cast as we know the shape from LlmHostRequest
      const params = t as unknown as { slug?: string; name?: string; description?: string; parameters: unknown };
      return {
        toolSpec: {
          name: params.slug || params.name || 'tool',
          description: params.description,
          inputSchema: { json: params.parameters },
        },
      };
    });
    toolConfig = { tools };
  }

  // Bedrock inference config: when Claude "thinking" is enabled, Bedrock enforces constraints
  // (notably: temperature may only be set to 1). We'll adjust below after computing thinking budget.
  const inferenceConfig: Record<string, unknown> = {
    maxTokens: request.maxTokens,
  };

  const input: ConverseStreamCommandInput & { additionalModelRequestFields?: AdditionalModelRequestFields } = {
    modelId: providerModelId,
    messages: bedrockMessages,
    toolConfig,
    inferenceConfig,
  };

  if (system.length > 0) {
    input.system = system;
  }

  // Best-effort: enable Anthropic "extended thinking" via Bedrock additionalModelRequestFields.
  // This is required for Bedrock to emit separate thinking/reasoning content blocks.
  // Docs: Claude on Bedrock extended thinking uses: { thinking: { type: 'enabled', budget_tokens: <int> } }
  try {
    if (thinkingWillBeEnabled) {
      input.additionalModelRequestFields = {
        ...(input.additionalModelRequestFields ?? {}),
        thinking: { type: 'enabled', budget_tokens: thinkingBudgetTokens },
      };

      // Bedrock validation for Claude extended thinking:
      // - temperature may only be set to 1 when thinking is enabled
      // - (provider-dependent) avoid sending topP alongside this
      inferenceConfig.temperature = 1;
    }
  } catch {
    // Non-fatal: if unsupported by model/provider, Bedrock will ignore or validate; don't crash here.
  }

  // If thinking is not enabled, forward sampling params as-is.
  if (!input.additionalModelRequestFields?.thinking) {
    if (typeof request.temperature === 'number') inferenceConfig.temperature = request.temperature;
    if (typeof request.topP === 'number') inferenceConfig.topP = request.topP;
  }

  try {
    const command = new ConverseStreamCommand(input);
    // Cast to any to avoid spurious TS error "Property 'send' does not exist"
    // which happens despite BedrockRuntimeClient inheriting from Client
    const response = await (client as unknown as { send: (cmd: ConverseStreamCommand) => Promise<{ stream?: unknown }> }).send(command);

    async function* gen() {
      if (!response.stream) return;

      // Use the canonical model id (request.model) for downstream accounting and catalog lookup.
      // Provider-specific model ids (providerModelId) may not exist in our llm_models catalog.
      const canonicalModelId = typeof request.model === 'string' && request.model.trim().length > 0 ? request.model : providerModelId;

      const mapBedrockStopReasonToOpenAIFinishReason = (stopReason: string | undefined): string => {
        // Bedrock stop reasons (subset): end_turn, max_tokens, stop_sequence, tool_use, guardrail_intervened, content_filtered
        // OpenAI finish_reason (subset): stop, length, tool_calls, content_filter
        switch (stopReason) {
          case 'max_tokens':
            return 'length';
          case 'tool_use':
            return 'tool_calls';
          case 'guardrail_intervened':
          case 'content_filtered':
            return 'content_filter';
          case 'stop_sequence':
          case 'end_turn':
          default:
            return 'stop';
        }
      };

      // Bedrock streams a sequence of structured events (messageStart,
      // contentBlockStart, contentBlockDelta, contentBlockStop, messageStop, ...).
      // We normalize these into OpenAI-style ChatCompletionChunk objects so the
      // existing LLM node tooling (including tool call handling) continues to work.
      type BedrockToolUseState = {
        toolUseId: string;
        name: string;
        accumulatedArgs: string;
      };
      const toolUseStates: Record<number, BedrockToolUseState> = {};
      // Track reasoning/thinking blocks so we can persist + replay them in future turns.
      // - reasoningSnapshots: last raw text we observed (may be cumulative OR delta)
      // - reasoningAcc: accumulated reasoning text for this stream (always cumulative)
      const reasoningSnapshots: Record<number, string> = {};
      const reasoningAcc: Record<number, string> = {};
      const reasoningSignatures: Record<number, string> = {};

      type BedrockDelta = {
        text?: string;
        toolUse?: { input?: unknown };
        reasoningContent?: unknown;
      };
      type BedrockStreamEvent = {
        contentBlockDelta?: { contentBlockIndex?: number; delta?: BedrockDelta };
        contentBlockStart?: {
          contentBlockIndex?: number;
          start?: { toolUse?: { toolUseId?: string; name?: string } };
        };
        // Not fully typed here to avoid SDK type/version mismatches; we extract token usage dynamically.
        messageStop?: { stopReason?: string };
        metadata?: { usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } };
      };
      const stream = response.stream as AsyncIterable<BedrockStreamEvent>;

      // Usage and finish_reason are delivered late in the stream (messageStop/metadata).
      let bedrockStopReason: string | undefined;
      let bedrockUsage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;

      const coerceToText = (v: unknown): string => {
        try {
          if (typeof v === 'string') return v;
          if (!v || typeof v !== 'object') return '';
          const rec = v as Record<string, unknown>;
          if (typeof rec.text === 'string') return rec.text;
          const tokens = rec.tokens;
          if (Array.isArray(tokens) && tokens.length > 0) {
            return (tokens as unknown[]).map((t) => coerceToText(t)).join('');
          }
          return '';
        } catch {
          return '';
        }
      };

      for await (const event of stream) {
        // Capture stop reason + usage (metadata) when present.
        try {
          const anyEvent = event as unknown as Record<string, unknown>;
          const ms = (anyEvent as { messageStop?: unknown }).messageStop;
          if (ms && typeof ms === 'object') {
            const sr = (ms as { stopReason?: unknown }).stopReason;
            if (typeof sr === 'string' && sr.length > 0) bedrockStopReason = sr;
          }
          const md = (anyEvent as { metadata?: unknown }).metadata;
          if (md && typeof md === 'object') {
            const u = (md as { usage?: unknown }).usage;
            if (u && typeof u === 'object') {
              const ut = u as { inputTokens?: unknown; outputTokens?: unknown; totalTokens?: unknown };
              const inputTokens = typeof ut.inputTokens === 'number' ? ut.inputTokens : undefined;
              const outputTokens = typeof ut.outputTokens === 'number' ? ut.outputTokens : undefined;
              const totalTokens = typeof ut.totalTokens === 'number' ? ut.totalTokens : undefined;
              if (typeof inputTokens === 'number' || typeof outputTokens === 'number' || typeof totalTokens === 'number') {
                bedrockUsage = {
                  ...(typeof inputTokens === 'number' ? { inputTokens } : {}),
                  ...(typeof outputTokens === 'number' ? { outputTokens } : {}),
                  ...(typeof totalTokens === 'number' ? { totalTokens } : {}),
                };
              }
            }
          }
        } catch {
          // Non-fatal: usage/stopReason extraction is best-effort.
        }

        // Text deltas
        if (event.contentBlockDelta && event.contentBlockDelta.delta) {
          const idx = event.contentBlockDelta.contentBlockIndex ?? 0;
          const delta = event.contentBlockDelta.delta;

          // Reasoning / thinking deltas (Bedrock: reasoningContent). Map to OpenAI-style delta.reasoning.
          // Bedrock may send either incremental deltas or cumulative snapshots; compute a non-overlapping fragment.
          if (delta.reasoningContent) {
            const rc = delta.reasoningContent;
            let nextText = '';
            let eventHasSignature = false;
            try {
              if (rc && typeof rc === 'object') {
                const rco = rc as Record<string, unknown>;
                const reasoningText = rco.reasoningText;
                if (reasoningText && typeof reasoningText === 'object') {
                  const rt = reasoningText as Record<string, unknown>;
                  eventHasSignature = typeof rt.signature === 'string' && rt.signature.trim().length > 0;
                } else {
                  eventHasSignature = typeof rco.signature === 'string' && rco.signature.trim().length > 0;
                }
              }
            } catch {
              eventHasSignature = false;
            }

            try {
              if (typeof rc === 'string') {
                nextText = rc;
              } else if (rc && typeof rc === 'object') {
                const rco = rc as Record<string, unknown>;
                // Common shapes:
                // - ReasoningContentBlock: { reasoningText: { text: string, signature?: string } }
                // - OR ReasoningTextBlock: { text: string, signature?: string }
                // - { text: string }
                const reasoningText = (rco as { reasoningText?: unknown }).reasoningText as unknown;
                if (reasoningText && typeof reasoningText === 'object') {
                  const rt = reasoningText as Record<string, unknown>;
                  nextText = coerceToText(rt.text);
                  if (typeof rt.signature === 'string' && rt.signature.trim().length > 0) {
                    reasoningSignatures[idx] = rt.signature.trim();
                  }
                }
                if (!nextText) nextText = coerceToText((rco as { text?: unknown }).text);
                if (typeof rco.signature === 'string' && rco.signature.trim().length > 0) {
                  reasoningSignatures[idx] = rco.signature.trim();
                }
              }
            } catch {
              nextText = '';
            }

            if (typeof nextText === 'string') {
              const prev = reasoningSnapshots[idx] || '';
              const fragment = nextText.startsWith(prev) ? nextText.slice(prev.length) : nextText;
              reasoningSnapshots[idx] = nextText;
              if (fragment.length > 0) {
                const base = reasoningAcc[idx] || '';
                reasoningAcc[idx] = base + fragment;
              }
              if (fragment.length > 0) {
                yield {
                  id: 'bedrock-stream',
                  object: 'chat.completion.chunk',
                  created: Date.now(),
                  model: canonicalModelId,
                  choices: [
                    {
                      index: 0,
                      delta: { reasoning: fragment },
                      finish_reason: null,
                    },
                  ],
                };
              }
            }
            continue;
          }

          // Tool calling: map Bedrock toolUse deltas to OpenAI-style tool_calls
          if (delta.toolUse) {
            const toolState = toolUseStates[idx];
            if (toolState) {
              // Bedrock sends the FULL accumulated arguments in each delta, not just the fragment.
              // input can be a string or a structured object; normalize to string for diffing.
              const newAccumulatedArgs =
                typeof delta.toolUse.input === 'string' ? delta.toolUse.input : JSON.stringify(delta.toolUse.input ?? '');
              const previousArgs = toolState.accumulatedArgs || '';

              // Compute the delta: only the new portion that wasn't in the previous args
              let argsFragment = '';
              if (newAccumulatedArgs.startsWith(previousArgs)) {
                argsFragment = newAccumulatedArgs.slice(previousArgs.length);
              } else {
                // If the new args don't start with previous args, it means Bedrock replaced them
                // (shouldn't happen, but handle gracefully)
                argsFragment = newAccumulatedArgs;
              }

              // Update accumulated args for next delta
              toolState.accumulatedArgs = newAccumulatedArgs;

              // Only emit if there's new content
              // Use idx (contentBlockIndex) as the tool_calls index to match OpenAI format
              // Each Bedrock tool call has its own contentBlockIndex, which maps to tool_calls[index]
              if (argsFragment.length > 0) {
                yield {
                  id: 'bedrock-stream',
                  object: 'chat.completion.chunk',
                  created: Date.now(),
                  model: canonicalModelId,
                  choices: [
                    {
                      index: 0, // OpenAI always uses choice index 0 for streaming
                      delta: {
                        tool_calls: [
                          {
                            index: idx, // Map Bedrock's contentBlockIndex to tool_calls[index]
                            id: toolState.toolUseId,
                            type: 'function',
                            function: {
                              name: toolState.name,
                              arguments: argsFragment,
                            },
                          },
                        ],
                      },
                      finish_reason: null,
                    },
                  ],
                };
              }
            }
            continue;
          }

          // Plain text delta
          if (typeof delta.text === 'string' && delta.text.length > 0) {
            yield {
              id: 'bedrock-stream',
              object: 'chat.completion.chunk',
              created: Date.now(),
              model: canonicalModelId,
              choices: [
                {
                  index: idx,
                  delta: { content: delta.text },
                  finish_reason: null,
                },
              ],
            };
          }
        }

        // Tool use start: remember toolUseId + name for this content block index
        if (event.contentBlockStart && event.contentBlockStart.start?.toolUse) {
          const idx = event.contentBlockStart.contentBlockIndex ?? 0;
          const tu = event.contentBlockStart.start.toolUse;
          if (tu && typeof tu.toolUseId === 'string' && typeof tu.name === 'string') {
            toolUseStates[idx] = {
              toolUseId: tu.toolUseId,
              name: tu.name,
              accumulatedArgs: '',
            };

            // Bedrock may emit a toolUseStart and then provide an EMPTY input (or no deltas)
            // for no-argument tools. Our LLM layer detects tool calls only via tool_calls deltas,
            // so emit an initial OpenAI-style tool_calls delta immediately on start.
            yield {
              id: 'bedrock-stream',
              object: 'chat.completion.chunk',
              created: Date.now(),
              model: canonicalModelId,
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      {
                        index: idx,
                        id: tu.toolUseId,
                        type: 'function',
                        function: {
                          name: tu.name,
                          arguments: '',
                        },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            };
          }
          continue;
        }

        // We currently don't need to emit anything for messageStart/contentBlockStop/messageStop
        // because the LLM node infers finishReason when the stream completes and tool calls
        // are reconstructed from the accumulated tool_calls deltas.
      }

      // Emit a final snapshot chunk containing reasoning_details so the LLM node can persist
      // provider-native thinking (including signatures) for replay in future Bedrock turns.
      try {
        const indices = Object.keys(reasoningAcc)
          .map((k) => Number(k))
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => a - b);
        const reasoning_details: unknown[] = [];
        for (const idx of indices) {
          const text = typeof reasoningAcc[idx] === 'string' ? (reasoningAcc[idx] as string) : '';
          if (text.trim().length === 0) continue;
          const sig = typeof reasoningSignatures[idx] === 'string' ? reasoningSignatures[idx] : undefined;
          reasoning_details.push({
            type: 'reasoning.text',
            text,
            ...(sig ? { signature: sig } : {}),
            format: 'anthropic-claude-v1',
            index: idx,
          });
        }
        if (reasoning_details.length > 0) {
          yield {
            id: 'bedrock-stream',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: canonicalModelId,
            choices: [
              {
                index: 0,
                delta: { reasoning_details },
                finish_reason: null,
              },
            ],
          };
        }
      } catch {
        // Non-fatal
      }

      // Emit a final synthetic chunk containing usage + finish_reason so downstream accounting records it.
      // LLM.ts normalizes snake_case usage (prompt_tokens/completion_tokens/total_tokens).
      const inputTokens = typeof bedrockUsage?.inputTokens === 'number' ? bedrockUsage.inputTokens : undefined;
      const outputTokens = typeof bedrockUsage?.outputTokens === 'number' ? bedrockUsage.outputTokens : undefined;
      const totalTokens =
        typeof bedrockUsage?.totalTokens === 'number'
          ? bedrockUsage.totalTokens
          : typeof inputTokens === 'number' && typeof outputTokens === 'number'
            ? inputTokens + outputTokens
            : undefined;

      if (typeof inputTokens === 'number' || typeof outputTokens === 'number' || typeof totalTokens === 'number') {
        yield {
          id: 'bedrock-stream',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: canonicalModelId,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: mapBedrockStopReasonToOpenAIFinishReason(bedrockStopReason),
            },
          ],
          usage: {
            prompt_tokens: typeof inputTokens === 'number' ? inputTokens : 0,
            completion_tokens: typeof outputTokens === 'number' ? outputTokens : 0,
            total_tokens: typeof totalTokens === 'number' ? totalTokens : 0,
          },
        };
      }
    }

    return gen();
  } catch (e: unknown) {
    console.error('[RunnerHostRuntime.llm] Bedrock error', e);
    throw e;
  }
}
