/**
 * Conversation State Types
 *
 * Type definitions for conversation state structures, including plugins configuration.
 */

/**
 * OpenRouter plugin configuration
 */
export interface ConversationPlugin {
  id: string;
  max_results?: number;
}

/**
 * Conversation state structure
 * 
 * State is stored as JSONB in the database and can contain various fields.
 * This interface defines the known structure for plugins and other state fields.
 */
export interface ConversationState {
  /**
   * OpenRouter plugins configuration (e.g., web browsing).
   * - undefined: not set (default = no plugins)
   * - []: explicitly disabled (no plugins)
   * - [{ id: 'web', max_results: 3 }]: plugins enabled
   */
  plugins?: ConversationPlugin[] | null;
  
  /**
   * Allow other state fields for extensibility
   */
  [key: string]: unknown;
}

/**
 * Agent state structure
 * 
 * Similar to conversation state but for agent-level configuration.
 * Note: Conversation-level plugins take precedence over agent-level plugins.
 */
export interface AgentState {
  /**
   * OpenRouter plugins configuration (e.g., web browsing).
   * This is a fallback - conversation-level plugins override this.
   */
  plugins?: ConversationPlugin[] | null;
  
  /**
   * Messages array (ephemeral, not persisted)
   */
  messages?: unknown[];
  
  /**
   * Tools array (ephemeral, not persisted)
   */
  tools?: unknown[];
  
  /**
   * Allow other state fields for extensibility
   */
  [key: string]: unknown;
}

