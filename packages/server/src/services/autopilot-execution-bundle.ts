import { getEnvConfig } from '@starships/env';
import type { EngineConfig } from '@starships/autopilot';
import type { ConnectorTemplateRuntimeFieldsV2 } from '@starships/protocol';
import type { ConnectorSession } from '@/services/ConnectorActionSessionService';

export function buildAutopilotRuntimeEnv(args: { starshipId: string; conversationId: string; agentId: string }): Record<string, unknown> {
  const env = getEnvConfig();
  return {
    STARSHIP_ID: args.starshipId,
    CONVERSATION_ID: args.conversationId,
    AGENT_ID: args.agentId,
    SERVER_URL: env.SERVER_URL,
  };
}

export interface AutopilotRunnerExecuteConfig extends EngineConfig {
  /**
   * Connector templates (safe) passed from embedding host.
   * Keyed by provider/slug.
   */
  connectorTemplates: Record<string, ConnectorTemplateRuntimeFieldsV2 | undefined>;
  /**
   * Connector sessions (auth headers) passed from embedding host.
   * Keyed by provider/slug.
   */
  connectorSessions: Record<string, ConnectorSession | undefined>;
  /**
   * Connector instance metadata (non-secret) passed from embedding host.
   * Keyed by provider/slug.
   */
  connectorMetadata: Record<string, Record<string, unknown> | undefined>;
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

  const sessionSvc = new (await import('@/services/ConnectorActionSessionService')).ConnectorActionSessionService();
  const { connectorTemplates, connectorSessions, connectorMetadata } = await sessionSvc.build(args.starshipId, args.authUserId);

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

  const engineConfig: AutopilotRunnerExecuteConfig = {
    runtimeEnv: args.runtimeEnv,
    connectorTemplates: connectorTemplates as Record<string, ConnectorTemplateRuntimeFieldsV2 | undefined>,
    connectorSessions: connectorSessions as Record<string, ConnectorSession | undefined>,
    connectorMetadata: connectorMetadata as Record<string, Record<string, unknown> | undefined>,
    llm,
    aws,
    azureAiFoundry,
    modelRoutes,
  };

  return { engineConfig };
}
