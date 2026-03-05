import type { Client } from 'pg';

/**
 * Seed a built-in Postgres connector template and initial SQL actions.
 *
 * This uses:
 * - connector_templates for template metadata + auth + metadata schema
 * - connector_template_actions for runtime action catalog (source of truth)
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const templateId = 'postgres';

    const authJson = JSON.stringify({
      type: 'basic',
      usernameRef: { type: 'connector_secret', key: 'POSTGRES_USER' },
      passwordRef: { type: 'connector_secret', key: 'POSTGRES_PASSWORD' },
      headerName: 'Authorization',
    });

    const metadataSchemaJson = JSON.stringify({
      type: 'object',
      required: ['host', 'database'],
      properties: {
        host: { type: 'string', title: 'Host', description: 'Database hostname (publicly reachable)' },
        port: { type: 'integer', title: 'Port', default: 5432 },
        database: { type: 'string', title: 'Database' },
        ssl: { type: 'boolean', title: 'SSL', default: true },
        sslRejectUnauthorized: { type: 'boolean', title: 'Reject unauthorized certs', default: true },
      },
      additionalProperties: true,
    });

    await client.query(
      `
        INSERT INTO connector_templates (
          id,
          slug,
          provider,
          name,
          description,
          auth_type,
          base_url,
          auth_json,
          metadata_schema_json,
          version,
          category,
          usage_count,
          is_enabled,
          created_at,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,NOW(),NOW())
        ON CONFLICT (id) DO NOTHING
      `,
      [
        templateId,
        'postgres',
        'postgres',
        'Postgres',
        'Connect a Postgres database to enable native SQL actions (read-only by default).',
        'basic',
        // base_url is unused for SQL endpoints but is required by template validation.
        'https://db.invalid',
        authJson,
        metadataSchemaJson,
        '1.0.0',
        'connector',
        0,
        true,
      ]
    );

    // Initial SQL actions.
    const actions: Array<{
      name: string;
      description: string;
      sql: string;
      mode?: 'query' | 'execute';
      timeoutMs?: number;
      rowLimit?: number;
      readOnly?: boolean;
      parameters?: unknown;
    }> = [
      {
        name: 'query',
        description: 'Execute a read-only SQL query (single statement).',
        sql: '{{ String(args.sql ?? "") }}',
        mode: 'query',
        timeoutMs: 15000,
        rowLimit: 1000,
        readOnly: true,
        parameters: {
          type: 'object',
          required: ['sql'],
          properties: {
            sql: { type: 'string', description: 'SQL statement (read-only; single statement only)' },
            params: { type: 'array', description: 'Positional parameters array for $1..$n' },
          },
          additionalProperties: true,
        },
      },
      {
        name: 'list-tables',
        description: 'List tables in non-system schemas.',
        sql: `
          SELECT table_schema, table_name
          FROM information_schema.tables
          WHERE table_type = 'BASE TABLE'
            AND table_schema NOT IN ('pg_catalog', 'information_schema')
          ORDER BY table_schema, table_name
        `,
        mode: 'query',
        timeoutMs: 15000,
        rowLimit: 5000,
        readOnly: true,
      },
      {
        name: 'list-columns',
        description: 'List columns for a table. Provide params: [schema, table].',
        sql: `
          SELECT column_name, data_type, is_nullable, column_default, ordinal_position
          FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position
        `,
        mode: 'query',
        timeoutMs: 15000,
        rowLimit: 5000,
        readOnly: true,
        parameters: {
          type: 'object',
          required: ['params'],
          properties: {
            params: { type: 'array', description: 'Must be [schema, table]' },
          },
          additionalProperties: true,
        },
      },
    ];

    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      const id = `${templateId}:${a.name}`;
      await client.query(
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
          VALUES (
            $1,$2,$3,$4,
            'sql','POST','/sql',
            $5,
            NULL,
            $6,
            NULL,
            'postgres',
            $7,
            $8,
            $9,
            $10,
            $11::jsonb,
            NULL,
            NULL,
            NOW(),
            NOW()
          )
          ON CONFLICT (id) DO NOTHING
        `,
        [
          id,
          templateId,
          a.name,
          i,
          a.description,
          typeof a.timeoutMs === 'number' ? Math.floor(a.timeoutMs) : null,
          String(a.sql),
          a.mode ?? null,
          typeof a.rowLimit === 'number' ? Math.floor(a.rowLimit) : null,
          typeof a.readOnly === 'boolean' ? a.readOnly : null,
          a.parameters ? JSON.stringify(a.parameters) : null,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const templateId = 'postgres';
    await client.query(`DELETE FROM connector_template_actions WHERE template_id = $1`, [templateId]);
    await client.query(`DELETE FROM connector_templates WHERE id = $1`, [templateId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

