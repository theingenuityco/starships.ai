type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

/**
 * Migration 059: Scope instance slugs by starship and remove conflicting global uniqueness.
 *
 * Desired behavior:
 * - Agent instance slugs: unique per (starship_id, slug)
 * - Tool instance slugs: unique per (starship_id, slug)
 * - Template slugs remain globally unique (standalone UNIQUE on slug)
 *
 * Current issues (from initial schema):
 * - agents has a global unique index on slug (idx_agents_slug_unique) which prevents two starships from using the same slug
 * - tools has BOTH a composite unique (starship_id, slug) and a global unique index on slug (idx_tools_slug_unique)
 */
export async function up(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    // -------------------------------------------------------------------------
    // Agents: drop global uniqueness and enforce starship-scoped uniqueness
    // -------------------------------------------------------------------------
    await client.query(`DROP INDEX IF EXISTS idx_agents_slug_unique;`);

    // Create starship-scoped unique index for agent slugs
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_starship_id_slug_unique
      ON agents(starship_id, slug);
    `);

    // -------------------------------------------------------------------------
    // Tools: remove conflicting global uniqueness (composite uniqueness already exists)
    // -------------------------------------------------------------------------
    await client.query(`DROP INDEX IF EXISTS idx_tools_slug_unique;`);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    // Revert agent slug uniqueness back to global uniqueness
    await client.query(`DROP INDEX IF EXISTS idx_agents_starship_id_slug_unique;`);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_slug_unique
      ON agents(slug);
    `);

    // Recreate tool global uniqueness index (WARNING: will fail if tools now contain duplicate slugs across starships)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tools_slug_unique
      ON tools(slug);
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
