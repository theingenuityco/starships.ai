import { AgentExecutorConfig } from './agent-executor-config';

export function loadAgentExecutorConfig(): Partial<AgentExecutorConfig> {
  return {
    streaming: {
      enabled: process.env.ENABLE_STREAMING_MCP !== 'false',
      progressUpdates: process.env.MCP_PROGRESS_UPDATES !== 'false',
      chunkSize: parseInt(process.env.MCP_CHUNK_SIZE || '20'),
      delayMs: parseInt(process.env.MCP_STREAM_DELAY || '10')
    },
    timeouts: {
      overall: parseInt(process.env.MCP_EXECUTOR_TIMEOUT || '300000'),
      perTool: {} // Tool-specific can be added as needed
    },
    debug: {
      verbose: process.env.MCP_EXECUTOR_DEBUG === 'true' || process.env.NODE_ENV === 'development',
      showToolCalls: process.env.MCP_SHOW_TOOL_CALLS === 'true'
    }
  };
}

/**
 * Merge partial config with defaults
 */
export function mergeConfig(
  defaults: AgentExecutorConfig,
  overrides: Partial<AgentExecutorConfig>
): AgentExecutorConfig {
  return {
    maxIterations: {
      ...defaults.maxIterations,
      ...(overrides.maxIterations || {})
    },
    timeouts: {
      ...defaults.timeouts,
      ...(overrides.timeouts || {})
    },
    streaming: {
      ...defaults.streaming,
      ...(overrides.streaming || {})
    },
    fallback: {
      ...defaults.fallback,
      ...(overrides.fallback || {})
    },
    debug: {
      ...defaults.debug,
      ...(overrides.debug || {})
    }
  };
}