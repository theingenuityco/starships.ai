/**
 * Agent persona types.
 *
 * A "persona" is a user-authored actor that runs on an {@link AgentRuntimeModel}.
 * It carries identity (name, avatar, description), workspace access, and
 * behaviour (system prompt, model, instructions) that get injected into the
 * runtime at execution time. A persona is durable: it can be reassigned to a
 * different runtime without losing its config or history. Many personas may be
 * assigned to a single runtime.
 */

/** Workspace access level granted to a persona (gates MCP writes). */
export type AgentAccessRole = 'viewer' | 'contributor';

export interface AgentPersonaModel {
  id: string;
  starshipId: string;
  /** Stable, URL-safe identifier derived from the name. */
  slug: string;
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  /** Workspace access level (gates MCP writes). */
  accessRole: AgentAccessRole;
  /** System prompt injected into the runtime when this persona executes. */
  systemPrompt?: string | null;
  /** Preferred model id passed to the runtime, when the runtime supports it. */
  model?: string | null;
  /** Additional behaviour instructions appended to the system prompt. */
  instructions?: string | null;
  temperature?: number | null;
  /** Current runtime assignment (reassignable). Null when unassigned. */
  runtimeId?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentPersonaRequest {
  starshipId: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  /** Defaults to 'contributor' when omitted. */
  accessRole?: AgentAccessRole;
  systemPrompt?: string;
  model?: string;
  instructions?: string;
  temperature?: number;
  /** Optional initial runtime assignment. */
  runtimeId?: string | null;
}

export interface UpdateAgentPersonaRequest {
  name?: string;
  description?: string;
  avatarUrl?: string;
  accessRole?: AgentAccessRole;
  systemPrompt?: string;
  model?: string;
  instructions?: string;
  temperature?: number;
  /** Reassign the persona to a different runtime (or null to unassign). */
  runtimeId?: string | null;
}

/**
 * Behaviour config resolved from a persona and snapshotted onto a dispatch, so
 * the runtime can inject it at execution time without a join. Snapshotting keeps
 * historical dispatches reproducible if the persona is later edited.
 */
export interface PersonaExecutionConfig {
  personaId: string;
  systemPrompt?: string | null;
  model?: string | null;
  instructions?: string | null;
  temperature?: number | null;
}
