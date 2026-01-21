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

const redactPresignedUrlForLogs = (raw: string): {
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

  // Separate system prompts from messages
  const bedrockMessages: BedrockMessage[] = [];
  const system: { text: string }[] = [];

  const rawMessages = request.messages as OpenAI.Chat.ChatCompletionMessageParam[];

  for (const m of rawMessages) {
    if (m.role === 'system') {
      if (typeof m.content === 'string') {
        const trimmed = m.content.trim();
        system.push({ text: trimmed.length > 0 ? trimmed : 'System instructions' });
      }
      continue;
    }

    const content: BedrockContentBlock[] = [];
    if (typeof m.content === 'string') {
      const trimmed = m.content.trim();
      // Bedrock validation requires non-blank text fields; provide a minimal placeholder
      // when the original content is empty (e.g. attachment-only messages).
      content.push({ text: trimmed.length > 0 ? trimmed : ' ' });
    } else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part.type === 'text') {
          const txt = typeof part.text === 'string' ? part.text.trim() : '';
          content.push({ text: txt.length > 0 ? txt : ' ' });
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

    // Map other roles to user/assistant.
    // Note: Bedrock strictly alternates user/assistant usually, but Converse API is more flexible.
    // However, it expects 'user' or 'assistant'.
    const role = m.role === 'user' ? 'user' : 'assistant';
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

  const input: ConverseStreamCommandInput = {
    modelId: providerModelId,
    messages: bedrockMessages,
    toolConfig,
    inferenceConfig: {
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      topP: request.topP,
    },
  };

  if (system.length > 0) {
    input.system = system;
  }

  try {
    const command = new ConverseStreamCommand(input);
    // Cast to any to avoid spurious TS error "Property 'send' does not exist"
    // which happens despite BedrockRuntimeClient inheriting from Client
    const response = await (client as any).send(command);

    async function* gen() {
      if (!response.stream) return;

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

      for await (const event of response.stream as AsyncIterable<any>) {
        // Text deltas
        if (event.contentBlockDelta && event.contentBlockDelta.delta) {
          const idx = event.contentBlockDelta.contentBlockIndex ?? 0;
          const delta = event.contentBlockDelta.delta;

          // Tool calling: map Bedrock toolUse deltas to OpenAI-style tool_calls
          if (delta.toolUse) {
            const toolState = toolUseStates[idx];
            if (toolState) {
              // Bedrock sends the FULL accumulated arguments in each delta, not just the fragment.
              // input can be a string or a structured object; normalize to string for diffing.
              const newAccumulatedArgs =
                typeof delta.toolUse.input === 'string'
                  ? delta.toolUse.input
                  : JSON.stringify(delta.toolUse.input ?? '');
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
                  model: providerModelId,
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
              model: providerModelId,
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
          }
          continue;
        }

        // We currently don't need to emit anything for messageStart/contentBlockStop/messageStop
        // because the LLM node infers finishReason when the stream completes and tool calls
        // are reconstructed from the accumulated tool_calls deltas.
      }
    }

    return gen();
  } catch (e: unknown) {
    console.error('[RunnerHostRuntime.llm] Bedrock error', e);
    throw e;
  }
}

