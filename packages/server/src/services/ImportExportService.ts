import { AgentService } from '@/services/AgentService';
import {
  AgentRepository,
  ConversationParticipantRepository,
  PostgresConnection,
  RoomTablesRepository,
  RoomRepository,
  RoomTaskBoardsRepository,
  RoomToolsRepository,
  RoomViewsRepository,
  StarshipTableRepository,
  StarshipTableRowRepository,
  type StarshipTableRecord,
  type TableRef,
  StarshipRepository,
  TaskBoardRepository,
  TaskCardRepository,
  TaskColumnRepository,
  ToolRepository,
  ViewRepository,
} from '@starships/models';
import type {
  AgentExportPayloadV1,
  CreateAgentRequest,
  CreateToolRequest,
  TableExportPayloadV1,
  ImportExportContainerV1,
  ImportExportKind,
  RoomExportPayloadV1,
  StarshipImportResponse,
  TaskBoardExportPayloadV1,
  ToolExportPayloadV1,
  ViewExportPayloadV1,
} from '@starships/protocol';

export class ImportExportService {
  private agentRepo: AgentRepository;
  private toolRepo: ToolRepository;
  private starshipRepo: StarshipRepository;
  private agentService: AgentService;
  private roomRepo: RoomRepository;
  private roomViewsRepo: RoomViewsRepository;
  private roomTablesRepo: RoomTablesRepository;
  private roomTaskBoardsRepo: RoomTaskBoardsRepository;
  private roomToolsRepo: RoomToolsRepository;
  private participantRepo: ConversationParticipantRepository;
  private viewRepo: ViewRepository;
  private tableRepo: StarshipTableRepository;
  private tableRowRepo: StarshipTableRowRepository;
  private taskBoardRepo: TaskBoardRepository;
  private taskColumnRepo: TaskColumnRepository;
  private taskCardRepo: TaskCardRepository;

  constructor(connection?: PostgresConnection) {
    this.agentRepo = new AgentRepository(connection);
    this.toolRepo = new ToolRepository(connection);
    this.starshipRepo = new StarshipRepository(connection);
    this.agentService = new AgentService(connection);
    this.roomRepo = new RoomRepository();
    this.roomViewsRepo = new RoomViewsRepository();
    this.roomTablesRepo = new RoomTablesRepository();
    this.roomTaskBoardsRepo = new RoomTaskBoardsRepository();
    this.roomToolsRepo = new RoomToolsRepository();
    this.participantRepo = new ConversationParticipantRepository();
    this.viewRepo = new ViewRepository();
    this.tableRepo = new StarshipTableRepository();
    this.tableRowRepo = new StarshipTableRowRepository();
    this.taskBoardRepo = new TaskBoardRepository();
    this.taskColumnRepo = new TaskColumnRepository();
    this.taskCardRepo = new TaskCardRepository();
  }

  private buildContainer<K extends ImportExportKind>(
    kind: K,
    args: {
      fromSlug?: string;
      fromStarshipSlug?: string;
      payload: ImportExportContainerV1<K>['payload'];
    }
  ): ImportExportContainerV1<K> {
    return {
      schemaVersion: '1',
      kind,
      exportedAt: new Date().toISOString(),
      metadata: {
        ...(typeof args.fromSlug === 'string' && args.fromSlug.trim().length > 0 ? { fromSlug: args.fromSlug } : {}),
        ...(typeof args.fromStarshipSlug === 'string' && args.fromStarshipSlug.trim().length > 0
          ? { fromStarshipSlug: args.fromStarshipSlug }
          : {}),
      },
      source: {
        app: 'starships.ai',
        version: process.env.npm_package_version,
      },
      payload: args.payload,
    };
  }

  private async getStarshipSlug(starshipId: string): Promise<string | undefined> {
    const starship = await this.starshipRepo.findById(starshipId);
    return typeof starship?.slug === 'string' && starship.slug.trim().length > 0 ? starship.slug : undefined;
  }

  private async listAllTableRows(table: StarshipTableRecord): Promise<Array<{ rowKey: string | null; data: Record<string, unknown> }>> {
    const rows: Array<{ rowKey: string | null; data: Record<string, unknown> }> = [];
    let offset = 0;
    const ref: TableRef = {
      starshipId: table.starshipId,
      physicalTable: table.physicalTable,
      columns: table.columns,
      primaryKey: table.primaryKey,
    };

    while (true) {
      const page = await this.tableRowRepo.listByTable(ref, { limit: 200, offset, order: 'asc' });
      if (page.length === 0) break;
      for (const row of page) {
        rows.push({ rowKey: row.rowKey ?? null, data: row.data });
      }
      if (page.length < 200) break;
      offset += page.length;
    }

    return rows;
  }

