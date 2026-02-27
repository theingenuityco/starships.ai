/**
 * Task Board Domain Types
 *
 * Starship-scoped kanban boards used by humans and agents to track work.
 *
 * Notes:
 * - These interfaces are intended to be close to the database schema (camelCase here).
 * - Ordering is represented by `pos` (floating point) to support efficient reordering.
 */
 
export interface TaskBoardModel {
  id: string;
  starshipId: string;
  name: string;
  slug: string;
  description: string;
  pos: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}
 
export interface TaskColumnModel {
  id: string;
  boardId: string;
  title: string;
  /**
   * Optional stable key for agent/tooling conventions (e.g. "todo", "doing", "done").
   */
  key?: string | null;
  pos: number;
  wipLimit?: number | null;
  createdAt: string;
  updatedAt: string;
}
 
export interface TaskCardModel {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string;
  pos: number;
  /**
   * Optional numeric priority (higher = more important), used for sorting/filtering.
   */
  priority?: number | null;
  /**
   * Optional assignment targets.
   */
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}
 
// ----------------------------------------------------------------------------
// Requests / responses
// ----------------------------------------------------------------------------
 
export type CreateTaskBoardRequest = {
  starshipId: string;
  name: string;
  slug?: string;
  description?: string;
  pos?: number;
  /**
   * When true (default), the server should create default columns if none are provided.
   */
  createDefaultColumns?: boolean;
  /**
   * Optional explicit columns to create with the board. If provided, the server should
   * create these and skip auto-default creation.
   */
  columns?: Array<{
    title: string;
    key?: string | null;
    pos?: number;
    wipLimit?: number | null;
  }>;
};
 
export type UpdateTaskBoardRequest = {
  name?: string;
  slug?: string;
  description?: string;
  pos?: number;
  archived?: boolean;
};
 
export type TaskBoardListResponse = {
  boards: TaskBoardModel[];
};
 
export type TaskBoardDetailsResponse = {
  board: TaskBoardModel;
  columns: TaskColumnModel[];
};
 
export type CreateTaskColumnRequest = {
  boardId: string;
  title: string;
  key?: string | null;
  pos?: number;
  wipLimit?: number | null;
};
 
export type UpdateTaskColumnRequest = {
  title?: string;
  key?: string | null;
  pos?: number;
  wipLimit?: number | null;
};
 
export type CreateTaskCardRequest = {
  boardId: string;
  columnId: string;
  title: string;
  description?: string;
  pos?: number;
  priority?: number | null;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
};
 
export type UpdateTaskCardRequest = {
  title?: string;
  description?: string;
  pos?: number;
  priority?: number | null;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  archived?: boolean;
};
 
export type MoveTaskCardRequest = {
  /**
   * Destination column id (must belong to the same board as the card).
   */
  toColumnId: string;
  /**
   * Destination position value. If omitted, the server may place at end of column.
   */
  toPos?: number;
};
 
export type TaskCardListResponse = {
  cards: TaskCardModel[];
};

