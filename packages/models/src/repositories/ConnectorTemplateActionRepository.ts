import { BaseRepository } from '@/repositories/BaseRepository';
import type { ConnectorEndpointV2, HttpMethod, RequestStyle } from '@starships/protocol';

type ActionRow = {
  id: string;
  template_id: string;
  action_name: string;
  ordinal: number;
  method: string;
  path: string;
  description: string | null;
  base_url_override: string | null;
  timeout_ms: number | null;
  request_style: string | null;
  parameters_json: unknown | null;
  mapping_json: unknown | null;
  response_json: unknown | null;
  created_at: string;
  updated_at: string;
};

function toAction(row: ActionRow): ConnectorEndpointV2 {
  const action: ConnectorEndpointV2 = {
    name: row.action_name,
    method: row.method as HttpMethod,
    path: row.path,
  };
  if (row.description) action.description = row.description;
  if (row.base_url_override) action.baseUrlOverride = row.base_url_override;
  if (typeof row.timeout_ms === 'number') action.timeoutMs = row.timeout_ms;
  if (row.request_style) action.requestStyle = row.request_style as RequestStyle;
  if (row.parameters_json && typeof row.parameters_json === 'object' && !Array.isArray(row.parameters_json)) {
    action.parameters = row.parameters_json as ConnectorEndpointV2['parameters'];
  }
  if (row.mapping_json && typeof row.mapping_json === 'object' && !Array.isArray(row.mapping_json)) {
    action.mapping = row.mapping_json as ConnectorEndpointV2['mapping'];
  }
  if (row.response_json && typeof row.response_json === 'object' && !Array.isArray(row.response_json)) {
    action.response = row.response_json as ConnectorEndpointV2['response'];
  }
  return action;
}

export class ConnectorTemplateActionRepository extends BaseRepository {
  constructor() {
    super('ConnectorTemplateActionRepository');
  }

  async listActionRowsByTemplateIds(templateIds: string[]): Promise<ActionRow[]> {
    return this.executeWithErrorHandling(
      async () => {
        const ids = Array.isArray(templateIds) ? templateIds.map((t) => String(t || '').trim()).filter(Boolean) : [];
        if (!ids.length) return [];

        const connection = this.getConnection();
        return await connection.query<ActionRow>(
          `
            SELECT *
            FROM connector_template_actions
            WHERE template_id = ANY($1::text[])
            ORDER BY template_id ASC, ordinal ASC, action_name ASC
          `,
          [ids]
        );
      },
      'listActionRowsByTemplateIds',
      'connector_template_actions'
    );
  }

  async listActionRowsByTemplateId(args: {
    templateId: string;
    limit?: number;
    offset?: number;
    q?: string;
  }): Promise<ActionRow[]> {
    return this.executeWithErrorHandling(
      async () => {
        const templateId = String(args.templateId || '').trim();
        if (!templateId) throw new Error('templateId is required');

        const limit = typeof args.limit === 'number' ? Math.max(1, Math.min(200, Math.floor(args.limit))) : 50;
        const offset = typeof args.offset === 'number' ? Math.max(0, Math.floor(args.offset)) : 0;
        const q = (args.q ?? '').trim().toLowerCase();

        const connection = this.getConnection();
        if (q) {
          return await connection.query<ActionRow>(
            `
              SELECT *
              FROM connector_template_actions
              WHERE template_id = $1
                AND (
                  lower(action_name) LIKE $2
                  OR lower(COALESCE(description, '')) LIKE $2
                  OR lower(path) LIKE $2
                )
              ORDER BY ordinal ASC, action_name ASC
              LIMIT $3 OFFSET $4
            `,
            [templateId, `%${q}%`, limit, offset]
          );
        }

        return await connection.query<ActionRow>(
          `
            SELECT *
            FROM connector_template_actions
            WHERE template_id = $1
            ORDER BY ordinal ASC, action_name ASC
            LIMIT $2 OFFSET $3
          `,
          [templateId, limit, offset]
        );
      },
      'listActionRowsByTemplateId',
      'connector_template_actions'
    );
  }

  async listActionsByTemplateId(templateId: string): Promise<ConnectorEndpointV2[]> {
    return this.executeWithErrorHandling(
      async () => {
        const id = String(templateId || '').trim();
        if (!id) throw new Error('templateId is required');

        const connection = this.getConnection();
        const rows = await connection.query<ActionRow>(
          `
            SELECT *
            FROM connector_template_actions
            WHERE template_id = $1
            ORDER BY ordinal ASC, action_name ASC
          `,
          [id]
        );
        return rows.map(toAction);
      },
      'listActionsByTemplateId',
      'connector_template_actions',
      templateId
    );
  }

