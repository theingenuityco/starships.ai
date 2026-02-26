import type { Client } from 'pg';

export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const templateId = 'postgres';
    const actionName = 'execute';
    const id = `${templateId}:${actionName}`;

    const parametersJson = JSON.stringify({
      type: 'object',
      required: ['sql'],
      properties: {
        sql: { type: 'string', description: 'SQL statement (may write; single statement only)' },
        params: { type: 'array', description: 'Positional parameters array for $1..$n' },
      },
      additionalProperties: true,
    });

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
        actionName,
        10,
        'Execute a SQL statement that may write (DDL/DML; single statement).',
        30000,
        '{{ String(args.sql ?? "") }}',
        'execute',
        1000,
        false,
        parametersJson,
      ]
    );

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
    const actionName = 'execute';
    const id = `${templateId}:${actionName}`;

    await client.query(`DELETE FROM connector_template_actions WHERE id = $1 AND template_id = $2 AND action_name = $3`, [
      id,
      templateId,
      actionName,
    ]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

