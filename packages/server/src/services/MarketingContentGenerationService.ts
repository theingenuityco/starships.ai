/**
 * MarketingContentGenerationService
 *
 * Generates marketing content (problem statements text) for agent templates
 * via LLM using the Autopilot LLM node.
 */
import { ExecutionItemUtils, LLM, RunnerFactory } from '@starships/autopilot';
import type { Blueprint, EngineConfig, LlmMessage } from '@starships/autopilot';
import { getEnvConfig } from '@starships/env';
import type { AgentModel } from '@starships/protocol';

export type ProblemStatementsGenerationResult = {
  statements: string[];
  model: string;
};

export class MarketingContentGenerationService {
  /**
   * Generate problem statements text for an agent
   * Returns 4-5 user-facing problem statements that highlight common frustrations
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
    const env = getEnvConfig();
    if (!env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured on server');
    }

    // Build core capabilities string
    let coreCapabilities = '';
    if (options.agentTools && options.agentTools.length > 0) {
      coreCapabilities = options.agentTools
        .map((t) => t.name || t.slug || '')
        .filter(Boolean)
        .join(', ');
    } else {
      const parts: string[] = [];
      if (options.agentRole) parts.push(options.agentRole);
      if (options.agentDescription) {
        const desc = options.agentDescription.length > 100 
          ? options.agentDescription.slice(0, 100) + '...' 
          : options.agentDescription;
        parts.push(desc);
      }
      coreCapabilities = parts.join(' — ') || 'general assistance';
    }

    // Truncate if too long
    if (coreCapabilities.length > 200) {
      coreCapabilities = coreCapabilities.slice(0, 197) + '...';
    }

    // Build domain context
    const domainContext = options.agentDescription
      ? options.agentDescription.split(/[.!?]/)[0].trim().slice(0, 100)
      : options.agentRole || 'general assistance';

    const userPrompt = [
      `Generate 4-5 user-facing problem statements for an AI agent named "${options.agentName}".`,
      '',
      `Agent Role: ${options.agentRole || 'Assistant'}`,
      `Category: ${options.agentCategory || 'general'}`,
      `Description: ${options.agentDescription || 'General purpose assistant'}`,
      `Core Capabilities: ${coreCapabilities}`,
      `Domain Context: ${domainContext}`,
      '',
      'Requirements:',
      '- Generate 4-5 problem statements',
      '- Each statement should be a complete sentence or short phrase',
      '- Use conversational, user-first language',
      '- Be empathetic, not negative',
      '- Highlight common frustrations users face',
      '- Make them relatable and specific to this agent\'s domain',
      '- Mix formats: some can be questions ("Where do I start?"), some can be statements ("Managing emails is overwhelming...")',
      '- Keep each statement under 200 characters',
      '',
      'Output format: Return ONLY a JSON array of strings, one problem statement per string. No other text.',
      'Example: ["Managing emails is overwhelming and time-consuming", "Where do I start organizing my inbox?", "I need help prioritizing important messages"]',
    ]
      .filter(Boolean)
      .join('\n');

    // Build LLM blueprint
    const blueprint: Blueprint = {
      nodes: [
        {
          ref: 'start_1',
          type: 'start',
          name: 'Start',
          description: '',
          parameters: {},
        },
        {
          ref: 'llm_1',
          type: 'llm',
          name: 'Generate Problem Statements',
          description: '',
          parameters: {
            model: options.agentModel,
            messages: [
              {
                role: 'user',
                content: userPrompt,
              },
            ],
            temperature: 0.7,
            maxTokens: 500,
          },
        },
        {
          ref: 'end_1',
          type: 'end',
          name: 'End',
          description: '',
          parameters: {},
        },
      ],
      edges: [
        { ref: 'e1', from: 'start_1', to: 'llm_1' },
        { ref: 'e2', from: 'llm_1', to: 'end_1' },
      ],
      metadata: {},
    };

    // Execute blueprint
    const execution = ExecutionItemUtils.createExecution();
    const initial = ExecutionItemUtils.wrapSingle({});
    execution.results.push({ nodeRef: '__initial__', items: initial });

    const runnerConfig: EngineConfig = {
      runtimeEnv: {
        STARSHIP_ID: options.starshipId,
        ...options.runtimeEnv,
      },
      ...(options.engineConfigFromHost || {}),
    };

    const runner = RunnerFactory.getTopLevelRunner(execution.depth ?? 0);
    const items = await runner.run(blueprint, execution, {
      failOnNodeError: true,
      ...runnerConfig,
    });

    const result = ExecutionItemUtils.unwrapSingle(items);
    const llmOutput = typeof result === 'string' ? result : JSON.stringify(result);

    // Parse JSON array from LLM output
    let statements: string[] = [];
    try {
      // Try to extract JSON array from the response
      const jsonMatch = llmOutput.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          statements = parsed
            .filter((s) => typeof s === 'string' && s.trim().length > 0)
            .map((s) => String(s).trim())
            .slice(0, 5); // Max 5 statements
        }
      }
    } catch (err) {
      console.error('[MARKETING-CONTENT] Failed to parse problem statements JSON:', err);
    }

    // Fallback: if parsing failed, try to extract statements from text
    if (statements.length === 0) {
      const lines = llmOutput
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('```'));

      statements = lines
        .filter((line) => {
          // Look for lines that look like problem statements
          const isQuestion = line.includes('?');
          const isStatement = line.length > 20 && line.length < 200;
          return isQuestion || isStatement;
        })
        .slice(0, 5);
    }

    // Final fallback: generate generic statements
    if (statements.length === 0) {
      statements = [
        `I need help with ${options.agentRole || 'this task'}`,
        `Where do I start with ${options.agentCategory || 'this'}`,
        `I'm struggling with ${domainContext}`,
        `Can you help me understand ${options.agentRole || 'this'}?`,
      ];
    }

    return {
      statements: statements.slice(0, 5), // Ensure max 5
      model: options.agentModel,
    };
  }
}
