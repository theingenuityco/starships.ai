import { AgentService } from '@/services/AgentService';
import { StarshipService } from '@/services/StarshipService';
import { AgentRepository, StarshipRepository, ToolRepository } from '@starships/models';
import type {
  AgentExportPayloadV1,
  CreateAgentRequest,
  CreateToolRequest,
  ImportExportContainerV1,
  ImportExportKind,
  StarshipImportResponse,
  ToolExportPayloadV1,
} from '@starships/protocol';

export class ImportExportService {
  private agentRepo: AgentRepository;
  private toolRepo: ToolRepository;
  private starshipRepo: StarshipRepository;
  private agentService: AgentService;
  private starshipService: StarshipService;

  constructor() {
    this.agentRepo = new AgentRepository();
    this.toolRepo = new ToolRepository();
    this.starshipRepo = new StarshipRepository();
    this.agentService = new AgentService();
    this.starshipService = new StarshipService();
  }

  async exportAgent(agentId: string): Promise<ImportExportContainerV1<'agent'>> {
    const agent = await this.agentRepo.findById(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    const starship = await this.starshipRepo.findById(agent.starshipId);

    const assignedTools = await this.agentRepo.getAgentTools(agent.id, agent.starshipId);
    const assignedToolSlugs = assignedTools.map((t) => t.slug).filter((s) => typeof s === 'string' && s.trim().length > 0);

    // Create-compatible export shape
    const payload: AgentExportPayloadV1 = {
      agent: {
        name: agent.name,
        role: agent.role || 'Assistant',
        description: agent.description,
        model: agent.model,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        timeout: agent.timeout,
        reasoning: agent.reasoning,
        systemPrompt: agent.systemPrompt,
        state: agent.state,
        blueprint: agent.blueprint,
        category: agent.category,
        previewPrompts: agent.previewPrompts,
        // NOTE: avatarPrompt is not part of CreateAgentRequest (and createAgent currently ignores it),
        // so we intentionally do not export it as part of the create-compatible payload.
      },
      assignedToolSlugs,
    };

    return {
      schemaVersion: '1',
      kind: 'agent',
      exportedAt: new Date().toISOString(),
      metadata: {
        fromSlug: agent.slug,
        fromStarshipSlug: starship?.slug,
      },
      source: {
        app: 'starships.ai',
        version: process.env.npm_package_version,
      },
      payload,
    };
  }

  async exportTool(toolId: string): Promise<ImportExportContainerV1<'tool'>> {
    const tool = await this.toolRepo.findById(toolId);
    if (!tool) {
      throw new Error('Tool not found');
    }

    const starship = await this.starshipRepo.findById(tool.starshipId);

    const payload: ToolExportPayloadV1 = {
      tool: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        blueprint: tool.blueprint,
        transforms: tool.transforms,
        mutations: tool.mutations,
        condition: tool.condition,
        isEnabled: tool.isEnabled,
        status: tool.status,
        // Intentionally do not export versioning fields. Import should behave like a fresh copy.
      },
    };

    return {
      schemaVersion: '1',
      kind: 'tool',
      exportedAt: new Date().toISOString(),
      metadata: {
        fromSlug: tool.slug,
        fromStarshipSlug: starship?.slug,
      },
      source: {
        app: 'starships.ai',
        version: process.env.npm_package_version,
      },
      payload,
    };
  }

  async importToStarship(starshipId: string, container: ImportExportContainerV1): Promise<StarshipImportResponse> {
    const starship = await this.starshipService.getStarship(starshipId);
    if (!starship) {
      throw new Error('Starship not found');
    }

    const warnings: string[] = [];

    const isKind = <K extends ImportExportKind>(c: ImportExportContainerV1, expected: K): c is ImportExportContainerV1<K> =>
      c.kind === expected;

    if (isKind(container, 'tool')) {
      const toolPayload = container.payload;
      const t = toolPayload.tool;

      // IMPORTANT: On import, do not reuse the exported slug (even debug metadata).
      // Always let the system generate a new unique slug for the destination starship.
      const fromSlug = container.metadata?.fromSlug;
      if (typeof fromSlug === 'string' && fromSlug.trim().length > 0) {
        warnings.push(`Tool slug will be regenerated on import (source slug: ${fromSlug}).`);
      }

      if (typeof t?.name !== 'string' || t.name.trim().length === 0) {
        throw new Error('Invalid import payload: tool.name is required');
      }

      const createToolData: CreateToolRequest = {
        name: t.name,
        // Keep description defaulting consistent with other flows
        description: typeof t.description === 'string' ? t.description : '',
        parameters: t.parameters,
        blueprint: t.blueprint,
        transforms: t.transforms,
        mutations: t.mutations,
        condition: t.condition,
        isEnabled: t.isEnabled,
        status: t.status,
        // Intentionally ignore versioning fields (version/templateSnapshotAt) on import.
      };

      const created = await this.toolRepo.create(createToolData, starshipId);

      return { kind: 'tool', tool: created, warnings: warnings.length ? warnings : undefined };
    }

    if (isKind(container, 'agent')) {
      const agentPayload = container.payload;
      const a = agentPayload.agent;
      const requestedToolSlugs = Array.isArray(agentPayload.assignedToolSlugs) ? agentPayload.assignedToolSlugs : [];

      // Build warnings for missing tools (we still import agent and silently skip missing relations).
      if (requestedToolSlugs.length > 0) {
        const found = await this.toolRepo.findBySlugs(requestedToolSlugs, starshipId);
        const foundSet = new Set(found.map((t) => t.slug));
        const missing = requestedToolSlugs.filter((s) => !foundSet.has(s));
        if (missing.length > 0) {
          warnings.push(`Skipped ${missing.length} missing tool assignment(s): ${missing.join(', ')}`);
        }
      }

      if (typeof a?.name !== 'string' || a.name.trim().length === 0) {
        throw new Error('Invalid import payload: agent.name is required');
      }
      if (typeof a?.model !== 'string' || a.model.trim().length === 0) {
        throw new Error('Invalid import payload: agent.model is required');
      }

      const createAgentData: CreateAgentRequest & { starshipId: string } = {
        starshipId,
        name: a.name,
        role: typeof a.role === 'string' && a.role.trim().length > 0 ? a.role : 'Assistant',
        description: a.description,
        model: a.model,
        temperature: a.temperature,
        maxTokens: a.maxTokens,
        timeout: a.timeout,
        reasoning: a.reasoning,
        systemPrompt: a.systemPrompt,
        state: a.state,
        blueprint: a.blueprint,
        category: a.category,
        previewPrompts: a.previewPrompts,
        assignedToolSlugs: requestedToolSlugs,
      };

      const created = await this.agentService.createAgent(createAgentData);

      return { kind: 'agent', agent: created, warnings: warnings.length ? warnings : undefined };
    }

    throw new Error(`Unsupported import kind: ${String(container.kind)}`);
  }
}
