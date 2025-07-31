export interface AgentExecutorConfig {
  maxIterations: {
    default: number;
    byToolType: Record<string, number>;
  };
  timeouts: {
    overall: number;
    perTool: Record<string, number>;
  };
  streaming: {
    enabled: boolean;
    progressUpdates: boolean;
    chunkSize: number;
    delayMs: number;
  };
  fallback: {
    enabled: boolean;
    useNonStreaming: boolean;
  };
  debug: {
    verbose: boolean;
    showToolCalls: boolean;
  };
}

export const DEFAULT_AGENT_EXECUTOR_CONFIG: AgentExecutorConfig = {
  maxIterations: {
    default: 10,
    byToolType: {
      'sequentialthinking': 20,
      'web': 10,
      'puppeteer': 10,
      'webscraper': 10
    }
  },
  timeouts: {
    overall: 300000, // 5 minutes
    perTool: {
      'sequentialthinking': 120000, // 2 minutes
      'web': 60000, // 1 minute
      'puppeteer': 60000,
      'webscraper': 60000
    }
  },
  streaming: {
    enabled: process.env.ENABLE_STREAMING_MCP !== 'false',
    progressUpdates: true,
    chunkSize: 20,
    delayMs: 10
  },
  fallback: {
    enabled: true,
    useNonStreaming: true
  },
  debug: {
    verbose: true, // Force verbose for debugging
    showToolCalls: true
  }
};