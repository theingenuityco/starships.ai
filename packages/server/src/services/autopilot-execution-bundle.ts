import { getEnvConfig } from '@starships/env';

export function buildAutopilotRuntimeEnv(args: {
  starshipId: string;
  conversationId: string;
  /** Room id for room conversations + room threads; absent outside rooms. */
  roomId?: string;
  /** Authenticated user id for provider-side attribution (opaque, stable). */
  authUserId?: string;
  agentId: string;
  /**
   * Optional id of the assistant message that contains the currently executing tool call.
   * This is resolved server-side per toolCallId and is safe to treat as per-tool-call context.
   */
  toolCallMessageId?: string;
}): Record<string, unknown> {
  const env = getEnvConfig();
  return {
    STARSHIP_ID: args.starshipId,
    CONVERSATION_ID: args.conversationId,
    ...(args.roomId ? { ROOM_ID: args.roomId } : {}),
    ...(typeof args.authUserId === 'string' && args.authUserId.trim().length > 0 ? { AUTH_USER_ID: args.authUserId.trim() } : {}),
    AGENT_ID: args.agentId,
    ...(args.toolCallMessageId ? { TOOL_CALL_MESSAGE_ID: args.toolCallMessageId } : {}),
    SERVER_URL: env.SERVER_URL,
  };
}

export interface AutopilotRunnerExecuteConfig {
  /**
   * Make this structurally compatible with places that expect a generic JSON map.
   * (Many call sites treat runnerConfig/engineConfigFromHost as Record<string, unknown>.)
   */
  [key: string]: unknown;
  /** Per-execution runtime context (STARSHIP_ID, CONVERSATION_ID, ...). */
  runtimeEnv?: Record<string, unknown>;
  /**
   * Server callback for connector action execution (server-authority mode). The runner
   * delegates every connector action to the host via this endpoint; connector templates,
   * sessions, and credentials are NOT shipped to the runner.
   */
  connectorActionCallback?: {
    url: string;
    secret?: string;
    starshipId?: string;
    authUserId?: string;
  };
  /**
   * Optional LLM runtime configuration used by runner HostRuntime.llm.
   */
  llm?: {
    apiKey: string;
    baseUrl?: string;
  };
  /**
   * AWS runtime configuration for Bedrock.
   */
  aws: {
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
  };
  /**
   * Azure AI Foundry runtime configuration.
   */
  azureAiFoundry?: {
    apiKey: string;
    endpoint: string;
    apiVersion?: string;
  };
  /**
   * Model routing table.
   */
  modelRoutes?: Record<string, Array<{ provider: string; providerModelId: string }> | undefined>;
}

export async function buildAutopilotExecutionBundle(args: {
  starshipId: string;
  authUserId: string;
  runtimeEnv: Record<string, unknown>;
}): Promise<{
  engineConfig: AutopilotRunnerExecuteConfig;
}> {
  const env = getEnvConfig();
  // Ensure provider-side end-user attribution is always available to the runner/LLM node.
  // This should be an opaque internal id (no direct PII).
  try {
    if (typeof args.authUserId === 'string' && args.authUserId.trim().length > 0) {
      args.runtimeEnv = { ...args.runtimeEnv, AUTH_USER_ID: args.authUserId.trim() };
    }
  } catch {
    // best-effort only
  }

  const { LlmModelRepository } = await import('@starships/models');
  const llmModelRepo = new LlmModelRepository();
  const providers = await llmModelRepo.getAllModelProviders({ enabledOnly: true });

  // Build a routing table that preserves provider priority per model.
  // The repository already orders by model ASC, priority DESC, so we can
  // append in that order to get highest-priority first.
  const modelRoutes: Record<string, { provider: string; providerModelId: string }[]> = {};
  for (const p of providers) {
    if (!modelRoutes[p.model]) {
      modelRoutes[p.model] = [];
    }
    modelRoutes[p.model].push({
      provider: p.provider,
      providerModelId: p.providerModelId,
    });
  }

  const llm = env.OPENROUTER_API_KEY
    ? {
        apiKey: env.OPENROUTER_API_KEY,
        baseUrl: 'https://openrouter.ai/api/v1',
      }
    : undefined;

  const aws = {
    accessKeyId: process.env.AWS_BEDROCK_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_BEDROCK_SECRET_ACCESS_KEY,
    region: process.env.AWS_BEDROCK_REGION,
  };

  const azureAiFoundry =
    env.AZURE_AI_FOUNDRY_API_KEY && env.AZURE_AI_FOUNDRY_ENDPOINT
      ? {
          apiKey: env.AZURE_AI_FOUNDRY_API_KEY,
          endpoint: env.AZURE_AI_FOUNDRY_ENDPOINT,
          apiVersion: env.AZURE_AI_FOUNDRY_API_VERSION,
        }
      : undefined;

  const serverUrl = String(env.SERVER_URL ?? '').replace(/\/+$/, '');
  const connectorActionCallback = serverUrl
    ? {
        url: `${serverUrl}/api/v1/internal/connector-action`,
        secret: process.env.RUNNER_INTERNAL_SECRET,
        starshipId: args.starshipId,
        authUserId: args.authUserId,
      }
    : undefined;

  const engineConfig: AutopilotRunnerExecuteConfig = {
    runtimeEnv: args.runtimeEnv,
    connectorActionCallback,
    llm,
    aws,
    azureAiFoundry,
    modelRoutes,
  };

  return { engineConfig };
}
