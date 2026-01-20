import { getEnvConfig } from '@starships/env';

export function buildAutopilotRuntimeEnv(args: { starshipId: string; conversationId: string; agentId: string }): Record<string, unknown> {
  const env = getEnvConfig();
  return {
    STARSHIP_ID: args.starshipId,
    CONVERSATION_ID: args.conversationId,
    AGENT_ID: args.agentId,
    SERVER_URL: env.SERVER_URL,
  };
}

export async function buildAutopilotExecutionBundle(args: {
  starshipId: string;
  authUserId: string;
  runtimeEnv: Record<string, unknown>;
}): Promise<{
  engineConfig: Record<string, unknown>;
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

  const engineConfig: Record<string, unknown> = {
    runtimeEnv: args.runtimeEnv,
    connectorTemplates,
    connectorSessions,
    connectorMetadata,
    llm,
    aws,
    modelRoutes,
  };

  return { engineConfig };
}
