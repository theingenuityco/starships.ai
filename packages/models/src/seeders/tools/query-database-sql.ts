import type { ToolParams } from '@starships/autopilot';

/**
 * Tool: Query Database (SQL)
 * Run a read-only SQL query over the starship's Database (its schema of Tables).
 */
export const queryDatabaseSqlTool: ToolParams = {
  name: 'Query Database (SQL)',
  slug: 'query-database-sql',
  description:
    'Run a single read-only SQL SELECT over this starship\'s Database (a schema of Tables). Call list-tables first to learn each Table\'s physical_table name and columns. Tables are in your Database schema (search_path is preset, reference them unqualified). SELECT only — writes are rejected.',
  parameters: {
    type: 'object',
    properties: {
      starshipId: { type: 'string', description: 'Starship ID (optional; defaults to runtime STARSHIP_ID)' },
      sql: { type: 'string', description: 'A single read-only SQL SELECT statement' },
      params: { type: 'array', description: 'Optional positional query parameters ($1, $2, ...)' },
    },
    required: ['sql'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'prepare',
        type: 'code',
        name: 'Prepare',
        description: 'Validate sql; resolve starshipId',
        parameters: {
          code: `
            async function main(ctx) {
              const input = ctx.input || {};
              const sql = typeof input.sql === 'string' ? input.sql.trim() : '';
              if (!sql) throw new Error('sql is required');

              const starshipId = typeof input.starshipId === 'string' && input.starshipId.trim()
                ? input.starshipId.trim()
                : ctx.env('STARSHIP_ID');
              if (!starshipId || typeof starshipId !== 'string' || !String(starshipId).trim()) throw new Error('STARSHIP_ID is required');

              const out = { starshipId: String(starshipId).trim(), sql };
              if (Array.isArray(input.params)) out.params = input.params;
              return out;
            }
          `,
          timeout: 3000,
        },
      },
      {
        ref: 'run_sql',
        type: 'connector_action',
        name: 'Query Database SQL (Starships)',
        description: 'Run read-only SQL via Starships connector action',
        parameters: {
          connector: 'starships',
          action: 'query-database-sql',
          failOnNon2xx: true,
          args: '{{ lastOutputOf("prepare") }}',
          timeout: 15000,
        },
      },
      {
        ref: 'unwrap',
        type: 'code',
        name: 'Unwrap',
        description: 'Return body.data/body.error where applicable; otherwise return body/resp',
        parameters: {
          code: `
            async function main(ctx) {
              const resp = ctx.input || {};
              const body = resp && typeof resp === 'object' ? resp.body : undefined;
              if (body && typeof body === 'object') {
                if (body.success === true) return body.data ?? body;
                if (body.success === false) return body.error ?? body;
              }
              return body ?? resp;
            }
          `,
          timeout: 2000,
        },
      },
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: { output: '{{ lastOutputOf("unwrap") }}' } },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare' },
      { ref: 'e2', from: 'prepare', to: 'run_sql' },
      { ref: 'e3', from: 'run_sql', to: 'unwrap' },
      { ref: 'e4', from: 'unwrap', to: 'end_1' },
    ],
    metadata: {},
  },
};
