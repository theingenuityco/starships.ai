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
  const { connectorTemplates, connectorSessions } = await sessionSvc.build(args.starshipId, args.authUserId);

  const llm = env.OPENROUTER_API_KEY
    ? {
        apiKey: env.OPENROUTER_API_KEY,
        baseUrl: 'https://openrouter.ai/api/v1',
      }
    : undefined;

  const engineConfig: Record<string, unknown> = {
    runtimeEnv: args.runtimeEnv,
    connectorTemplates,
    connectorSessions,
    llm,
  };

  return { engineConfig };
}