  /**
   * Export an agent together with all tools currently assigned to it.
   *
   * Notes:
   * - Tool exports intentionally omit configuration (which may contain secrets).
   * - The returned objects are the same JSON containers used by the single-resource export endpoints.
   */
  async exportAgentBundle(
    agentId: string
  ): Promise<{
    agent: ImportExportContainerV1<'agent'>;
    tools: Array<ImportExportContainerV1<'tool'>>;
  }> {
    const bundle = await this.exportAgentsBundle([agentId]);
    if (bundle.agents.length !== 1) {
      throw new Error('Unexpected export result: agent bundle must contain exactly one agent');
    }
    return { agent: bundle.agents[0], tools: bundle.tools };
  }

  /**
   * Export multiple agents and the union of their assigned tools (deduped).
   */
  async exportAgentsBundle(
    agentIds: string[]
  ): Promise<{
    agents: Array<ImportExportContainerV1<'agent'>>;
    tools: Array<ImportExportContainerV1<'tool'>>;
  }> {
    const ids = Array.isArray(agentIds) ? agentIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
    if (ids.length === 0) {
      return { agents: [], tools: [] };
    }

    const agentModels = await Promise.all(
      ids.map(async (id) => {
        const agent = await this.agentRepo.findById(id);
        if (!agent) throw new Error('Agent not found');
        return agent;
      })
    );

    const starshipSlugById = new Map<string, string | undefined>();
    const agents: Array<ImportExportContainerV1<'agent'>> = [];
    const toolIdSet = new Set<string>();

    for (const agent of agentModels) {
      let fromStarshipSlug = starshipSlugById.get(agent.starshipId);
      if (fromStarshipSlug === undefined) {
        fromStarshipSlug = await this.getStarshipSlug(agent.starshipId);
        starshipSlugById.set(agent.starshipId, fromStarshipSlug);
      }

      const assignedTools = await this.agentRepo.getAgentTools(agent.id, agent.starshipId);
      for (const t of assignedTools) {
        if (t?.id) toolIdSet.add(String(t.id));
      }
      const assignedToolSlugs = assignedTools.map((t) => t.slug).filter((s) => typeof s === 'string' && s.trim().length > 0);

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
        },
        assignedToolSlugs,
      };

