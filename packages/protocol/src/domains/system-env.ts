/**
 * System Environment Types
 *
 * Summary of system-level environment variables that are made available to the
 * Autopilot runtime as non-secret configuration (for example via runtimeEnv).
 *
 * NOTE: This is about process/host configuration keys, not DB-backed secrets.
 */

export interface SystemEnvironmentVariableSummary {
  /**
   * Name of the configuration key available at runtime (e.g. OPEN_ROUTER_KEY, DISCORD_BOT_TOKEN).
   */
  key: string;
  /**
   * Whether this key is currently configured and will be present at runtime.
   */
  present: boolean;
  /**
   * Optional human-readable description of what this key is used for.
   */
  description?: string;
}

export interface SystemEnvironmentVariableListResponse {
  systemEnv: SystemEnvironmentVariableSummary[];
}
