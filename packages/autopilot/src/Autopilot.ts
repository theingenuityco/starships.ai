/**
 * Autopilot Configuration Manager
 *
 * Central credential manager and configuration store for the Autopilot system.
 * Provides secure access to API keys and other sensitive configuration without
 * storing them in blueprints or database.
 */

export interface AutopilotCredentials {
  openrouterApiKey?: string;
  // Add other API keys here as needed
  // anthropicApiKey?: string;
  // openaiApiKey?: string;
}

export interface AutopilotConfig {
  credentials: AutopilotCredentials;
  // Add other configuration as needed
  // defaultTimeout?: number;
  // maxRetries?: number;
}

class AutopilotManager {
  private config: AutopilotConfig;

  constructor(config?: Partial<AutopilotConfig>) {
    this.config = {
      credentials: {},
      ...config,
    };
  }

  /**
   * Set credentials
   */
  setCredentials(credentials: Partial<AutopilotCredentials>): void {
    this.config.credentials = {
      ...this.config.credentials,
      ...credentials,
    };
  }

  /**
   * Get OpenRouter API key
   */
  getOpenRouterApiKey(): string | undefined {
    return this.config.credentials.openrouterApiKey;
  }

  /**
   * Get all credentials (read-only copy)
   */
  getCredentials(): AutopilotCredentials {
    return { ...this.config.credentials };
  }

  /**
   * Get full configuration (read-only copy)
   */
  getConfig(): AutopilotConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * Check if OpenRouter API key is available
   */
  hasOpenRouterApiKey(): boolean {
    return !!this.config.credentials.openrouterApiKey;
  }

  /**
   * Reset configuration (useful for testing)
   */
  reset(): void {
    this.config = {
      credentials: {},
    };
  }
}

// Initialize with empty credentials - must be configured manually
export const autopilot = new AutopilotManager({
  credentials: {},
});

// Export the class for type checking if needed
export { AutopilotManager };
