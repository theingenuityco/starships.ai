import type { AgentModel, CreateAgentRequest } from '../domains/agent';
import type { ConnectorEndpointV2, CreateConnectorTemplateRequest } from '../domains/connector';
import type { CreateViewRequest } from '../domains/view';
import type { CreateTaskBoardRequest, TaskCardModel, TaskColumnModel } from '../domains/task-board';
import type { Room } from '../domains/room';
import type { CreateStarshipTableRequest, StarshipTableRowModel } from '../domains/table';

export type ImportExportKind = 'agent' | 'connector_template' | 'room' | 'view' | 'table' | 'task_board';

/**
 * Shared container/envelope for importing/exporting resources as JSON.
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
    : K extends 'room'
      ? RoomExportPayloadV1
      : K extends 'view'
        ? ViewExportPayloadV1
        : K extends 'table'
          ? TableExportPayloadV1
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
 */
export interface AgentExportPayloadV1 {
  agent: Partial<CreateAgentRequest> & {
    name: string;
  };
}

export interface RoomExportPayloadV1 {
  room: Omit<Room, 'slug'>;
  viewPins?: Array<{ viewSlug: string; position: number }>;
  tablePins?: Array<{ tableSlug: string; position: number }>;
  taskBoardPins?: Array<{ taskBoardSlug: string; position: number }>;
  agentParticipantSlugs?: string[];
}

export interface ViewExportPayloadV1 {
  view: Omit<CreateViewRequest, 'starshipId'> & {
    name: string;
  };
}

export interface TableExportPayloadV1 {
  table: Omit<CreateStarshipTableRequest, 'starshipId'> & {
    name: string;
  };
  rows?: Array<Pick<StarshipTableRowModel, 'rowKey' | 'data'>>;
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
  /**
   * Webhook/event ingestion config from connector_templates.webhooks_json.
   * Stored alongside the connector template in bundle files so the server can
   * route incoming webhook events without a DB read.
   */
  webhooks?: Record<string, unknown>;
}

export interface StarshipImportResponse {
  kind: 'agent';
  warnings?: string[];
  agent?: AgentModel;
}
