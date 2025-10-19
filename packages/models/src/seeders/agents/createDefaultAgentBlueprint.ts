import { Agent, Blueprint } from '@starships/autopilot';

export interface DefaultBlueprintConfig {
  name: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export function createDefaultAgentBlueprint(config: DefaultBlueprintConfig): Blueprint {
  const agent = new Agent({
    name: config.name,
    model: config.model,
    ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
    ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
  });

  return agent.getCurrentBlueprint();
}
