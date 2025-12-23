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
  toolSlug: string;
  toolCallId: string;
  argsJson: Record<string, unknown>;
  status: ToolCallApprovalStatus;
  createdAt: string;
  decidedAt?: string | null;
}


