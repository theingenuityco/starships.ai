import type { AgentModel, CreateAgentRequest } from '../domains/agent';
import type { ToolModel, CreateToolRequest } from '../domains/tool';

export type ImportExportKind = 'agent' | 'tool';

/**
 * Shared container/envelope for importing/exporting resources as JSON.
 * This is intentionally stable so the same pipeline can handle both agents and tools.
 */
export interface ImportExportContainerV1<K extends ImportExportKind = ImportExportKind> {
  schemaVersion: '1';
  kind: K;
  exportedAt: string; // ISO 8601
  source?: {
    app?: string;
    version?: string;
  };
  payload: K extends 'agent' ? AgentExportPayloadV1 : ToolExportPayloadV1;
}

/**
 * Export payload for an Agent.
 *
 * Notes:
 * - We export a create-compatible shape (based on CreateAgentRequest) instead of AgentModel
 *   to avoid including starship-scoped identifiers and database timestamps.
 * - assignedToolSlugs are stored separately as a dependency list.
 */
export interface AgentExportPayloadV1 {
  agent: Partial<CreateAgentRequest> & {
    name: string;
    slug?: string;
  };
  assignedToolSlugs?: string[];
}

/**
 * Export payload for a Tool.
 *
 * Notes:
 * - We export a create-compatible shape (based on CreateToolRequest) instead of ToolModel.
 * - We intentionally omit configuration by default (configs frequently include secrets).
 */
export interface ToolExportPayloadV1 {
  tool: Partial<Omit<CreateToolRequest, 'configuration'>> & {
    name: string;
    slug?: string;
  };
}

export interface StarshipImportResponse {
  kind: ImportExportKind;
  warnings?: string[];
  agent?: AgentModel;
  tool?: ToolModel;
}
