/**
 * MarketingContentGenerationService
 *
 * Generates marketing content (problem statements text) for agent templates
 * via LLM using the Autopilot LLM node.
 */
import { ExecutionItemUtils, RunnerFactory } from '@starships/autopilot';
import type { Blueprint, EngineConfig } from '@starships/autopilot';
import { getEnvConfig } from '@starships/env';

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
        const desc = options.agentDescription.length > 100 ? options.agentDescription.slice(0, 100) + '...' : options.agentDescription;
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
      `Generate exactly 3 user-facing problem statements for an AI agent named "${options.agentName}".`,
      '',
      `Agent Role: ${options.agentRole || 'Assistant'}`,
      `Category: ${options.agentCategory || 'general'}`,
      `Description: ${options.agentDescription || 'General purpose assistant'}`,
      `Core Capabilities: ${coreCapabilities}`,
      `Domain Context: ${domainContext}`,
      '',
      'Requirements:',
      '- Generate exactly 3 problem statements (no more, no less)',
      '- Each statement should be a complete sentence or short phrase',
      '- Use conversational, user-first language',
      '- Be empathetic, not negative',
      '- Highlight common frustrations users face',
      "- Make them relatable and specific to this agent's domain",
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

    // Extract LLM node output from execution results
    const extractNodeJsonFromExecutionResults = (value: unknown, nodeRef: string): unknown => {
      if (!Array.isArray(value)) return undefined;
      // Take the last recorded output for the nodeRef
      for (let i = value.length - 1; i >= 0; i--) {
        const entry = value[i];
        if (!entry || typeof entry !== 'object') continue;
        const rec = entry as Record<string, unknown>;
        if (rec.nodeRef !== nodeRef) continue;
        const items = rec.items;
        if (!Array.isArray(items) || items.length === 0) return undefined;
        const last = items[items.length - 1];
        if (!last || typeof last !== 'object') return undefined;
        return (last as Record<string, unknown>).json;
      }
      return undefined;
    };

    const llmJson = ExecutionItemUtils.unwrapSingle(items);
    let llmNodeJson: unknown = llmJson;

    if (Array.isArray(llmJson)) {
      const extracted = extractNodeJsonFromExecutionResults(llmJson, 'llm_1');
      if (typeof extracted === 'undefined') {
        throw new Error(`Problem statements generation returned execution.results but did not include output for nodeRef "llm_1"`);
      }
      llmNodeJson = extracted;
    }

    // Unwrap LLM response to get message content
    type AnyRecord = Record<string, unknown>;
    const isRecord = (v: unknown): v is AnyRecord => !!v && typeof v === 'object' && !Array.isArray(v);

    const unwrapResponse = (value: unknown): unknown => {
      if (!isRecord(value)) return value;
      const topChoices = value.choices;
      if (Array.isArray(topChoices)) return value;
      for (const key of ['response', 'data', 'result'] as const) {
        const nested = value[key];
        if (isRecord(nested) && Array.isArray(nested.choices)) return nested;
      }
      return value;
    };

    const response = unwrapResponse(llmNodeJson);
    const responseRec = isRecord(response) ? response : undefined;
    const choices = responseRec?.choices;
    const choice0 = Array.isArray(choices) ? choices[0] : undefined;
    const choice0Rec = isRecord(choice0) ? choice0 : undefined;
    const msg = (choice0Rec && isRecord(choice0Rec.message) ? (choice0Rec.message as AnyRecord) : undefined) ?? undefined;
    const llmOutput = isRecord(msg) && typeof msg.content === 'string' ? (msg.content as string).trim() : '';

    if (!llmOutput) {
      throw new Error('Problem statements generation returned empty text');
    }

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
            .slice(0, 3); // Exactly 3 statements
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
        .slice(0, 3); // Exactly 3 statements
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
      statements: statements.slice(0, 3), // Exactly 3 statements
      model: options.agentModel,
    };
  }
}
