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

/**
 * A connector as authored in `.starship/connectors/<provider>.yaml`: the wiring
 * only. Secrets live in connector_secrets (DB); runtime health (status/lastError)
 * is index-only.
 */
export interface ConnectorDefinition {
  id: string;
  provider: string;
  templateId?: string;
  version?: string;
  metadata?: Record<string, unknown>;
}

/**
 * A table as authored in `.starship/tables/<slug>.yaml`: the logical schema only.
 * The physical binding (schemaName/physicalTable) and `archived` are index-only;
 * rows live in the per-starship Postgres schema.
 */
export interface TableColumnDefinition {
  name: string;
  description?: string;
  type?: string;
  format?: string;
  constraints?: Record<string, unknown>;
  enum?: { options: string[] };
  reference?: Record<string, unknown>;
}

export interface TableDefinition {
  id: string;
  slug: string;
  name: string;
  description?: string;
  primaryKey?: string | null;
  columns: TableColumnDefinition[];
}

/**
 * A schedule as authored in `.starship/schedules/<id>.yaml`. Execution state
 * (nextRunAt/runCount/lastRun*) and ownerUserId are index-only.
 */
export interface ScheduleDefinition {
  id: string;
  agentId: string;
  prompt: string;
  cronExpression: string;
  timezone: string;
  isActive: boolean;
  isRecurring: boolean;
  endsAt?: string | null;
  maxOccurrences?: number | null;
}
