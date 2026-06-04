/**
 * MarketingContentGenerationService
 *
 * STUB: previously generated problem-statement text via the autopilot DAG LLM node.
 * The DAG engine was removed; this temporarily returns generic statements so agent
 * creation/marketing flows keep working. Reimplement as a direct OpenRouter call.
 */
import type { Blueprint } from '@starships/protocol';

export type ProblemStatementsGenerationResult = {
  statements: string[];
  model: string;
};

export class MarketingContentGenerationService {
  /**
   * STUB: returns generic, domain-flavored problem statements without an LLM call.
   */
  async generateProblemStatements(options: {
    agentName: string;
    agentRole?: string;
    agentDescription?: string;
    agentCategory?: string;
    agentTools?: Array<{ name?: string; slug?: string; description?: string }>;
    agentModel: string;
    agentBlueprint: Blueprint;
    starshipId: string;
    runtimeEnv?: Record<string, unknown>;
    engineConfigFromHost?: Record<string, unknown>;
  }): Promise<ProblemStatementsGenerationResult> {
    const domainContext = options.agentDescription
      ? options.agentDescription.split(/[.!?]/)[0].trim().slice(0, 100)
      : options.agentRole || 'general assistance';

    return {
      statements: [
        `I need help with ${options.agentRole || 'this task'}`,
        `Where do I start with ${options.agentCategory || 'this'}`,
        `I'm struggling with ${domainContext}`,
      ],
      model: options.agentModel,
    };
  }
}
