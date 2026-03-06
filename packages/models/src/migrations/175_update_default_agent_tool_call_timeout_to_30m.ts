import type { Client } from 'pg';

/**
 * Migration 175: Increase default server-tools authorize+execute tool-call timeout to 30 minutes.
 *
 * What this updates:
 * - `agents.blueprint` JSONB
 * - `agent_templates.blueprint` JSONB
 *
 * Only updates the specific connector_action node:
 * - type: "connector_action"
 * - parameters.connector: "starships"
 * - parameters.action: "authorize-and-maybe-execute-tool"
 * - parameters.timeout: 120000  ->  1800000
 *
 * We intentionally gate on the old default (120000) so we do not overwrite custom blueprints.
 */
export async function up(client: Client): Promise<void> {
  const OLD_TIMEOUT_MS = 120000;
  const NEW_TIMEOUT_MS = 30 * 60 * 1000; // 1800000

  const updateBlueprintTimeout = async (table: 'agents' | 'agent_templates'): Promise<void> => {
    // Preserve array order using WITH ORDINALITY and jsonb_agg(.. ORDER BY ord).
    // Update only when we find the exact default node timeout to avoid clobbering customized blueprints.
    await client.query(
      `
      UPDATE ${table}
      SET
        blueprint = jsonb_set(
          blueprint,
          '{nodes}',
          (
            SELECT jsonb_agg(
              CASE
                WHEN jsonb_typeof(node) = 'object'
                  AND node->>'type' = 'connector_action'
                  AND (node->'parameters'->>'connector') = 'starships'
                  AND (node->'parameters'->>'action') = 'authorize-and-maybe-execute-tool'
                  AND (
                    (jsonb_typeof(node->'parameters'->'timeout') = 'number' AND (node->'parameters'->>'timeout')::int = $1)
                    OR (jsonb_typeof(node->'parameters'->'timeout') = 'string' AND (node->'parameters'->>'timeout') = ($1::text))
                  )
                THEN jsonb_set(node, '{parameters,timeout}', to_jsonb($2::int), true)
                ELSE node
              END
              ORDER BY ord
            )
            FROM jsonb_array_elements(blueprint->'nodes') WITH ORDINALITY AS t(node, ord)
          ),
          true
        ),
        updated_at = NOW()
      WHERE jsonb_typeof(blueprint->'nodes') = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(blueprint->'nodes') AS node
          WHERE jsonb_typeof(node) = 'object'
            AND node->>'type' = 'connector_action'
            AND (node->'parameters'->>'connector') = 'starships'
            AND (node->'parameters'->>'action') = 'authorize-and-maybe-execute-tool'
            AND (
              (jsonb_typeof(node->'parameters'->'timeout') = 'number' AND (node->'parameters'->>'timeout')::int = $1)
              OR (jsonb_typeof(node->'parameters'->'timeout') = 'string' AND (node->'parameters'->>'timeout') = ($1::text))
            )
        )
      `,
      [OLD_TIMEOUT_MS, NEW_TIMEOUT_MS]
    );
  };

  await updateBlueprintTimeout('agents');
  await updateBlueprintTimeout('agent_templates');
}

export async function down(client: Client): Promise<void> {
  const OLD_TIMEOUT_MS = 120000;
  const NEW_TIMEOUT_MS = 30 * 60 * 1000; // 1800000

  const revertBlueprintTimeout = async (table: 'agents' | 'agent_templates'): Promise<void> => {
    await client.query(
      `
      UPDATE ${table}
      SET
        blueprint = jsonb_set(
          blueprint,
          '{nodes}',
          (
            SELECT jsonb_agg(
              CASE
                WHEN jsonb_typeof(node) = 'object'
                  AND node->>'type' = 'connector_action'
                  AND (node->'parameters'->>'connector') = 'starships'
                  AND (node->'parameters'->>'action') = 'authorize-and-maybe-execute-tool'
                  AND (
                    (jsonb_typeof(node->'parameters'->'timeout') = 'number' AND (node->'parameters'->>'timeout')::int = $1)
                    OR (jsonb_typeof(node->'parameters'->'timeout') = 'string' AND (node->'parameters'->>'timeout') = ($1::text))
                  )
                THEN jsonb_set(node, '{parameters,timeout}', to_jsonb($2::int), true)
                ELSE node
              END
              ORDER BY ord
            )
            FROM jsonb_array_elements(blueprint->'nodes') WITH ORDINALITY AS t(node, ord)
          ),
          true
        ),
        updated_at = NOW()
      WHERE jsonb_typeof(blueprint->'nodes') = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(blueprint->'nodes') AS node
          WHERE jsonb_typeof(node) = 'object'
            AND node->>'type' = 'connector_action'
            AND (node->'parameters'->>'connector') = 'starships'
            AND (node->'parameters'->>'action') = 'authorize-and-maybe-execute-tool'
            AND (
              (jsonb_typeof(node->'parameters'->'timeout') = 'number' AND (node->'parameters'->>'timeout')::int = $1)
              OR (jsonb_typeof(node->'parameters'->'timeout') = 'string' AND (node->'parameters'->>'timeout') = ($1::text))
            )
        )
      `,
      [NEW_TIMEOUT_MS, OLD_TIMEOUT_MS]
    );
  };

  await revertBlueprintTimeout('agents');
  await revertBlueprintTimeout('agent_templates');
}

