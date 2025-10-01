/**
 * Usage domain models
 *
 * Defines the canonical shape for usage accounting records and aggregate totals.
 * Usage records are persisted separately from messages and linked to both
 * Starship and Conversation.
 */

import type { LLMUsage } from '@starships/autopilot';

export interface UsageModel extends LLMUsage {
  // Database identity
  id: string;

  // Foreign keys
  starshipId: string;
  conversationId: string;

  // Optional provider/model identifier associated with this turn
  model?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

/**
 * Aggregate totals scoped to a user across all owned starships.
 * Includes requestCount = number of persisted usage records.
 */
export interface UserUsageTotals {
  totals: LLMUsage;
  requestCount: number;
}

// Re-export LLMUsage directly for usage totals
export type { LLMUsage };
