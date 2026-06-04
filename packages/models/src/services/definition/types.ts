/**
 * Authored definition shapes — the subset of each entity that lives in a
 * `.starship/` file and is therefore source-of-truth. Runtime/ledger fields
 * (timestamps, content hashes, agent `state`, connector `status`, table
 * physical bindings, schedule execution counters, S3 attachment ids) are
 * deliberately absent: those are owned by the Postgres index and reconciled,
 * never authored in files.
 */

/** Structured reasoning config (mirrors AgentParams.reasoning). */
export interface AgentReasoningConfig {
  effort?: 'low' | 'medium' | 'high';
  max_tokens?: number;
  exclude?: boolean;
  enabled?: boolean;
}

/**
 * An agent as authored in `.starship/agents/<slug>.md`: YAML frontmatter for
 * config + the markdown body as the system prompt.
 */
export interface AgentDefinition {
  /** Immutable join key (FK target for messages/schedules/participants). */
  id: string;
  /** Filename stem; unique per starship. */
  slug: string;
  name: string;
  role: string;
  description?: string;
  model: string;
  category?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  reasoning?: AgentReasoningConfig;
  previewPrompts?: string[];
  version: string;
  /** Per-agent connector scope: `<provider>-<slug>` refs into connectors/. */
  connectors?: string[];
  /** The agent's system prompt (the markdown body below the frontmatter). */
  systemPrompt?: string;
}
