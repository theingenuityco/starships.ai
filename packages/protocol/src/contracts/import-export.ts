import type { AgentModel, AgentToolPermission, CreateAgentRequest } from '../domains/agent';
import type { ConnectorEndpointV2, CreateConnectorTemplateRequest } from '../domains/connector';
import type { ToolModel, CreateToolRequest } from '../domains/tool';
import type { CreateViewRequest } from '../domains/view';
import type { CreateTaskBoardRequest, TaskCardModel, TaskColumnModel } from '../domains/task-board';
import type { Room } from '../domains/room';
import type { CreateStarshipDatasetRequest, StarshipDatasetRowModel } from '../domains/dataset';

export type ImportExportKind = 'agent' | 'tool' | 'connector_template' | 'room' | 'view' | 'dataset' | 'task_board';

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
  payload: K extends 'agent'
    ? AgentExportPayloadV1
    : K extends 'tool'
      ? ToolExportPayloadV1
      : K extends 'room'
        ? RoomExportPayloadV1
        : K extends 'view'
          ? ViewExportPayloadV1
          : K extends 'dataset'
            ? DatasetExportPayloadV1
            : K extends 'task_board'
              ? TaskBoardExportPayloadV1
              : ConnectorTemplateExportPayloadV1;
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

export interface RoomExportPayloadV1 {
  room: Room;
  viewPins?: Array<{ viewSlug: string; position: number }>;
  datasetPins?: Array<{ datasetSlug: string; position: number }>;
  taskBoardPins?: Array<{ taskBoardSlug: string; position: number }>;
  toolAssignments?: Array<{ toolSlug: string; permission: AgentToolPermission }>;
  agentParticipantSlugs?: string[];
}

export interface ViewExportPayloadV1 {
  view: Omit<CreateViewRequest, 'starshipId'> & {
    name: string;
  };
}

export interface DatasetExportPayloadV1 {
  dataset: Omit<CreateStarshipDatasetRequest, 'starshipId'> & {
    name: string;
  };
  rows?: Array<Pick<StarshipDatasetRowModel, 'rowKey' | 'data'>>;
}

export interface TaskBoardExportPayloadV1 {
  taskBoard: Omit<CreateTaskBoardRequest, 'starshipId' | 'columns'> & {
    name: string;
  };
  columns?: Array<Pick<TaskColumnModel, 'title' | 'key' | 'pos' | 'wipLimit'>>;
  cards?: Array<
    Pick<TaskCardModel, 'title' | 'description' | 'pos' | 'priority' | 'archived'> & {
      columnKey?: string | null;
      columnTitle: string;
      assigneeAgentSlug?: string | null;
      assigneeUserSlug?: string | null;
    }
  >;
}

/**
 * Export payload for a Connector Template (instance-scoped).
 *
 * Notes:
 * - We export a create-compatible shape (based on CreateConnectorTemplateRequest) so it can be re-imported.
 * - This object must NOT contain any raw secret values (auth should use SecretRefs only).
 */
export interface ConnectorTemplateExportPayloadV1 {
  connectorTemplate: CreateConnectorTemplateRequest;
  /**
   * Connector action catalog (source of truth: connector_template_actions).
   *
   * NOTE: We intentionally do NOT export the legacy connector_templates.endpoints_json field.
   */
  actions?: ConnectorEndpointV2[];
}

export interface StarshipImportResponse {
  kind: 'agent' | 'tool';
  warnings?: string[];
  agent?: AgentModel;
  tool?: ToolModel;
}
