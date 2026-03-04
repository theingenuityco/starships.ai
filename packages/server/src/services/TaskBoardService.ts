import {
  TaskBoardRepository,
  TaskCardRepository,
  TaskColumnRepository,
  AgentRepository,
  StarshipMemberRepository,
  getConnection,
} from '@starships/models';
import { ValidationError } from '@starships/errors';
import type {
  CreateTaskBoardRequest,
  CreateTaskCardRequest,
  CreateTaskColumnRequest,
  MoveTaskCardRequest,
  TaskBoardDetailsResponse,
  TaskBoardModel,
  TaskCardModel,
  TaskColumnModel,
  TaskAssigneeRef,
  UpdateTaskBoardRequest,
  UpdateTaskCardRequest,
  UpdateTaskColumnRequest,
} from '@starships/protocol';

/**
 * TaskBoardService
 *
 * Orchestrates task boards/columns/cards operations with cross-entity validation.
 */
export class TaskBoardService {
  private readonly boards: TaskBoardRepository;
  private readonly columns: TaskColumnRepository;
  private readonly cards: TaskCardRepository;
  private readonly agents: AgentRepository;
  private readonly starshipMembers: StarshipMemberRepository;

  constructor() {
    this.boards = new TaskBoardRepository();
    this.columns = new TaskColumnRepository();
    this.cards = new TaskCardRepository();
    this.agents = new AgentRepository();
    this.starshipMembers = new StarshipMemberRepository();
  }

  async listBoards(starshipId: string, opts?: { includeArchived?: boolean }): Promise<TaskBoardModel[]> {
    return this.boards.listByStarship(starshipId, opts);
  }

  async getBoardDetails(boardId: string): Promise<TaskBoardDetailsResponse | null> {
    const board = await this.boards.findById(boardId);
    if (!board) return null;
    const cols = await this.columns.listByBoard(board.id);
    return { board, columns: cols };
  }

  async getBoardDetailsBySlug(starshipId: string, boardSlug: string): Promise<TaskBoardDetailsResponse | null> {
    const board = await this.boards.findBySlug(boardSlug, starshipId);
    if (!board) return null;
    const cols = await this.columns.listByBoard(board.id);
    return { board, columns: cols };
  }

  /**
   * Resolve a board scoped to a starship by either id or slug.
   *
   * - If `boardIdOrSlug` matches an existing board id, it must belong to the provided starship.
   * - Otherwise we treat it as a slug and look up by (starshipId, slug).
   */
  async getBoardDetailsForStarship(starshipId: string, boardIdOrSlug: string): Promise<TaskBoardDetailsResponse | null> {
    const byId = await this.getBoardDetails(boardIdOrSlug);
    if (byId) {
      if (String(byId.board.starshipId) !== String(starshipId)) return null;
      return byId;
    }
    return await this.getBoardDetailsBySlug(starshipId, boardIdOrSlug);
  }

  async createBoard(req: CreateTaskBoardRequest): Promise<TaskBoardDetailsResponse> {
    const board = await this.boards.create({
      starshipId: req.starshipId,
      name: req.name,
      slug: req.slug,
      description: req.description,
      pos: req.pos,
    });

    const explicitCols = Array.isArray(req.columns) ? req.columns : [];
    const shouldCreateDefault =
      explicitCols.length === 0 && (req.createDefaultColumns === undefined ? true : Boolean(req.createDefaultColumns));

    const colsToCreate: Array<Pick<TaskColumnModel, 'title' | 'key' | 'pos' | 'wipLimit'>> = explicitCols.length
      ? explicitCols.map((c, idx) => ({
          title: String(c.title ?? ''),
          key: c.key ?? null,
          pos: typeof c.pos === 'number' && Number.isFinite(c.pos) ? c.pos : idx + 1,
          wipLimit: c.wipLimit ?? null,
        }))
      : shouldCreateDefault
        ? [
            { title: 'Todo', key: 'todo', pos: 1, wipLimit: null },
            { title: 'Doing', key: 'doing', pos: 2, wipLimit: null },
            { title: 'Done', key: 'done', pos: 3, wipLimit: null },
          ]
        : [];

    const createdColumns: TaskColumnModel[] = [];
    for (const c of colsToCreate) {
      if (!c.title || !String(c.title).trim()) continue;
      const created = await this.columns.create({
        boardId: board.id,
        title: c.title,
        key: c.key ?? null,
        pos: c.pos,
        wipLimit: c.wipLimit ?? null,
      });
      createdColumns.push(created);
    }

    // If no columns were created (user explicitly disabled defaults), return empty list.
    const columns = createdColumns.length ? createdColumns : await this.columns.listByBoard(board.id);
    return { board, columns };
  }

