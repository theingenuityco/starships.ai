/**
 * Usage domain models
 *
 * Defines the canonical shape for usage accounting records and aggregate totals.
 * Usage records are persisted separately from messages and linked to both
 * Starship and Conversation.
 */

export interface UsageModel {
  // Database identity
  id: string;

  // Foreign keys
  starshipId: string;
  conversationId: string;

  // Provider-reported usage for this assistant turn
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;

  // Cost in USD for this assistant turn (provider-reported or normalized)
  cost: number;

  // Optional provider/model identifier associated with this turn
  model?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

/**
 * Aggregate totals for a scope (e.g., a conversation or a starship)
 */
export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}
