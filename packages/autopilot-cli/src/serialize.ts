import type { ToolResult } from '@/types';

/**
 * Serialize a tool result into the string content of a `tool` role message.
 *
 * Shared between the agent loop and any host that persists the transcript so the
 * in-memory and DB transcripts round-trip identically. Keep this the single
 * source of truth for the tool-result envelope shape.
 */
export function serializeToolResult(result: ToolResult): string {
  try {
    return JSON.stringify({ ok: !result.isError, ...(result.isError ? { error: result.content } : { data: result.content }) });
  } catch {
    return JSON.stringify({ ok: false, error: 'tool result could not be serialized' });
  }
}
