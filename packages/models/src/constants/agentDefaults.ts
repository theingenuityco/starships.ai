/**
 * Central defaults and numeric bounds for agent configuration.
 *
 * These values are shared between:
 * - Agent creation (AgentRepository / AgentService)
 * - Agent and AgentTemplate entity validation
 * - Publication workflow when promoting agents to templates
 */

// Temperature (creativity) settings
export const MIN_AGENT_TEMPERATURE = 0;
export const MAX_AGENT_TEMPERATURE = 2;
export const DEFAULT_AGENT_TEMPERATURE = 0.7;

// Token limits
export const MIN_AGENT_MAX_TOKENS = 1;
export const MAX_AGENT_MAX_TOKENS = 100000;
export const DEFAULT_AGENT_MAX_TOKENS = 4000;

// Timeout (milliseconds)
export const MIN_AGENT_TIMEOUT_MS = 1000;
export const MAX_AGENT_TIMEOUT_MS = 600000;
export const DEFAULT_AGENT_TIMEOUT_MS = 30000;

