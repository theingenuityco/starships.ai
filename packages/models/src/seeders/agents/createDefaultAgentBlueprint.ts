import { Agent, Blueprint } from '@starships/autopilot';

/**
 * Generate the standard "tool-ready" agent blueprint.
 *
 * IMPORTANT: This blueprint intentionally does NOT bake in LLM settings like model/temperature.
 * Those are resolved at execution time via templates from `execution.state` (see Agent.defaultAgentBlueprint()).
 */
export function createDefaultAgentBlueprint(): Blueprint {
  return Agent.defaultAgentBlueprint();
}
