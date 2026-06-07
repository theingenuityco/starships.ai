// Parser for the on-disk conversation transcripts that agent CLIs leave behind.
//
// Claude Code writes one JSON object per line (JSONL) to
// `~/.claude/projects/<slug>/<session-id>.jsonl`. The shapes evolve, so this
// reader is deliberately defensive: it extracts what it recognises (user turns,
// assistant text, tool calls + results) and silently skips bookkeeping it
// doesn't. Anything unparseable is dropped rather than thrown.

export type TurnRole = 'user' | 'assistant' | 'tool' | 'result';

export interface TranscriptTurn {
  role: TurnRole;
  text: string;
  /** Tool name, for `tool`/`result` turns. */
  tool?: string;
  ts?: string;
}

// Generous caps so the *whole* conversation shows — we only clip to guard against
// pathological multi-MB blobs choking the webview, not to summarize.
const MAX_TEXT = 200_000;
const MAX_RESULT = 50_000;

function clip(s: string, max: number): string {
  const t = s.trimEnd();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Flatten Claude's block-array (or string) content into plain text. */
function blockText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((b) => {
      if (typeof b === 'string') return b;
      const block = b as Record<string, unknown>;
      if (block.type === 'text') return String(block.text ?? '');
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/** Turn a single Anthropic-shaped message (`user`/`assistant`, string or block array) into turns. */
function messageToTurns(type: 'user' | 'assistant', content: unknown, ts?: string): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  if (typeof content === 'string') {
    if (content.trim()) turns.push({ role: type, text: clip(content, MAX_TEXT), ts });
    return turns;
  }
  if (!Array.isArray(content)) return turns;

  for (const raw of content) {
    const block = raw as Record<string, unknown>;
    switch (block.type) {
      case 'text': {
        const text = String(block.text ?? '');
        if (text.trim()) turns.push({ role: type, text: clip(text, MAX_TEXT), ts });
        break;
      }
      case 'tool_use': {
        const input = block.input ? clip(JSON.stringify(block.input), MAX_RESULT) : '';
        turns.push({ role: 'tool', tool: String(block.name ?? 'tool'), text: input, ts });
        break;
      }
      case 'tool_result': {
        const text = blockText(block.content);
        turns.push({ role: 'result', tool: 'result', text: clip(text || '(no output)', MAX_RESULT), ts });
        break;
      }
      default:
        break;
    }
  }
  return turns;
}

export function parseClaudeTranscript(raw: string): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }

    const type = obj.type;
    if (type !== 'user' && type !== 'assistant') continue;

    const message = obj.message as Record<string, unknown> | undefined;
    const ts = typeof obj.timestamp === 'string' ? obj.timestamp : undefined;
    turns.push(...messageToTurns(type, message?.content, ts));
  }
  return turns;
}

/**
 * A single update applied to a live run's conversation as stream lines arrive.
 * `delta` appends to the in-flight assistant text; `assistant` commits a finished
 * assistant message (and clears the in-flight buffer); `toolResults` appends tool
 * turns; `result` finalizes; `system` carries run metadata.
 */
export type StreamUpdate =
  | { kind: 'delta'; text: string }
  | { kind: 'assistant'; turns: TranscriptTurn[] }
  | { kind: 'toolResults'; turns: TranscriptTurn[] }
  | { kind: 'result'; finalText?: string; durationMs?: number; denials?: number; deniedTools?: string[]; isError?: boolean }
  | { kind: 'system'; sessionId?: string; model?: string };

/** Parse one Claude `--output-format stream-json` line into updates (token-by-token capable). */
export function parseClaudeStreamLine(line: string): StreamUpdate[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [];
  }

  switch (obj.type) {
    case 'system': {
      if (obj.subtype !== 'init') return [];
      return [
        {
          kind: 'system',
          sessionId: typeof obj.session_id === 'string' ? obj.session_id : undefined,
          model: typeof obj.model === 'string' ? obj.model : undefined,
        },
      ];
    }
    case 'stream_event': {
      const event = obj.event as Record<string, unknown> | undefined;
      if (event?.type !== 'content_block_delta') return [];
      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta?.type !== 'text_delta') return [];
      const text = String(delta.text ?? '');
      return text ? [{ kind: 'delta', text }] : [];
    }
    case 'assistant': {
      const message = obj.message as Record<string, unknown> | undefined;
      return [{ kind: 'assistant', turns: messageToTurns('assistant', message?.content) }];
    }
    case 'user': {
      const message = obj.message as Record<string, unknown> | undefined;
      const turns = messageToTurns('user', message?.content).filter((t) => t.role === 'result');
      return turns.length ? [{ kind: 'toolResults', turns }] : [];
    }
    case 'result': {
      // `permission_denials` is an array of { tool_name, tool_use_id, tool_input }.
      // Keep the distinct tool names so the UI can offer a one-click "allow + rerun"
      // per denied tool (not just a bare count).
      const denialList = Array.isArray(obj.permission_denials) ? obj.permission_denials : [];
      const deniedTools = [
        ...new Set(
          denialList
            .map((d) => (d && typeof d === 'object' ? String((d as Record<string, unknown>).tool_name ?? '') : ''))
            .filter(Boolean)
        ),
      ];
      return [
        {
          kind: 'result',
          finalText: typeof obj.result === 'string' ? obj.result : undefined,
          durationMs: typeof obj.duration_ms === 'number' ? obj.duration_ms : undefined,
          denials: denialList.length || undefined,
          deniedTools: deniedTools.length ? deniedTools : undefined,
          isError: obj.is_error === true,
        },
      ];
    }
    default:
      return [];
  }
}

/** Parse one Codex `exec --json` JSONL line into updates (turn-level; no token deltas). */
export function parseCodexStreamLine(line: string): StreamUpdate[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [];
  }
  // Codex emits item.started then item.completed; only render completed items.
  if (obj.type !== 'item.completed') return [];
  const item = obj.item as Record<string, unknown> | undefined;
  if (!item) return [];

  switch (item.type) {
    case 'agent_message': {
      const text = String(item.text ?? '').trim();
      return text ? [{ kind: 'assistant', turns: [{ role: 'assistant', text: clip(text, MAX_TEXT) }] }] : [];
    }
    case 'command_execution': {
      const command = String(item.command ?? '').trim();
      const output = String(item.aggregated_output ?? '').trim();
      const exit = item.exit_code;
      const turns: TranscriptTurn[] = [{ role: 'tool', tool: 'shell', text: clip(command, MAX_RESULT) }];
      const resultText = output || (typeof exit === 'number' ? `(exit ${exit})` : '(no output)');
      turns.push({ role: 'result', tool: 'result', text: clip(resultText, MAX_RESULT) });
      return [{ kind: 'toolResults', turns }];
    }
    case 'reasoning':
      return []; // omit chain-of-thought from the rendered conversation
    default: {
      // file_change, mcp tool calls, web_search, … — show a compact tool turn.
      return [{ kind: 'toolResults', turns: [{ role: 'tool', tool: String(item.type ?? 'item'), text: clip(JSON.stringify(item), MAX_RESULT) }] }];
    }
  }
}