  async updateBoard(boardId: string, updates: UpdateTaskBoardRequest): Promise<TaskBoardModel | null> {
    return this.boards.update(boardId, updates as unknown as Partial<TaskBoardModel>);
  }

  async archiveBoard(boardId: string): Promise<TaskBoardModel | null> {
    return this.boards.archive(boardId);
  }

  /**
   * Permanently delete a board. This will cascade-delete columns/cards in the DB.
   */
  async deleteBoard(boardId: string): Promise<boolean> {
    return this.boards.delete(boardId);
  }

  async createColumn(req: CreateTaskColumnRequest): Promise<TaskColumnModel> {
    const title = String(req.title || '').trim();
    if (!title) throw new ValidationError('Column title is required', 'title');
    if (await this.columns.titleExists(req.boardId, title)) {
      throw new ValidationError('Column title must be unique within the board', 'title', { boardId: req.boardId, title });
    }
    return this.columns.create({
      boardId: req.boardId,
      title,
      key: req.key ?? null,
      pos: req.pos,
      wipLimit: req.wipLimit ?? null,
    });
  }

  async updateColumn(columnId: string, updates: UpdateTaskColumnRequest): Promise<TaskColumnModel | null> {
    const col = await this.columns.findById(columnId);
    if (!col) return null;
    if (typeof updates.title === 'string') {
      const nextTitle = updates.title.trim();
      if (!nextTitle) throw new ValidationError('Column title is required', 'title');
      if (await this.columns.titleExists(col.boardId, nextTitle, { excludeId: columnId })) {
        throw new ValidationError('Column title must be unique within the board', 'title', { boardId: col.boardId, title: nextTitle });
      }
      updates = { ...updates, title: nextTitle };
    }
    return this.columns.update(columnId, updates as unknown as Partial<TaskColumnModel>);
  }

  async deleteColumn(columnId: string): Promise<boolean> {
    return this.columns.delete(columnId);
  }

  async createCard(req: CreateTaskCardRequest): Promise<TaskCardModel> {
    const resolvedColumnId = await this.resolveColumnIdForBoard(req.boardId, req.columnName, 'column');
    const col = await this.columns.findById(resolvedColumnId);
    if (!col) {
      throw new Error('Destination column not found');
    }
    if (col.boardId !== req.boardId) {
      throw new Error('columnId does not belong to boardId');
    }

    const resolved = await this.resolveAssigneeForBoard(req.boardId, { assignee: req.assignee });

    return this.cards.create({
      boardId: req.boardId,
      columnId: resolvedColumnId,
      title: req.title,
      description: req.description,
      pos: req.pos,
      priority: req.priority ?? null,
      assigneeAgentId: resolved.assigneeAgentId,
      assigneeUserId: resolved.assigneeUserId,
    });
  }

  async updateCard(cardId: string, updates: UpdateTaskCardRequest): Promise<TaskCardModel | null> {
    const card = await this.cards.findById(cardId);
    if (!card) return null;

    const { assignee, ...rest } = updates;

    // Only resolve assignee when explicitly provided; otherwise leave unchanged.
    let assigneeAgentId: string | null | undefined = undefined;
    let assigneeUserId: string | null | undefined = undefined;
    const hasOwn = (k: string) => Object.prototype.hasOwnProperty.call(updates as Record<string, unknown>, k);
    const shouldResolveAssignee = hasOwn('assignee');

    if (shouldResolveAssignee) {
      const resolved = await this.resolveAssigneeForBoard(card.boardId, { assignee });
      assigneeAgentId = resolved.assigneeAgentId;
      assigneeUserId = resolved.assigneeUserId;
    }

    const normalized: Partial<TaskCardModel> = {
      ...(rest as unknown as Partial<TaskCardModel>),
      ...(assigneeAgentId !== undefined ? { assigneeAgentId } : null),
      ...(assigneeUserId !== undefined ? { assigneeUserId } : null),
    };

    return this.cards.update(cardId, normalized);
  }

  async moveCard(cardId: string, move: MoveTaskCardRequest): Promise<TaskCardModel | null> {
    const card = await this.cards.findById(cardId);
    if (!card) return null;

    const resolvedToColumnId = await this.resolveColumnIdForBoard(card.boardId, move.toColumnName, 'toColumn');
    const dest = await this.columns.findById(resolvedToColumnId);
    if (!dest) {
      throw new Error('Destination column not found');
    }
    if (dest.boardId !== card.boardId) {
      throw new Error('Destination column is not in the same board');
    }

    return this.cards.move(cardId, { toColumnId: resolvedToColumnId, toPos: move.toPos });
  }

