import { BaseRepository } from '@/repositories/BaseRepository';
import type { ConnectorEndpointV2, ConnectorHttpEndpointV2, ConnectorSqlEndpointV2, HttpMethod, RequestStyle } from '@starships/protocol';

function isSqlEndpoint(endpoint: ConnectorEndpointV2): endpoint is ConnectorSqlEndpointV2 {
  return (endpoint as { kind?: unknown }).kind === 'sql';
}

type ActionRow = {
  id: string;
  template_id: string;
  action_name: string;
  ordinal: number;
  kind?: string | null;
  method: string;
  path: string;
  description: string | null;
  base_url_override: string | null;
  timeout_ms: number | null;
  request_style: string | null;
  parameters_json: unknown | null;
  mapping_json: unknown | null;
  response_json: unknown | null;
  driver?: string | null;
  sql_text?: string | null;
  sql_mode?: string | null;
  row_limit?: number | null;
  read_only?: boolean | null;
  created_at: string;
  updated_at: string;
};

function toAction(row: ActionRow): ConnectorEndpointV2 {
  const kind = String(row.kind || 'http').trim().toLowerCase();

  if (kind === 'sql') {
    const action: ConnectorSqlEndpointV2 = {
      kind: 'sql',
      name: row.action_name,
      driver: typeof row.driver === 'string' && row.driver.trim() ? row.driver.trim() : 'postgres',
      sql: typeof row.sql_text === 'string' ? row.sql_text : '',
    };
    if (row.description) action.description = row.description;
    if (typeof row.timeout_ms === 'number') action.timeoutMs = row.timeout_ms;
    if (row.parameters_json && typeof row.parameters_json === 'object' && !Array.isArray(row.parameters_json)) {
      action.parameters = row.parameters_json as ConnectorSqlEndpointV2['parameters'];
    }
    if (row.response_json && typeof row.response_json === 'object' && !Array.isArray(row.response_json)) {
      action.response = row.response_json as ConnectorSqlEndpointV2['response'];
    }
    if (typeof row.sql_mode === 'string' && (row.sql_mode === 'query' || row.sql_mode === 'execute')) {
      action.mode = row.sql_mode;
    }
    if (typeof row.row_limit === 'number') action.rowLimit = row.row_limit;
    if (typeof row.read_only === 'boolean') action.readOnly = row.read_only;
    return action;
  }

  const action: ConnectorHttpEndpointV2 = {
    name: row.action_name,
    method: row.method as HttpMethod,
    path: row.path,
  };
  if (row.description) action.description = row.description;
  if (row.base_url_override) action.baseUrlOverride = row.base_url_override;
  if (typeof row.timeout_ms === 'number') action.timeoutMs = row.timeout_ms;
  if (row.request_style) action.requestStyle = row.request_style as RequestStyle;
  if (row.parameters_json && typeof row.parameters_json === 'object' && !Array.isArray(row.parameters_json)) {
    action.parameters = row.parameters_json as unknown as ConnectorHttpEndpointV2['parameters'];
  }
  if (row.mapping_json && typeof row.mapping_json === 'object' && !Array.isArray(row.mapping_json)) {
    action.mapping = row.mapping_json as unknown as ConnectorHttpEndpointV2['mapping'];
  }
  if (row.response_json && typeof row.response_json === 'object' && !Array.isArray(row.response_json)) {
    action.response = row.response_json as unknown as ConnectorHttpEndpointV2['response'];
  }
  return action;
}

export class ConnectorTemplateActionRepository extends BaseRepository {
  constructor() {
    super('ConnectorTemplateActionRepository');
  }

  async countActionRowsByTemplateId(args: { templateId: string; q?: string }): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        const templateId = String(args.templateId || '').trim();
        if (!templateId) throw new Error('templateId is required');

        const q = (args.q ?? '').trim().toLowerCase();

        const connection = this.getConnection();
        if (q) {
          return await connection.queryCount(
            `
              SELECT count(*)::text AS count
              FROM connector_template_actions
              WHERE template_id = $1
                AND (
                  lower(action_name) LIKE $2
                  OR lower(COALESCE(description, '')) LIKE $2
                  OR lower(path) LIKE $2
                )
            `,
            [templateId, `%${q}%`]
          );
        }

