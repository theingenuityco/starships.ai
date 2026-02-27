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
 
/**
 * Unified assignee reference for task cards.
 *
 * - `type: "agent"` uses `slug` = Agent slug (e.g. "kepler-9x2m")
 * - `type: "user"` uses `slug` = "u:<userId>" (mirrors message mention tokens like `<@u:USER_ID>`)
 *
 * Note: The database stores assignees as ids (`assigneeAgentId`/`assigneeUserId`). This ref is intended
 * for API ergonomics (human/agent-friendly payloads) and may be echoed back by the server.
 */
export type TaskAssigneeRef = {
  type: 'user' | 'agent';
  slug: string;
};

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
  /**
   * Task column title/name (unique per board).
   */
  columnName: string;
  title: string;
  description?: string;
  pos?: number;
  priority?: number | null;
  /**
   * Preferred unified assignee reference.
   * Servers should map this to `assigneeAgentId`/`assigneeUserId` internally.
   */
  assignee?: TaskAssigneeRef | null;
};
 
export type UpdateTaskCardRequest = {
  title?: string;
  description?: string;
  pos?: number;
  priority?: number | null;
  /**
   * Preferred unified assignee reference.
   * - Omit to leave unchanged
   * - Set to null to clear assignee
   */
  assignee?: TaskAssigneeRef | null;
  archived?: boolean;
};
 
export type MoveTaskCardRequest = {
  /**
   * Preferred: destination task column title/name (unique per board).
   */
  toColumnName: string;
  /**
   * Destination position value. If omitted, the server may place at end of column.
   */
  toPos?: number;
};
 
export type TaskCardListResponse = {
  cards: TaskCardModel[];
};

