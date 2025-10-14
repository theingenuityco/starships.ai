/**
 * Autopilot Configuration Manager
 *
 * Central configuration store for the Autopilot system.
 * Credentials are provided via secureEnv at execution time; none are stored here.
 */

export interface AutopilotConfig {
  // Remote runner configuration (server sets these)
  remoteRunnerUrl?: string;
  remoteRunnerToken?: string;
}

class AutopilotManager {
  private config: AutopilotConfig;

  constructor(config?: Partial<AutopilotConfig>) {
    this.config = { ...config } as AutopilotConfig;
  }

  /**
   * Configure remote runner endpoint and token
   */
  setRunnerConfig(opts: { url?: string; token?: string }): void {
    if (typeof opts.url === 'string' && opts.url.length > 0) this.config.remoteRunnerUrl = opts.url;
    if (typeof opts.token === 'string' && opts.token.length > 0) this.config.remoteRunnerToken = opts.token;
  }

  /**
   * Get full configuration (read-only copy)
   */
  getConfig(): AutopilotConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * Reset configuration (useful for testing)
   */
  reset(): void {
    this.config = {} as AutopilotConfig;
  }
}

// Initialize with empty configuration
export const autopilot = new AutopilotManager({});

// Export the class for type checking if needed
export { AutopilotManager };
