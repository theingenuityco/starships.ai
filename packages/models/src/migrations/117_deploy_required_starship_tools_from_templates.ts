import { getConnection } from '@/helpers/database';
import type { PostgresConnection } from '@/helpers/database';

/**
 * Migration 117: Deploy required baseline starship tools from tool_templates
 *
 * Requirements:
 * - Ensure EVERY starship has tool instances deployed from tool_templates for:
 *   - read-url
 *   - read-older-messages
 * - Ensure those deployed tools are assigned at the starship level with permission = 'allow'
 *
 * Notes:
 * - Tool template slugs are random-suffix in DB (e.g. read-url-ab12). We resolve via:
 *   - exact match on the base slug OR
 *   - regex match on "^<base>-[a-z0-9]{4}$", newest-wins.
 * - Tool instance slugs are starship-scoped (unique per (starship_id, slug)).
 * - Idempotent: safe to run multiple times.
 */

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  parameters: unknown;
  blueprint: unknown;
  transforms: unknown | null;
  mutations: unknown | null;
  condition: string | null;
  version: string;
  required_connector_providers: string[] | null;
};

async function resolveTemplate(client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: TemplateRow[] }> }, baseSlug: string) {
  // baseSlug is already a slug-like identifier; use a strict regex for the random suffix form.
  const baseRegex = `^${baseSlug}-[a-z0-9]{4}$`;
  const res = await client.query(
    `
      SELECT
        id,
        name,
        description,
        parameters,
        blueprint,
        transforms,
        mutations,
        condition,
        version,
        required_connector_providers
      FROM tool_templates
      WHERE slug = $1 OR slug ~ $2
      ORDER BY (slug = $1) DESC, created_at DESC
      LIMIT 1
    `,
    [baseSlug, baseRegex]
  );
  return res.rows?.[0] ?? null;
}

async function ensureDeployedAndAllowed(
  client: {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  },
  baseSlug: string,
  template: TemplateRow
) {
  // 1) Deploy tool instances to starships missing an instance for this template.
  // 2) Ensure starship_tools mapping exists with permission='allow' for an instance on each starship.
  //
  // We pick a deterministic, collision-safe instance slug:
  // - prefer baseSlug
  // - if already taken on that starship, use baseSlug + '-' + md5(starship_id)[0:4]
  await client.query(
    `
    WITH tmpl AS (
      SELECT
        $1::text AS base_slug,
        $2::text AS template_id,
        $3::text AS name,
        $4::text AS description,
        $5::jsonb AS parameters,
        $6::jsonb AS blueprint,
        $7::jsonb AS transforms,
        $8::jsonb AS mutations,
        $9::text AS condition,
        $10::text AS version,
        $11::text[] AS required_connector_providers
    ),
    missing AS (
      SELECT
        s.id AS starship_id,
        t.template_id AS template_id,
        CASE
          WHEN EXISTS (SELECT 1 FROM tools x WHERE x.starship_id = s.id AND x.slug = t.base_slug)
            THEN t.base_slug || '-' || substring(md5(s.id) from 1 for 4)
          ELSE t.base_slug
        END AS tool_slug
      FROM starships s
      CROSS JOIN tmpl t
      WHERE NOT EXISTS (
        SELECT 1 FROM tools et
        WHERE et.starship_id = s.id
          AND et.source_template_id = t.template_id
      )
    ),
    inserted AS (
      INSERT INTO tools (
        id,
        name,
        slug,
        description,
        parameters,
        blueprint,
        transforms,
        mutations,
        condition,
        configuration,
        is_enabled,
        status,
        starship_id,
        source_template_id,
        version,
        template_snapshot_at,
        required_connector_providers,
        created_at,
        updated_at
      )
      SELECT
        uuid_generate_v4()::text,
        t.name,
        m.tool_slug,
        t.description,
        t.parameters,
        t.blueprint,
        NULLIF(t.transforms, '{}'::jsonb),
        NULLIF(t.mutations, '{}'::jsonb),
        t.condition,
        '{}'::jsonb,
        true,
        'active',
        m.starship_id,
        t.template_id,
        t.version,
        NOW(),
        COALESCE(t.required_connector_providers, '{}'::text[]),
        NOW(),
        NOW()
      FROM missing m
      CROSS JOIN tmpl t
      RETURNING id, starship_id, source_template_id
    ),
    effective AS (
      -- For each starship, pick an instance for this template (prefer newly inserted; otherwise newest existing).
      SELECT i.starship_id, i.id AS tool_id FROM inserted i
      UNION ALL
      SELECT
        s.id AS starship_id,
        t2.id AS tool_id
      FROM starships s
      CROSS JOIN tmpl t
      JOIN LATERAL (
        SELECT id
        FROM tools
        WHERE starship_id = s.id
          AND source_template_id = t.template_id
        ORDER BY created_at DESC
        LIMIT 1
      ) t2 ON true
    )
    INSERT INTO starship_tools (starship_id, tool_id, permission, created_at, updated_at)
    SELECT DISTINCT
      e.starship_id,
      e.tool_id,
      'allow'::text,
      NOW(),
      NOW()
    FROM effective e
    ON CONFLICT (starship_id, tool_id)
    DO UPDATE SET permission = 'allow', updated_at = NOW()
    `,
    [
      baseSlug,
      template.id,
      template.name,
      template.description ?? '',
      template.parameters ?? {},
      template.blueprint ?? {},
      (template.transforms as unknown) ?? {},
      (template.mutations as unknown) ?? {},
      template.condition ?? null,
      template.version ?? '1.0.0',
      template.required_connector_providers ?? [],
    ]
  );
}

export async function up(conn?: PostgresConnection): Promise<void> {
  const connection = conn ?? getConnection();
  await connection.transaction(async (client) => {
    console.log('[117] Deploying required baseline starship tools from tool_templates...');

    const readUrl = await resolveTemplate(client, 'read-url');
    const readOlder = await resolveTemplate(client, 'read-older-messages');

    if (!readUrl) {
      console.warn('[117] Tool template not found for base slug "read-url"; skipping deployment');
    } else {
      await ensureDeployedAndAllowed(client, 'read-url', readUrl);
    }

    if (!readOlder) {
      console.warn('[117] Tool template not found for base slug "read-older-messages"; skipping deployment');
    } else {
      await ensureDeployedAndAllowed(client, 'read-older-messages', readOlder);
    }

    console.log('[117] Done');
  });
}

// Down migrations should never delete user data (tools/permissions) for safety.
export async function down(): Promise<void> {
  // no-op
}

