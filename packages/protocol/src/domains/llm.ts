/**
 * LLM / agent runtime types.
 *
 * These provider-neutral message, tool, and agent-config shapes formerly lived in
 * `@starships/autopilot`. They were relocated here when the DAG engine was removed,
 * so they are now the canonical home shared across server/models/protocol.
 *
 * DAG-specific fields (e.g. a `blueprint` on tool/agent params) were intentionally
 * dropped during the relocation; agents run via the code-native loop, not blueprints.
 */

// ============================================================================
// Messages
// ============================================================================

export type LLMMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface LlmFunctionCall {
  name: string;
  /** Parsed arguments object (parsed from the LLM's JSON string response). */
  arguments: unknown;
}

export interface LlmToolCall {
  id?: string;
  type?: 'function';
  function: LlmFunctionCall;
}

/** Internal Starships message metadata (provider name mapping / attribution). */
export type StarshipsMeta = {
  authorType?: string;
  authorId?: string;
  [key: string]: unknown;
};

/** Unified OpenRouter reasoning details. */
export type ReasoningDetail =
  | {
      type: 'reasoning.summary';
      summary: string;
      id?: string | null;
      format?: 'unknown' | 'openai-responses-v1' | 'anthropic-claude-v1';
      index?: number;
    }
  | {
      type: 'reasoning.encrypted';
      data: string;
      id?: string | null;
      format?: 'unknown' | 'openai-responses-v1' | 'anthropic-claude-v1';
      index?: number;
    }
  | {
      type: 'reasoning.text';
      text: string;
      signature?: string | null;
      id?: string | null;
      format?: 'unknown' | 'openai-responses-v1' | 'anthropic-claude-v1';
      index?: number;
    };

/** Multimodal content types (OpenRouter/OpenAI compatible). */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' } }
  | { type: 'file'; file: { filename: string; file_data: string } };

export type MessageContent = string | ContentBlock[];

/**
 * OpenRouter image generation output. With image models + `modalities: ['image','text']`,
 * providers may return an `images` array on the assistant message (typically a data URL).
 */
export type GeneratedImage = {
  type: 'image_url';
  image_url: {
    url: string;
  };
};

export interface LlmMessage {
  role: LLMMessageRole;
  content: MessageContent;
  /** Optional model-provided reasoning/thinking text (reasoning-capable models). */
  reasoning?: string;
  /** Optional unified reasoning details (OpenRouter normalized). */
  reasoningDetails?: ReasoningDetail[];
  /** Optional Starships metadata for provider name mapping/attribution. */
  starshipsMeta?: StarshipsMeta;
  /** Optional image generation outputs (OpenRouter extension). */
  images?: GeneratedImage[];
  /**
   * The id of the tool call this message is a result of. For `tool` role messages,
   * providers use this to link the result back to the originating assistant toolCall.
   */
  toolCallId?: string;
  toolCalls?: LlmToolCall[];
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** OpenRouter usage accounting: total amount charged (credits/USD). */
  cost: number;
}

// ============================================================================
// Tool / agent parameter shapes
// ============================================================================

/** JSON Schema (subset) describing a tool's parameters. Recursive. */
export interface ToolParameterSchema {
  $id?: string;
  $schema?: string;
  $ref?: string;

  title?: string;
  description?: string;
  default?: unknown;
  examples?: unknown[];

  type?:
    | 'string'
    | 'number'
    | 'boolean'
    | 'object'
    | 'array'
    | 'null'
    | Array<'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'>;

  enum?: unknown[];
  const?: unknown;

  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;

  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  items?: ToolParameterSchema | ToolParameterSchema[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  properties?: Record<string, ToolParameterSchema>;
  patternProperties?: Record<string, ToolParameterSchema>;
  additionalProperties?: boolean | ToolParameterSchema;
  required?: string[];
  minProperties?: number;
  maxProperties?: number;
  dependentRequired?: Record<string, string[]>;
  dependentSchemas?: Record<string, ToolParameterSchema>;
  propertyNames?: ToolParameterSchema;

  allOf?: ToolParameterSchema[];
  anyOf?: ToolParameterSchema[];
  oneOf?: ToolParameterSchema[];
  not?: ToolParameterSchema;
  if?: ToolParameterSchema;
  then?: ToolParameterSchema;
  else?: ToolParameterSchema;

  readOnly?: boolean;
  writeOnly?: boolean;
  deprecated?: boolean;

  $defs?: Record<string, ToolParameterSchema>;
}

/** A tool's name + parameter schema. (DAG `blueprint` execution was removed.) */
export interface ToolParams {
  name: string;
  slug: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
    allOf?: ToolParameterSchema[];
    anyOf?: ToolParameterSchema[];
    oneOf?: ToolParameterSchema[];
    not?: ToolParameterSchema;
    if?: ToolParameterSchema;
    then?: ToolParameterSchema;
    else?: ToolParameterSchema;
  };
  /** Optional id linking an execution to the originating assistant tool_call. */
  toolCallId?: string;
}

/**
 * Agent configuration. (DAG `blueprint` was removed; agents run the code-native loop.)
 * `state` is the loose persisted agent state; the canonical typed shape is `AgentState`
 * in `./conversation-state`.
 */
export interface AgentParams {
  name: string;
  description?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
    max_tokens?: number;
    exclude?: boolean;
    enabled?: boolean;
  };
  timeout?: number;
  systemPrompt?: string;
  state?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Workspace (repo checkout for sandboxed code agents)
// ============================================================================

/** Describes the repository checkout a workspace-backed job needs. */
export interface WorkspaceSpec {
  /** HTTPS clone URL with NO embedded credentials. */
  repoUrl: string;
  /** Base branch or commit SHA to check out. Defaults to the repo default branch. */
  ref?: string;
  /** New working branch to create off `ref` (where changes/commits land). */
  branch?: string;
  /** Shallow clone depth. Default 1; 0 means a full clone. */
  depth?: number;
  /** Monorepo subdirectory to operate in (relative to the repo root). */
  subdir?: string;
}

/**
 * Short-lived git credentials used only for the duration of provision/push.
 * Never written to persisted state or logs.
 */
export interface GitCredentials {
  /** Short-lived token (prefer a GitHub App installation token). */
  token: string;
  /** HTTPS basic-auth username. Use `x-access-token` for GitHub App tokens. */
  username?: string;
}
