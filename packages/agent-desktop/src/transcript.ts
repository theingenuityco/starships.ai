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

const MAX_TEXT = 4000; // keep individual turns bounded before they cross to the webview
const MAX_RESULT = 600; // tool results are noisy; clip harder

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
    const content = message?.content;

    if (typeof content === 'string') {
      if (content.trim()) turns.push({ role: type, text: clip(content, MAX_TEXT), ts });
      continue;
    }
    if (!Array.isArray(content)) continue;

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
  }
  return turns;
}
