/**
 * Autopilot Await Domain Types
 *
 * Durable, headless await/resume records used by the server to checkpoint
 * workflow state and resume on inbound connector events.
 */

export type AutopilotAwaitStatus = 'waiting' | 'resuming' | 'completed' | 'cancelled' | 'failed';

/**
 * Await kinds. Start small; extend as we add more event sources.
 */
export type AutopilotAwaitKind = 'connector_event';

/**
 * Connector-event await spec describing what should wake the workflow.
 * Kept intentionally simple (no expressions) so it can be safely evaluated by the server matcher.
 */
export interface AutopilotAwaitConnectorEventSpec {
  provider?: string;
  connectorId?: string;
  /**
   * When provided, eventType must be one of these (exact match).
   */
  eventTypes?: string[];
}

export type AutopilotAwaitRequest =
  | {
      kind: 'connector_event';
      nodeRef: string;
      spec: AutopilotAwaitConnectorEventSpec;
    };

/**
 * Minimal blueprint JSON structure used for persistence.
 * (Avoid importing @starships/autopilot types here to prevent circular deps.)
 */
export type AutopilotBlueprintNodeType = string;

export interface AutopilotBlueprintNode {
  ref: string;
  type: AutopilotBlueprintNodeType;
  name: string;
  description?: string;
  /**
   * Node parameters JSON as persisted/executed.
   *
   * Kept as `unknown` to stay structurally compatible with the strongly-typed
   * `NodeParameters` union in @starships/autopilot (which does not have an
   * index signature).
   */
  parameters: unknown;
  metadata?: Record<string, unknown>;
}

export interface AutopilotBlueprintEdge {
  ref: string;
  from: string;
  to: string;
  condition?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface AutopilotBlueprint {
  nodes: AutopilotBlueprintNode[];
  edges: AutopilotBlueprintEdge[];
  metadata?: Record<string, unknown>;
}

/**
 * Minimal execution snapshot persisted for pause/resume.
 * (Matches the shape used by @starships/autopilot without importing it.)
 */
export type AutopilotExecutionStatus = 'not_started' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface AutopilotExecutionItem {
  json: unknown;
  pairedItem?: { item: number };
  error?: string;
  // Note: binary is intentionally excluded; persisted executions are JSON-only.
}

export interface AutopilotExecutionResultEntry {
  nodeRef: string;
  items: AutopilotExecutionItem[];
}

export interface AutopilotExecutionSnapshot {
  currentNodeRef?: string;
  currentNodeInputRef?: string;
  status: AutopilotExecutionStatus;
  state: Record<string, unknown>;
  results: AutopilotExecutionResultEntry[];
  visitCounts?: Record<string, number>;
  error?: {
    code: string;
    message: string;
    nodeRef?: string;
    details?: unknown;
    timestamp: string;
    recoverable: boolean;
    retryCount?: number;
  };
  depth?: number;
}

export interface AutopilotAwaitModel {
  id: string;
  starshipId: string;
  ownerUserId?: string | null;
  status: AutopilotAwaitStatus;
  specJson: AutopilotAwaitRequest;
  blueprintJson: AutopilotBlueprint;
  executionJson: AutopilotExecutionSnapshot;
  /**
   * Persisted execution state snapshot (blacklist-applied). Nullable.
   */
  stateJson?: Record<string, unknown> | null;
  expiresAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AutopilotAwaitFiringStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AutopilotAwaitFiringModel {
  id: string;
  awaitId: string;
  connectorEventId: string;
  status: AutopilotAwaitFiringStatus;
  runRequestId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