        return await connection.queryCount(
          `
            SELECT count(*)::text AS count
            FROM connector_template_actions
            WHERE template_id = $1
          `,
          [templateId]
        );
      },
      'countActionRowsByTemplateId',
      'connector_template_actions'
    );
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
        const isSql = isSqlEndpoint(e);
        const kind = isSql ? 'sql' : 'http';

        // Keep DB constraints satisfied even for SQL actions.
        const method = isSql ? 'POST' : String((e as ConnectorHttpEndpointV2).method || '').trim().toUpperCase();
        const path = isSql ? '/sql' : String((e as ConnectorHttpEndpointV2).path || '').trim();
        if (!method) throw new Error('action.method is required');
        if (!path) throw new Error('action.path is required');

        const id = `${templateId}:${actionName}`;
        const ordinal = typeof args.ordinal === 'number' ? Math.max(0, Math.floor(args.ordinal)) : 0;

        const driver = isSql ? String(e.driver || '').trim() : '';
        const sqlText = isSql ? String(e.sql || '') : '';
        const sqlMode = isSql && (e.mode === 'execute' || e.mode === 'query') ? e.mode : null;
        const rowLimit = isSql && typeof e.rowLimit === 'number' ? Math.floor(e.rowLimit) : null;
        const readOnly = isSql && typeof e.readOnly === 'boolean' ? e.readOnly : null;

        if (isSql) {
          if (!driver) throw new Error('action.driver is required for SQL actions');
          if (!sqlText.trim()) throw new Error('action.sql is required for SQL actions');
        }

        const baseUrlOverride = !isSql ? (e as ConnectorHttpEndpointV2).baseUrlOverride ?? null : null;
        const requestStyle = !isSql ? (e as ConnectorHttpEndpointV2).requestStyle ?? null : null;
        const mapping = !isSql ? (e as ConnectorHttpEndpointV2).mapping ?? null : null;

        const connection = this.getConnection();
        await connection.query(
          `
            INSERT INTO connector_template_actions (
              id,
              template_id,
              action_name,
              ordinal,
              kind,
              method,
              path,
              description,
              base_url_override,
              timeout_ms,
              request_style,
              driver,
              sql_text,
              sql_mode,
              row_limit,
              read_only,
              parameters_json,
              mapping_json,
              response_json,
              created_at,
              updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW())
            ON CONFLICT (id) DO UPDATE SET
              ordinal = EXCLUDED.ordinal,
              kind = EXCLUDED.kind,
              method = EXCLUDED.method,
              path = EXCLUDED.path,
              description = EXCLUDED.description,
              base_url_override = EXCLUDED.base_url_override,
              timeout_ms = EXCLUDED.timeout_ms,
              request_style = EXCLUDED.request_style,
              driver = EXCLUDED.driver,
              sql_text = EXCLUDED.sql_text,
              sql_mode = EXCLUDED.sql_mode,
              row_limit = EXCLUDED.row_limit,
              read_only = EXCLUDED.read_only,
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
            kind,
            method,
            path,
            (e.description ?? null) as string | null,
            baseUrlOverride,
            (typeof e.timeoutMs === 'number' ? Math.floor(e.timeoutMs) : null) as number | null,
            requestStyle as string | null,
            isSql ? driver : null,
            isSql ? sqlText : null,
            isSql ? sqlMode : null,
            isSql ? rowLimit : null,
            isSql ? readOnly : null,
            (e.parameters ?? null) as unknown | null,
            isSql ? null : (mapping as unknown | null),
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
            if (!actionName) continue;

            const isSql = isSqlEndpoint(e);
            const kind = isSql ? 'sql' : 'http';

            // Keep DB constraints satisfied even for SQL actions.
            const method = isSql ? 'POST' : String((e as ConnectorHttpEndpointV2).method || '').trim().toUpperCase();
            const path = isSql ? '/sql' : String((e as ConnectorHttpEndpointV2).path || '').trim();
            if (!method || !path) continue;

            const driver = isSql ? String(e.driver || '').trim() : '';
            const sqlText = isSql ? String(e.sql || '') : '';
            const sqlMode = isSql && (e.mode === 'execute' || e.mode === 'query') ? e.mode : null;
            const rowLimit = isSql && typeof e.rowLimit === 'number' ? Math.floor(e.rowLimit) : null;
            const readOnly = isSql && typeof e.readOnly === 'boolean' ? e.readOnly : null;
            if (isSql && (!driver || !sqlText.trim())) continue;

            const baseUrlOverride = !isSql ? (e as ConnectorHttpEndpointV2).baseUrlOverride ?? null : null;
            const requestStyle = !isSql ? (e as ConnectorHttpEndpointV2).requestStyle ?? null : null;
            const mapping = !isSql ? (e as ConnectorHttpEndpointV2).mapping ?? null : null;

            const id = `${templateId}:${actionName}`;
            await tx.query(
              `
                INSERT INTO connector_template_actions (
                  id,
                  template_id,
                  action_name,
                  ordinal,
                  kind,
                  method,
                  path,
                  description,
                  base_url_override,
                  timeout_ms,
                  request_style,
                  driver,
                  sql_text,
                  sql_mode,
                  row_limit,
                  read_only,
                  parameters_json,
                  mapping_json,
                  response_json,
                  created_at,
                  updated_at
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW())
              `,
              [
                id,
                templateId,
                actionName,
                i,
                kind,
                method,
                path,
                (e.description ?? null) as string | null,
                baseUrlOverride,
                (typeof e.timeoutMs === 'number' ? Math.floor(e.timeoutMs) : null) as number | null,
                requestStyle as string | null,
                isSql ? driver : null,
                isSql ? sqlText : null,
                isSql ? sqlMode : null,
                isSql ? rowLimit : null,
                isSql ? readOnly : null,
                (e.parameters ?? null) as unknown | null,
                isSql ? null : (mapping as unknown | null),
                (e.response ?? null) as unknown | null,
              ]
            );
          }
        });
      },
      'replaceAllActions',
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

