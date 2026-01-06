/**
 * Agent State Management Utilities (Client-side)
 *
 * Utilities for managing agent state in the client, particularly for
 * state comparison and preservation during autosave.
 */

import type { ConversationState } from '@starships/protocol';

/**
 * Check if two state objects are effectively the same for autosave purposes.
 * Handles edge cases like undefined vs missing keys, and preserves plugins.
 *
 * @param baseState - Base state from server
 * @param nextState - New state from form
 * @returns True if states are effectively the same
 */
export function areStatesEqual(
  baseState: ConversationState | Record<string, unknown> | undefined,
  nextState: ConversationState | Record<string, unknown> | undefined
): boolean {
  // Both undefined/null - equal
  if (!baseState && !nextState) return true;
  
  // One is undefined/null, other is not - not equal
  if (!baseState || !nextState) return false;

  // Normalize both states for comparison
  const normalizedBase = normalizeStateForComparison(baseState);
  const normalizedNext = normalizeStateForComparison(nextState);

  // Compare using JSON stringification (stable)
  return JSON.stringify(normalizedBase) === JSON.stringify(normalizedNext);
}

/**
 * Normalize state for comparison by ensuring consistent structure.
 * Removes undefined values and ensures consistent array presence.
 *
 * @param state - State to normalize
 * @returns Normalized state
 */
function normalizeStateForComparison(
  state: ConversationState | Record<string, unknown>
): Record<string, unknown> {
  const normalized = { ...state };

  // Remove plugins key if it's undefined (treat undefined as missing)
  if ('plugins' in normalized && normalized.plugins === undefined) {
    delete normalized.plugins;
  }

  // Ensure messages and tools arrays exist for comparison (if they're in the state)
  // This prevents false positives when comparing states with/without these arrays
  if ('messages' in normalized && normalized.messages === undefined) {
    normalized.messages = [];
  }
  if ('tools' in normalized && normalized.tools === undefined) {
    normalized.tools = [];
  }

  return normalized;
}

/**
 * Check if base state has plugins that should be preserved.
 *
 * @param baseState - Base state to check
 * @returns True if base state has plugins configured
 */
export function baseStateHasPlugins(
  baseState: ConversationState | Record<string, unknown> | undefined
): boolean {
  if (!baseState || typeof baseState !== 'object') return false;
  
  const plugins = (baseState as ConversationState).plugins;
  return Array.isArray(plugins) && plugins.length > 0;
}

/**
 * Check if next state has plugins configured.
 *
 * @param nextState - Next state to check
 * @returns True if next state has plugins configured
 */
export function nextStateHasPlugins(
  nextState: ConversationState | Record<string, unknown> | undefined
): boolean {
  if (!nextState || typeof nextState !== 'object') return false;
  
  const plugins = (nextState as ConversationState).plugins;
  return Array.isArray(plugins) && plugins.length > 0;
}

/**
 * Determine if state update should be skipped to preserve plugins.
 * This prevents autosave from removing plugins when form state is incomplete.
 *
 * @param baseState - Base state from server
 * @param nextState - New state from form
 * @returns True if update should be skipped to preserve plugins
 */
export function shouldSkipStateUpdateToPreservePlugins(
  baseState: ConversationState | Record<string, unknown> | undefined,
  nextState: ConversationState | Record<string, unknown> | undefined
): boolean {
  // If base has plugins but next doesn't, preserve base state
  return baseStateHasPlugins(baseState) && !nextStateHasPlugins(nextState);
}

