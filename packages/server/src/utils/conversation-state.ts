/**
 * Conversation State Management Utility
 *
 * Centralized utilities for managing conversation and agent state,
 * particularly for plugin resolution and state merging.
 */

import type { ConversationState, AgentState, ConversationPlugin } from '@starships/protocol';

/**
 * Resolve plugins from conversation and agent state.
 * Conversation-level plugins take precedence over agent-level plugins.
 *
 * @param conversationState - Conversation-level state
 * @param agentState - Agent-level state (used as fallback, but currently ignored per design)
 * @returns Resolved plugins array, or undefined if no plugins are set
 */
export function resolvePlugins(
  conversationState: ConversationState | Record<string, unknown> | undefined,
  _agentState: AgentState | Record<string, unknown> | undefined
): ConversationPlugin[] | undefined {
  // Type guard to check if state has plugins
  const hasPlugins = (state: unknown): state is { plugins?: ConversationPlugin[] | null } => {
    return typeof state === 'object' && state !== null && 'plugins' in state;
  };

  const conversationPlugins = hasPlugins(conversationState) ? conversationState.plugins : undefined;

  // Conversation-level plugins are the ONLY source of truth
  // Empty array [] means "explicitly no plugins" (disabled)
  // undefined means "not set" (default = no plugins)
  // null is treated as undefined for consistency
  // Agent plugins are completely ignored (no fallback)
  if (conversationPlugins === undefined || conversationPlugins === null) {
    return undefined;
  }

  // Validate that plugins is an array
  if (!Array.isArray(conversationPlugins)) {
    return undefined;
  }

  // Empty array means explicitly no plugins (disabled)
  if (conversationPlugins.length === 0) {
    return [];
  }

  // Validate plugin structure
  const validPlugins = conversationPlugins.filter(
    (p): p is ConversationPlugin =>
      typeof p === 'object' &&
      p !== null &&
      typeof (p as ConversationPlugin).id === 'string' &&
      (p as ConversationPlugin).id.length > 0 && // Require non-empty id
      ((p as ConversationPlugin).max_results === undefined ||
        (typeof (p as ConversationPlugin).max_results === 'number' &&
          Number.isInteger((p as ConversationPlugin).max_results) &&
          (p as ConversationPlugin).max_results! > 0))
  );

  return validPlugins.length > 0 ? validPlugins : undefined;
}

/**
 * Merge conversation state updates with existing state.
 * Performs a shallow merge, preserving existing fields unless explicitly overridden.
 *
 * @param existingState - Current conversation state
 * @param updates - State updates to apply
 * @returns Merged state
 */
export function mergeConversationState(
  existingState: ConversationState | Record<string, unknown> | undefined,
  updates: Partial<ConversationState> | Record<string, unknown>
): ConversationState {
  const existing = (existingState && typeof existingState === 'object' ? existingState : {}) as ConversationState;

  // Shallow merge: spread existing state, then spread updates
  const merged: ConversationState = { ...existing, ...updates };

  // Handle explicit null for plugins: remove plugins key (legacy behavior)
  // Note: Frontend now uses [] for disable instead of null
  if ('plugins' in updates && updates.plugins === null) {
    const { plugins: _, ...rest } = merged;
    return rest as ConversationState;
  }

  return merged;
}

/**
 * Extract persistable state fields from execution state.
 * Excludes ephemeral fields that should not persist across turns.
 *
 * @param executionState - Execution state from autopilot
 * @returns Persistable state fields, or null if nothing to persist
 */
export function extractPersistableState(
  executionState: Record<string, unknown> | undefined
): Record<string, unknown> | null {
  if (!executionState || typeof executionState !== 'object') {
    return null;
  }

  const persistable: Record<string, unknown> = {};

  // Persist most execution state to conversation.state, but keep certain keys ephemeral
  // (per-turn/per-request) so they don't "stick" across turns.
  // Plugins are conversation-level only (controlled by UI toggle) and should NEVER be persisted from execution state
  const blacklist = new Set(['messages', 'tools', 'modalities', 'imageConfig', 'plugins']);

  // Blacklist: Store everything except messages, tools, and plugins
  // Plugins are managed exclusively via conversation state updates (UI toggle), not from execution state
  for (const [key, value] of Object.entries(executionState)) {
    if (!blacklist.has(key)) {
      persistable[key] = value;
    }
  }

  return Object.keys(persistable).length > 0 ? persistable : null;
}

/**
 * Check if a state object has plugins configured.
 *
 * @param state - State object to check
 * @returns True if plugins array exists and has items
 */
export function hasPlugins(state: ConversationState | Record<string, unknown> | undefined): boolean {
  if (!state || typeof state !== 'object') {
    return false;
  }

  const plugins = (state as ConversationState).plugins;
  return Array.isArray(plugins) && plugins.length > 0;
}

/**
 * Normalize state for comparison by ensuring consistent structure.
 * Used for detecting actual state changes in autosave logic.
 *
 * @param state - State to normalize
 * @returns Normalized state
 */
export function normalizeStateForComparison(
  state: ConversationState | Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!state || typeof state !== 'object') {
    return {};
  }

  const normalized = { ...state };

  // Remove plugins key if it's undefined (treat undefined as missing)
  if ('plugins' in normalized && normalized.plugins === undefined) {
    delete normalized.plugins;
  }

  // Ensure messages and tools arrays exist for comparison (if they're in the state)
  if ('messages' in state) {
    normalized.messages = normalized.messages === undefined ? [] : normalized.messages;
  }
  if ('tools' in state) {
    normalized.tools = normalized.tools === undefined ? [] : normalized.tools;
  }

  return normalized;
}