      agents.push(
        this.buildContainer('agent', {
          fromSlug: agent.slug,
          fromStarshipSlug,
          payload,
        })
      );
    }

    const tools = await Promise.all(Array.from(toolIdSet).map((toolId) => this.exportTool(toolId)));
    return { agents, tools };
  }

  async exportRoomBundle(
    roomConversationId: string
  ): Promise<{
    room: ImportExportContainerV1<'room'>;
    agents: Array<ImportExportContainerV1<'agent'>>;
    views: Array<ImportExportContainerV1<'view'>>;
    tables: Array<ImportExportContainerV1<'table'>>;
    taskBoards: Array<ImportExportContainerV1<'task_board'>>;
    tools: Array<ImportExportContainerV1<'tool'>>;
  }> {
    const room = await this.roomRepo.findByConversationId(roomConversationId);
    if (!room) {
      throw new Error('Room not found');
    }

    const [viewPins, tablePins, taskBoardPins, toolAssignments, participants] = await Promise.all([
      this.roomViewsRepo.list(roomConversationId),
      this.roomTablesRepo.list(roomConversationId),
      this.roomTaskBoardsRepo.list(roomConversationId),
      this.roomToolsRepo.list(roomConversationId),
      this.participantRepo.listByConversation(roomConversationId),
    ]);

    const viewIds = Array.from(new Set(viewPins.map((pin) => String(pin.viewId || '')).filter(Boolean)));
    const tableIds = Array.from(new Set(tablePins.map((pin) => String(pin.tableId || '')).filter(Boolean)));
    const taskBoardIds = Array.from(new Set(taskBoardPins.map((pin) => String(pin.boardId || '')).filter(Boolean)));
    const roomToolIds = Array.from(new Set(toolAssignments.map((assignment) => String(assignment.toolId || '')).filter(Boolean)));
    const agentParticipantIds = Array.from(
      new Set(participants.map((participant) => String(participant.agentId || '')).filter(Boolean))
    );

    const [views, tables, taskBoards, roomTools, agentBundle, fromStarshipSlug] = await Promise.all([
      Promise.all(viewIds.map((id) => this.viewRepo.findById(id))),
      Promise.all(tableIds.map((id) => this.tableRepo.findById(id))),
      Promise.all(taskBoardIds.map((id) => this.taskBoardRepo.findById(id))),
      Promise.all(roomToolIds.map((id) => this.toolRepo.findById(id))),
      this.exportAgentsBundle(agentParticipantIds),
      this.getStarshipSlug(room.starshipId),
    ]);

    const viewsById = new Map(views.filter(Boolean).map((view) => [String(view!.id), view!]));
    const tablesById = new Map(tables.filter(Boolean).map((table) => [String(table!.id), table!]));
    const taskBoardsById = new Map(taskBoards.filter(Boolean).map((taskBoard) => [String(taskBoard!.id), taskBoard!]));
    const toolsById = new Map(roomTools.filter(Boolean).map((tool) => [String(tool!.id), tool!]));

    const exportedViews = await Promise.all(Array.from(viewsById.keys()).map((id) => this.exportView(id)));
    const exportedTables = await Promise.all(Array.from(tablesById.keys()).map((id) => this.exportTable(id)));
    const exportedTaskBoards = await Promise.all(Array.from(taskBoardsById.keys()).map((id) => this.exportTaskBoard(id)));

    const toolContainerBySlug = new Map<string, ImportExportContainerV1<'tool'>>();
    for (const tool of agentBundle.tools) {
      const fromSlug = typeof tool.metadata?.fromSlug === 'string' ? tool.metadata.fromSlug : '';
      if (fromSlug) toolContainerBySlug.set(fromSlug, tool);
    }

    for (const tool of toolsById.values()) {
      if (!toolContainerBySlug.has(tool.slug)) {
        toolContainerBySlug.set(tool.slug, await this.exportTool(tool.id));
      }
    }

    const payload: RoomExportPayloadV1 = {
      room: {
        name: room.name,
        isPrivate: room.isPrivate,
        topic: room.topic ?? null,
      },
      viewPins: viewPins
        .map((pin) => {
          const view = viewsById.get(String(pin.viewId || ''));
          if (!view?.slug) return null;
          return { viewSlug: view.slug, position: pin.position };
        })
        .filter(Boolean) as RoomExportPayloadV1['viewPins'],
      tablePins: tablePins
        .map((pin) => {
          const table = tablesById.get(String(pin.tableId || ''));
          if (!table?.slug) return null;
          return { tableSlug: table.slug, position: pin.position };
        })
        .filter(Boolean) as RoomExportPayloadV1['tablePins'],
      taskBoardPins: taskBoardPins
        .map((pin) => {
          const taskBoard = taskBoardsById.get(String(pin.boardId || ''));
          if (!taskBoard?.slug) return null;
          return { taskBoardSlug: taskBoard.slug, position: pin.position };
        })
        .filter(Boolean) as RoomExportPayloadV1['taskBoardPins'],
      toolAssignments: toolAssignments
        .map((assignment) => {
          const tool = toolsById.get(String(assignment.toolId || ''));
          if (!tool?.slug) return null;
          return { toolSlug: tool.slug, permission: assignment.permission };
        })
        .filter(Boolean) as RoomExportPayloadV1['toolAssignments'],
      agentParticipantSlugs: agentBundle.agents
        .map((agent) => (typeof agent.metadata?.fromSlug === 'string' ? agent.metadata.fromSlug : ''))
        .filter(Boolean),
    };

    return {
      room: this.buildContainer('room', {
        fromSlug: room.slug,
        fromStarshipSlug,
        payload,
      }),
      agents: agentBundle.agents,
      views: exportedViews,
      tables: exportedTables,
      taskBoards: exportedTaskBoards,
      tools: Array.from(toolContainerBySlug.values()),
    };
  }

  async exportAgent(agentId: string): Promise<ImportExportContainerV1<'agent'>> {
    const agent = await this.agentRepo.findById(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    const assignedTools = await this.agentRepo.getAgentTools(agent.id, agent.starshipId);
    const assignedToolSlugs = assignedTools.map((t) => t.slug).filter((s) => typeof s === 'string' && s.trim().length > 0);

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
      },
      assignedToolSlugs,
    };

    return this.buildContainer('agent', {
      fromSlug: agent.slug,
      fromStarshipSlug: await this.getStarshipSlug(agent.starshipId),
      payload,
    });
  }

  async exportView(viewId: string): Promise<ImportExportContainerV1<'view'>> {
    const view = await this.viewRepo.findById(viewId);
    if (!view) {
      throw new Error('View not found');
    }

    const payload: ViewExportPayloadV1 = {
      view: {
        name: view.name,
        description: view.description,
        root: view.root,
        runtimeConfig: view.runtimeConfig,
      },
    };

    return this.buildContainer('view', {
      fromSlug: view.slug,
      fromStarshipSlug: await this.getStarshipSlug(view.starshipId),
      payload,
    });
  }

  async exportTable(tableId: string): Promise<ImportExportContainerV1<'table'>> {
    const table = await this.tableRepo.findById(tableId);
    if (!table) {
      throw new Error('Table not found');
    }

    const payload: TableExportPayloadV1 = {
      table: {
        name: table.name,
        description: table.description,
        columns: table.columns,
        ...(table.primaryKey !== undefined ? { primaryKey: table.primaryKey ?? null } : {}),
      },
      rows: await this.listAllTableRows(table),
    };

    return this.buildContainer('table', {
      fromSlug: table.slug,
      fromStarshipSlug: await this.getStarshipSlug(table.starshipId),
      payload,
    });
  }

  async exportTaskBoard(taskBoardId: string): Promise<ImportExportContainerV1<'task_board'>> {
    const taskBoard = await this.taskBoardRepo.findById(taskBoardId);
    if (!taskBoard) {
      throw new Error('Task board not found');
    }

    const [columns, cards] = await Promise.all([
      this.taskColumnRepo.listByBoard(taskBoard.id),
      this.taskCardRepo.listByBoard(taskBoard.id, { includeArchived: true }),
    ]);

    const columnById = new Map(columns.map((column) => [String(column.id), column]));
    const agentIds = Array.from(new Set(cards.map((card) => String(card.assigneeAgentId || '')).filter(Boolean)));
    const assigneeAgents = await Promise.all(agentIds.map((id) => this.agentRepo.findById(id)));
    const assigneeAgentSlugById = new Map(
      assigneeAgents.filter(Boolean).map((agent) => [String(agent!.id), String(agent!.slug || '')])
    );

    const payload: TaskBoardExportPayloadV1 = {
      taskBoard: {
        name: taskBoard.name,
        description: taskBoard.description,
        pos: taskBoard.pos,
        createDefaultColumns: false,
      },
      columns: columns.map((column) => ({
        title: column.title,
        ...(column.key !== undefined ? { key: column.key ?? null } : {}),
        pos: column.pos,
        ...(column.wipLimit !== undefined ? { wipLimit: column.wipLimit ?? null } : {}),
      })),
      cards: cards
        .map((card) => {
          const column = columnById.get(String(card.columnId || ''));
          if (!column) return null;
          return {
            title: card.title,
            description: card.description,
            pos: card.pos,
            ...(card.priority !== undefined ? { priority: card.priority ?? null } : {}),
            archived: card.archived,
            columnTitle: column.title,
            ...(column.key !== undefined ? { columnKey: column.key ?? null } : {}),
            ...(card.assigneeAgentId
              ? { assigneeAgentSlug: assigneeAgentSlugById.get(String(card.assigneeAgentId)) ?? null }
              : {}),
            ...(card.assigneeUserId ? { assigneeUserSlug: `u:${String(card.assigneeUserId)}` } : {}),
          };
        })
        .filter(Boolean) as TaskBoardExportPayloadV1['cards'],
    };

    return this.buildContainer('task_board', {
      fromSlug: taskBoard.slug,
      fromStarshipSlug: await this.getStarshipSlug(taskBoard.starshipId),
      payload,
    });
  }

  async exportTool(toolId: string): Promise<ImportExportContainerV1<'tool'>> {
    const tool = await this.toolRepo.findById(toolId);
    if (!tool) {
      throw new Error('Tool not found');
    }

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
      },
    };

    return this.buildContainer('tool', {
      fromSlug: tool.slug,
      fromStarshipSlug: await this.getStarshipSlug(tool.starshipId),
      payload,
    });
  }

  async importToStarship(starshipId: string, container: ImportExportContainerV1): Promise<StarshipImportResponse> {
    const starship = await this.starshipRepo.findById(starshipId);
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
