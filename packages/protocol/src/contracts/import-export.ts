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
  /**
   * Optional debug-only metadata about the source resource.
   * Importers should NOT rely on this for correctness (except where explicitly designed, e.g. tool slug preservation).
   */
  metadata?: {
    fromSlug?: string;
    fromStarshipSlug?: string;
    // Back/forward compatibility: allow additional metadata keys without breaking parsing.
    [key: string]: unknown;
  };
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
  };
}

export interface StarshipImportResponse {
  kind: ImportExportKind;
  warnings?: string[];
  agent?: AgentModel;
  tool?: ToolModel;
}
