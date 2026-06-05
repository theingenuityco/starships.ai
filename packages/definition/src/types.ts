/**
 * Authored definition shapes — the subset of each entity that lives in a
 * `.autopilot/` file and is therefore source-of-truth. Runtime/ledger fields
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
 * An agent as authored in `.autopilot/agents/<slug>.md`: YAML frontmatter for
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
 * A connector as authored in `.autopilot/connectors/<provider>.yaml`: the wiring
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
 * A table as authored in `.autopilot/tables/<slug>.yaml`: the logical schema only.
 * The physical binding (schemaName/physicalTable) and `archived` are index-only;
 * rows live in the per-starship data store.
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
 * A room as authored in `.autopilot/rooms/<slug>.yaml`: metadata + composition
 * (pinned agents/tables/views/task-boards/docs, ordered by array index) +
 * manager. The backing conversation, message history, and manager heartbeat are
 * index-only. `id` is the room's conversationId (rooms are conversation-backed).
 */
export interface RoomDefinition {
  conversationId: string;
  slug: string;
  name: string;
  isPrivate: boolean;
  topic?: string;
  managerAgentId?: string;
  provisionedByBundle?: string;
  /** Agent participant ids (the room's "pinned agents"). */
  agents: string[];
  /** Pinned resource ids, in render order. */
  tables: string[];
  views: string[];
  taskBoards: string[];
  docs: string[];
}

/**
 * A schedule as authored in `.autopilot/schedules/<id>.yaml`. Execution state
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
