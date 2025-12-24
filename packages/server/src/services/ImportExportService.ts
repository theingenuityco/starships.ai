import { AgentService } from '@/services/AgentService';
import { StarshipService } from '@/services/StarshipService';
import { AgentRepository, ToolRepository } from '@starships/models';
import type {
  AgentExportPayloadV1,
  ImportExportContainerV1,
  ImportExportKind,
  StarshipImportResponse,
  ToolExportPayloadV1,
} from '@starships/protocol';

export class ImportExportService {
  private agentRepo: AgentRepository;
  private toolRepo: ToolRepository;
  private agentService: AgentService;
  private starshipService: StarshipService;

  constructor() {
    this.agentRepo = new AgentRepository();
    this.toolRepo = new ToolRepository();
    this.agentService = new AgentService();
    this.starshipService = new StarshipService();
  }

  async exportAgent(agentId: string): Promise<ImportExportContainerV1<'agent'>> {
    const agent = await this.agentRepo.findById(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    const assignedTools = await this.agentRepo.getAgentTools(agent.id, agent.starshipId);
    const assignedToolSlugs = assignedTools.map((t) => t.slug).filter((s) => typeof s === 'string' && s.trim().length > 0);

    // Create-compatible export shape
    const payload: AgentExportPayloadV1 = {
      agent: {
        name: agent.name,
        slug: agent.slug,
        description: agent.description,
        model: agent.model,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        timeout: agent.timeout,
        reasoning: (agent as any).reasoning,
        systemPrompt: agent.systemPrompt,
        state: agent.state,
        blueprint: agent.blueprint,
        category: agent.category,
        previewPrompts: agent.previewPrompts,
        avatarPrompt: agent.avatarPrompt,
      } as any,
      assignedToolSlugs,
    };

    return {
      schemaVersion: '1',
      kind: 'agent',
      exportedAt: new Date().toISOString(),
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

    const payload: ToolExportPayloadV1 = {
      tool: {
        name: tool.name,
        slug: tool.slug,
        description: tool.description,
        parameters: tool.parameters,
        blueprint: tool.blueprint,
        transforms: (tool as any).transforms,
        mutations: (tool as any).mutations,
        condition: (tool as any).condition,
        isEnabled: tool.isEnabled,
        status: tool.status,
        version: tool.version,
        templateSnapshotAt: tool.templateSnapshotAt,
      } as any,
    };

    return {
      schemaVersion: '1',
      kind: 'tool',
      exportedAt: new Date().toISOString(),
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

    const kind: ImportExportKind = container.kind as ImportExportKind;
    const warnings: string[] = [];

    if (kind === 'tool') {
      const toolPayload = (container as ImportExportContainerV1<'tool'>).payload;
      const t = toolPayload.tool as any;

      const created = await this.toolRepo.createImported(
        {
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
          version: t.version,
          templateSnapshotAt: t.templateSnapshotAt,
          // allow explicit slug for import
          slug: t.slug,
        } as any,
        starshipId
      );

      return { kind: 'tool', tool: created, warnings: warnings.length ? warnings : undefined };
    }

    if (kind === 'agent') {
      const agentPayload = (container as ImportExportContainerV1<'agent'>).payload;
      const a = agentPayload.agent as any;
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

      const created = await this.agentService.createAgent({
        starshipId,
        name: a.name,
        slug: a.slug,
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
        avatarPrompt: a.avatarPrompt,
        assignedToolSlugs: requestedToolSlugs,
      } as any);

      return { kind: 'agent', agent: created, warnings: warnings.length ? warnings : undefined };
    }

    throw new Error(`Unsupported import kind: ${String((container as any)?.kind)}`);
  }
}


