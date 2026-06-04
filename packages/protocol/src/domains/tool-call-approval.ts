/**
 * Tool Call Approval Types
 *
 * Server-side persistence for ask-first tool approvals.
 */

export type ToolCallApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface ToolCallApprovalModel {
  id: string;
  starshipId: string;
  conversationId: string;
  agentId: string;
  /** Tools-table id for blueprint approvals; null for CLI-agent (system tool / connector action) approvals. */
  toolId?: string | null;
  /** Human-readable tool/action name. Set for CLI-agent approvals that have no tool_id. */
  toolName?: string | null;
  toolCallId: string;
  argsJson: Record<string, unknown>;
  status: ToolCallApprovalStatus;
  createdAt: string;
  decidedAt?: string | null;
}