  async findAction(templateId: string, actionName: string): Promise<ConnectorEndpointV2 | null> {
    return this.executeWithErrorHandling(
      async () => {
        const tid = String(templateId || '').trim();
        const name = String(actionName || '').trim();
        if (!tid) throw new Error('templateId is required');
        if (!name) throw new Error('actionName is required');

        const connection = this.getConnection();
        const row = await connection.queryOne<ActionRow>(
          `
            SELECT *
            FROM connector_template_actions
            WHERE template_id = $1 AND action_name = $2
            LIMIT 1
          `,
          [tid, name]
        );
        return row ? toAction(row) : null;
      },
      'findAction',
      'connector_template_actions',
      `${templateId}:${actionName}`
    );
  }

  async upsertAction(args: { templateId: string; action: ConnectorEndpointV2; ordinal?: number }): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const templateId = String(args.templateId || '').trim();
        if (!templateId) throw new Error('templateId is required');
        const e = args.action;
        const actionName = String(e?.name || '').trim();
        if (!actionName) throw new Error('action.name is required');
        const method = String(e?.method || '').trim().toUpperCase();
        const path = String(e?.path || '').trim();
        if (!method) throw new Error('action.method is required');
        if (!path) throw new Error('action.path is required');

        const id = `${templateId}:${actionName}`;
        const ordinal = typeof args.ordinal === 'number' ? Math.max(0, Math.floor(args.ordinal)) : 0;

        const connection = this.getConnection();
        await connection.query(
          `
            INSERT INTO connector_template_actions (
              id,
              template_id,
              action_name,
              ordinal,
              method,
              path,
              description,
              base_url_override,
              timeout_ms,
              request_style,
              parameters_json,
              mapping_json,
              response_json,
              created_at,
              updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
            ON CONFLICT (id) DO UPDATE SET
              ordinal = EXCLUDED.ordinal,
              method = EXCLUDED.method,
              path = EXCLUDED.path,
              description = EXCLUDED.description,
              base_url_override = EXCLUDED.base_url_override,
              timeout_ms = EXCLUDED.timeout_ms,
              request_style = EXCLUDED.request_style,
              parameters_json = EXCLUDED.parameters_json,
              mapping_json = EXCLUDED.mapping_json,
              response_json = EXCLUDED.response_json,
              updated_at = NOW()
          `,
          [
            id,
            templateId,
            actionName,
            ordinal,
            method,
            path,
            (e.description ?? null) as string | null,
            (e.baseUrlOverride ?? null) as string | null,
            (typeof e.timeoutMs === 'number' ? Math.floor(e.timeoutMs) : null) as number | null,
            (e.requestStyle ?? null) as string | null,
            (e.parameters ?? null) as unknown | null,
            (e.mapping ?? null) as unknown | null,
            (e.response ?? null) as unknown | null,
          ]
        );
      },
      'upsertAction',
      'connector_template_actions'
    );
  }

  async replaceAllActions(args: { templateId: string; actions: ConnectorEndpointV2[] }): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const templateId = String(args.templateId || '').trim();
        if (!templateId) throw new Error('templateId is required');
        const actions = Array.isArray(args.actions) ? args.actions : [];

        const connection = this.getConnection();
        await connection.transaction(async (tx) => {
          await tx.query(`DELETE FROM connector_template_actions WHERE template_id = $1`, [templateId]);

          for (let i = 0; i < actions.length; i++) {
            const e = actions[i] as ConnectorEndpointV2;
            const actionName = String(e?.name || '').trim();
            const method = String(e?.method || '').trim().toUpperCase();
            const path = String(e?.path || '').trim();
            if (!actionName || !method || !path) continue;

            const id = `${templateId}:${actionName}`;
            await tx.query(
              `
                INSERT INTO connector_template_actions (
                  id,
                  template_id,
                  action_name,
                  ordinal,
                  method,
                  path,
                  description,
                  base_url_override,
                  timeout_ms,
                  request_style,
                  parameters_json,
                  mapping_json,
                  response_json,
                  created_at,
                  updated_at
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
              `,
              [
                id,
                templateId,
                actionName,
                i,
                method,
                path,
                (e.description ?? null) as string | null,
                (e.baseUrlOverride ?? null) as string | null,
                (typeof e.timeoutMs === 'number' ? Math.floor(e.timeoutMs) : null) as number | null,
                (e.requestStyle ?? null) as string | null,
                (e.parameters ?? null) as unknown | null,
                (e.mapping ?? null) as unknown | null,
                (e.response ?? null) as unknown | null,
              ]
            );
          }
        });
      },
      'replaceAllEndpoints',
      'connector_template_actions',
      args.templateId
    );
  }

  async deleteAction(args: { templateId: string; actionName: string }): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const templateId = String(args.templateId || '').trim();
        const actionName = String(args.actionName || '').trim();
        if (!templateId) throw new Error('templateId is required');
        if (!actionName) throw new Error('actionName is required');

        const connection = this.getConnection();
        const result = await connection.queryWithResult(
          `DELETE FROM connector_template_actions WHERE template_id = $1 AND action_name = $2`,
          [templateId, actionName]
        );
        return (result.rowCount ?? 0) > 0;
      },
      'deleteAction',
      'connector_template_actions',
      `${args.templateId}:${args.actionName}`
    );
  }
}

