import { getConnection, type PostgresConnection } from '@/helpers/database';
import { schemaName, roleName, quoteIdent, assertSafeId } from '@/helpers/starship-tables/identifiers';

/**
 * Provisions the per-starship Database: a dedicated Postgres schema
 * (`db_<starshipId>`) plus a per-starship read-only role (`ship_ro_<starshipId>`)
 * that the agent login role assumes via SET ROLE for the read-only SQL surface.
 *
 * - Schema creation is MANDATORY (Tables live in it) and will throw on failure.
 * - Role + grants + agent-login membership are BEST-EFFORT: in environments
 *   without the agent SQL surface, or where the app role lacks CREATEROLE, the
 *   schema is still usable and table operations keep working.
 *
 * All methods are idempotent. Runs as the app (privileged) role.
 */
export class StarshipDatabaseProvisioner {
  private readonly connection: PostgresConnection;

  constructor(connection?: PostgresConnection) {
    this.connection = connection ?? getConnection();
  }

  private agentLoginRole(explicit?: string): string {
    return explicit || process.env.POSTGRES_AGENT_USER || 'starships_agent';
  }

  /** Create the starship's schema if absent. Mandatory; throws on failure. */
  async ensureSchema(starshipId: string): Promise<void> {
    const schema = schemaName(starshipId);
    await this.connection.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`);
  }

  /**
   * Ensure the per-starship read-only role exists and can read the schema, and
   * that the agent login role can assume it. Best-effort: logs and returns on
   * failure (e.g. missing CREATEROLE, agent surface disabled).
   */
  async ensureReadOnlyRole(starshipId: string, opts?: { agentLoginRole?: string }): Promise<boolean> {
    const schema = schemaName(starshipId);
    const role = roleName(starshipId);
    const agentLogin = this.agentLoginRole(opts?.agentLoginRole);

    try {
      const existing = await this.connection.queryOne<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists`,
        [role]
      );
      if (!existing?.exists) {
        await this.connection.query(`CREATE ROLE ${quoteIdent(role)} NOLOGIN`);
      }

      await this.connection.query(`GRANT USAGE ON SCHEMA ${quoteIdent(schema)} TO ${quoteIdent(role)}`);
      await this.connection.query(`GRANT SELECT ON ALL TABLES IN SCHEMA ${quoteIdent(schema)} TO ${quoteIdent(role)}`);
      // Applies to tables subsequently created by the current (app) role.
      await this.connection.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${quoteIdent(schema)} GRANT SELECT ON TABLES TO ${quoteIdent(role)}`
      );

      // Let the agent login role assume this per-starship role via SET ROLE.
      const loginExists = await this.connection.queryOne<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists`,
        [agentLogin]
      );
      if (loginExists?.exists) {
        await this.connection.query(`GRANT ${quoteIdent(role)} TO ${quoteIdent(agentLogin)}`);
      }
      return true;
    } catch (error) {
      console.warn(
        `[StarshipDatabaseProvisioner] read-only role setup skipped for starship ${starshipId}:`,
        error instanceof Error ? error.message : error
      );
      return false;
    }
  }

  /** Idempotently provision schema + read-only role for a starship. */
  async ensureProvisioned(starshipId: string, opts?: { agentLoginRole?: string }): Promise<void> {
    assertSafeId(starshipId, 'starshipId');
    await this.ensureSchema(starshipId);
    await this.ensureReadOnlyRole(starshipId, opts);
  }

  /** Drop the starship's schema and role. Used when a starship is deleted. */
  async deprovision(starshipId: string): Promise<void> {
    const schema = schemaName(starshipId);
    const role = roleName(starshipId);
    await this.connection.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schema)} CASCADE`);
    try {
      await this.connection.query(`DROP ROLE IF EXISTS ${quoteIdent(role)}`);
    } catch (error) {
      console.warn(
        `[StarshipDatabaseProvisioner] could not drop role for starship ${starshipId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
}

export default StarshipDatabaseProvisioner;
