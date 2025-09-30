// types/parallel-tools.ts
export interface ToolCallData {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  callIndex: number;
  toolCallId: string; // Same as id for consistency
}

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface BatchExecutionResult {
  batchId: string;
  timestamp: string;
  successful: ToolExecutionResult[];
  failed: ToolExecutionResult[];
  processedIds: string[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    successRate: string;
  };
}

export type ParallelToolEvents = 
  | 'parallel_tools_started'
  | 'tool_progress'
  | 'parallel_tools_completed';

export interface ToolProgressEventData {
  batchId: string;
  toolName: string;
  toolCallId: string;
  status: 'started' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  batchProgress: {
    completed: number;
    failed: number;
    total: number;
    remaining: string[];
  };
}