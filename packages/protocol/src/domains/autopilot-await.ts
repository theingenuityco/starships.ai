/**
 * Autopilot Await Domain Types
 *
 * Durable, headless await/resume records used by the server to checkpoint
 * workflow state and resume on inbound connector events.
 */

import type { Blueprint } from '@starships/autopilot';

export type AutopilotAwaitStatus = 'waiting' | 'resuming' | 'completed' | 'cancelled' | 'failed';

/**
 * Await spec describing what should wake the workflow.
 *
 * Kept intentionally simple (no expressions) so it can be safely evaluated
 * by the server matcher.
 */
export interface AutopilotAwaitSpec {
  provider?: string;
  connectorId?: string;
  /**
   * When provided, eventType must be one of these (exact match).
   */
  eventTypes?: string[];
  /**
   * Optional shallow filters (exact match) evaluated by the server.
   * This is intentionally limited; do not embed arbitrary code here.
   */
  filter?: Record<string, unknown>;
}

export interface AutopilotAwaitModel {
  id: string;
  starshipId: string;
  ownerUserId?: string | null;
  status: AutopilotAwaitStatus;
  specJson: AutopilotAwaitSpec;
  blueprintJson: Blueprint;
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