  async archiveCard(cardId: string): Promise<TaskCardModel | null> {
    return this.cards.archive(cardId);
  }

  async listCards(boardId: string, opts?: { includeArchived?: boolean }): Promise<Array<TaskCardModel & { assignee?: TaskAssigneeRef | null }>> {
    const cards = await this.cards.listByBoard(boardId, opts);

    const agentIds = Array.from(
      new Set(
        cards
          .map((c) => (typeof c.assigneeAgentId === 'string' ? c.assigneeAgentId.trim() : ''))
          .filter((s) => s.length > 0)
      )
    );

    const agentSlugById = new Map<string, string>();
    if (agentIds.length > 0) {
      const conn = getConnection();
      const rows = await conn.query<{ id: string; slug: string }>(`SELECT id, slug FROM agents WHERE id = ANY($1::text[])`, [agentIds]);
      for (const r of rows) {
        const id = String(r.id || '').trim();
        const slug = String(r.slug || '').trim();
        if (id && slug) agentSlugById.set(id, slug);
      }
    }

    return cards.map((c) => {
      const agentId = typeof c.assigneeAgentId === 'string' ? c.assigneeAgentId.trim() : '';
      const userId = typeof c.assigneeUserId === 'string' ? c.assigneeUserId.trim() : '';

      const assignee: TaskAssigneeRef | null =
        agentId && agentSlugById.get(agentId)
          ? { type: 'agent', slug: agentSlugById.get(agentId) as string }
          : userId
            ? { type: 'user', slug: `u:${userId}` }
            : null;

      return { ...c, assignee };
    });
  }

  private parseUserSlugToId(input: string): string | null {
    const raw = String(input || '').trim();
    if (!raw) return null;

    // Accept mention token form: <@u:USER_ID>
    const m = raw.match(/^<@u:([^>]+)>$/i);
    const unwrapped = m ? String(m[1] || '').trim() : raw;

    // Accept both `u:ID` and `u-ID`
    const s = unwrapped.startsWith('u:') ? unwrapped.slice(2) : unwrapped.toLowerCase().startsWith('u-') ? unwrapped.slice(2) : unwrapped;
    const id = String(s || '').trim();
    return id.length > 0 ? id : null;
  }

  private async resolveAssigneeForBoard(
    boardId: string,
    input: { assignee?: TaskAssigneeRef | null }
  ): Promise<{ assigneeAgentId: string | null; assigneeUserId: string | null }> {
    const board = await this.boards.findById(boardId);
    if (!board) throw new ValidationError('Task board not found', 'boardId', { boardId });
    const starshipId = String(board.starshipId || '').trim();
    if (!starshipId) throw new ValidationError('Task board missing starshipId', 'boardId', { boardId });

    // Preferred unified assignee ref
    if (input.assignee !== undefined) {
      const a = input.assignee;
      if (a === null) return { assigneeAgentId: null, assigneeUserId: null };

      const type = String(a.type || '').trim();
      const slug = String(a.slug || '').trim();
      if (!type || !slug) throw new ValidationError('Invalid assignee', 'assignee', { type, slug });

      if (type === 'agent') {
        const agent = await this.agents.findBySlugAndStarship(slug, starshipId);
        if (!agent) throw new ValidationError('Assignee agent not found', 'assignee', { type, slug });
        return { assigneeAgentId: agent.id, assigneeUserId: null };
      }
      if (type === 'user') {
        const userId = this.parseUserSlugToId(slug);
        if (!userId) throw new ValidationError('Invalid user assignee slug', 'assignee', { type, slug });
        const ok = await this.starshipMembers.isMember(userId, starshipId);
        if (!ok) throw new ValidationError('Assignee user is not a member of this starship', 'assignee', { type, slug });
        return { assigneeAgentId: null, assigneeUserId: userId };
      }
      throw new ValidationError('Invalid assignee type', 'assignee', { type, slug });
    }
    return { assigneeAgentId: null, assigneeUserId: null };
  }

  private async resolveColumnIdForBoard(
    boardId: string,
    columnName: string,
    fieldPrefix: 'column' | 'toColumn' = 'column'
  ): Promise<string> {
    const rawName = String(columnName || '').trim();
    if (!rawName) throw new ValidationError('columnName is required', `${fieldPrefix}Name`);

    const colByTitle = await this.columns.findByTitle(boardId, rawName);
    if (!colByTitle) {
      throw new ValidationError('Column not found', `${fieldPrefix}Name`, { boardId, columnName: rawName });
    }
    return colByTitle.id;
  }
}

export default TaskBoardService;

