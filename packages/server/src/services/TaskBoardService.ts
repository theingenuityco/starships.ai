import {
  TaskBoardRepository,
  TaskCardRepository,
  TaskColumnRepository,
} from '@starships/models';
import type {
  CreateTaskBoardRequest,
  CreateTaskCardRequest,
  CreateTaskColumnRequest,
  MoveTaskCardRequest,
  TaskBoardDetailsResponse,
  TaskBoardModel,
  TaskCardModel,
  TaskColumnModel,
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

  constructor() {
    this.boards = new TaskBoardRepository();
    this.columns = new TaskColumnRepository();
    this.cards = new TaskCardRepository();
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

  async createColumn(req: CreateTaskColumnRequest): Promise<TaskColumnModel> {
    return this.columns.create({
      boardId: req.boardId,
      title: req.title,
      key: req.key ?? null,
      pos: req.pos,
      wipLimit: req.wipLimit ?? null,
    });
  }

  async updateColumn(columnId: string, updates: UpdateTaskColumnRequest): Promise<TaskColumnModel | null> {
    return this.columns.update(columnId, updates as unknown as Partial<TaskColumnModel>);
  }

  async deleteColumn(columnId: string): Promise<boolean> {
    return this.columns.delete(columnId);
  }

  async listCards(boardId: string, opts?: { includeArchived?: boolean }): Promise<TaskCardModel[]> {
    return this.cards.listByBoard(boardId, opts);
  }

  async createCard(req: CreateTaskCardRequest): Promise<TaskCardModel> {
    const col = await this.columns.findById(req.columnId);
    if (!col) {
      throw new Error('Destination column not found');
    }
    if (col.boardId !== req.boardId) {
      throw new Error('columnId does not belong to boardId');
    }

    return this.cards.create({
      boardId: req.boardId,
      columnId: req.columnId,
      title: req.title,
      description: req.description,
      pos: req.pos,
      priority: req.priority ?? null,
      assigneeAgentId: req.assigneeAgentId ?? null,
      assigneeUserId: req.assigneeUserId ?? null,
    });
  }

  async updateCard(cardId: string, updates: UpdateTaskCardRequest): Promise<TaskCardModel | null> {
    return this.cards.update(cardId, updates as unknown as Partial<TaskCardModel>);
  }

  async moveCard(cardId: string, move: MoveTaskCardRequest): Promise<TaskCardModel | null> {
    const card = await this.cards.findById(cardId);
    if (!card) return null;

    const dest = await this.columns.findById(move.toColumnId);
    if (!dest) {
      throw new Error('Destination column not found');
    }
    if (dest.boardId !== card.boardId) {
      throw new Error('Destination column is not in the same board');
    }

    return this.cards.move(cardId, { toColumnId: move.toColumnId, toPos: move.toPos });
  }

  async archiveCard(cardId: string): Promise<TaskCardModel | null> {
    return this.cards.archive(cardId);
  }
}

export default TaskBoardService;

