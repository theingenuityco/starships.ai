/**
 * Agent dispatch types.
 *
 * The work + activity channel between a starship and the personas running on its
 * agent runtimes. Work (dispatches, heartbeats) targets a persona; whatever
 * runtime that persona is currently assigned to executes it. Events are the
 * append-only activity log, attributed to both the persona (actor) and the
 * runtime (engine) that produced them.
 */

import type { PersonaExecutionConfig } from './agent-persona';

export type DispatchDeliveryStatus = 'dispatched' | 'delivered' | 'failed';
export type DispatchAckStatus = 'pending' | 'acked' | 'done' | 'cancelled';

/**
 * A command dispatched to a persona. May reference a task card when the work is
 * human-visible, or carry a free-form payload for ad-hoc commands. The runtime
 * that executes it is resolved from the persona's assignment at creation time.
 */
export interface AgentRuntimeDispatchModel {
  id: string;
  starshipId: string;
  /** Target persona (the actor). */
  personaId: string;
  /** Runtime resolved to execute this dispatch. Null while the persona is unassigned. */
  runtimeId?: string | null;
  cardId?: string | null;
  /** Set when this dispatch was created by a recurring heartbeat. */
  heartbeatId?: string | null;
  commandType: string;
  payload: Record<string, unknown>;
  /** Persona behaviour snapshot to inject at execution time. */
  persona?: PersonaExecutionConfig | null;
  deliveryStatus: DispatchDeliveryStatus;
  ackStatus: DispatchAckStatus;
  createdAt: string;
  ackedAt?: string | null;
  completedAt?: string | null;
}

/**
 * A recurring heartbeat that periodically dispatches a command to a persona. The
 * server's in-process scheduler fires each enabled heartbeat every
 * `intervalSeconds`, creating an {@link AgentRuntimeDispatchModel} the assigned
 * runtime picks up on its next `pull_commands`.
 */
export interface AgentRuntimeHeartbeatModel {
  id: string;
  starshipId: string;
  /** Target persona for the recurring dispatch. */
  personaId: string;
  name?: string | null;
  commandType: string;
  payload: Record<string, unknown>;
  intervalSeconds: number;
  enabled: boolean;
  lastFiredAt?: string | null;
  nextFireAt: string;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Append-only activity record (the audit trail; not chat). */
export interface AgentRuntimeEventModel {
  id: string;
  starshipId: string;
  /** Persona the event is attributed to (the actor). Null for runtime-level events. */
  personaId?: string | null;
  /** Runtime that produced the event (the engine). */
  runtimeId?: string | null;
  dispatchId?: string | null;
  cardId?: string | null;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
