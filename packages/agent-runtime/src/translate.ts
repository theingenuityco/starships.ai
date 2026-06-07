// Builders that emit Claude-compatible `stream-json` lines.
//
// The agent-desktop UI parses these with `parseClaudeStreamLine`
// (packages/agent-desktop/src/transcript.ts). Keep these shapes in lockstep with that
// parser — it is the contract. Each builder returns a plain object; the server
// JSON-stringifies it as one SSE data line.

export interface AssistantTextBlock {
  type: 'text';
  text: string;
}

export interface AssistantToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export type AssistantBlock = AssistantTextBlock | AssistantToolUseBlock;

/** A denied tool call, surfaced in the final result so the UI can offer "allow + rerun". */
export interface PermissionDenial {
  tool_name: string;
  tool_use_id: string;
  tool_input: unknown;
}

/** `{type:'system',subtype:'init',...}` — run metadata (session id + model). */
export function buildSystemInit(sessionId: string, model: string): Record<string, unknown> {
  return { type: 'system', subtype: 'init', session_id: sessionId, model };
}

/** `{type:'stream_event',...content_block_delta}` — one token of assistant text. */
export function buildTextDelta(text: string): Record<string, unknown> {
  return {
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
  };
}

/** `{type:'assistant',message.content:[text, tool_use]}` — a finished assistant turn. */
export function buildAssistantMessage(blocks: AssistantBlock[]): Record<string, unknown> {
  return { type: 'assistant', message: { role: 'assistant', content: blocks } };
}

/** `{type:'user',message.content:[tool_result]}` — one tool's result fed back to the model. */
export function buildToolResult(toolUseId: string, content: string, isError: boolean): Record<string, unknown> {
  return {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError }],
    },
  };
}

/** `{type:'result',...}` — final outcome, including any denials for "allow + rerun". */
export function buildResult(opts: {
  finalText?: string;
  durationMs: number;
  denials: PermissionDenial[];
  isError: boolean;
}): Record<string, unknown> {
  return {
    type: 'result',
    subtype: opts.isError ? 'error' : 'success',
    result: opts.finalText ?? '',
    duration_ms: opts.durationMs,
    permission_denials: opts.denials,
    is_error: opts.isError,
  };
}
