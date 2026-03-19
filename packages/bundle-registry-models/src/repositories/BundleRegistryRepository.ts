import { getConnection, type PostgresConnection } from '@/helpers/database';

export type BundleKind = 'agent_bundle' | 'room_bundle';
export type BundleVisibility = 'private' | 'public';

export type BundleRow = {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  kind: BundleKind;
  visibility: BundleVisibility;
  createdByUserId: string | null;
  createdAt: string;
};

export type BundleVersionRow = {
  id: string;
  bundleId: string;
  version: string;
  createdAt: string;
  createdByUserId: string | null;
  sourceStarshipId: string | null;
  sourceStarshipSlug: string | null;
  schemaVersion: string;
  bundleHash: string;
  artifactKey: string;
  artifactSize: number;
  artifactSha256: string;
  contentSha256: string;
  fileCount: number;
  agentsCount: number;
  toolsCount: number;
  roomsCount: number;
  viewsCount: number;
  datasetsCount: number;
  taskBoardsCount: number;
};

function mapBundleRow(r: any): BundleRow {
  return {
    id: String(r.id),
    slug: String(r.slug),
    displayName: String(r.display_name),
    description: String(r.description ?? ''),
    kind: String(r.kind) as BundleKind,
    visibility: String(r.visibility) as BundleVisibility,
    createdByUserId: r.created_by_user_id ? String(r.created_by_user_id) : null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

function mapVersionRow(r: any): BundleVersionRow {
  return {
    id: String(r.id),
    bundleId: String(r.bundle_id),
    version: String(r.version),
    createdAt: new Date(r.created_at).toISOString(),
    createdByUserId: r.created_by_user_id ? String(r.created_by_user_id) : null,
    sourceStarshipId: r.source_starship_id ? String(r.source_starship_id) : null,
    sourceStarshipSlug: r.source_starship_slug ? String(r.source_starship_slug) : null,
    schemaVersion: String(r.schema_version),
    bundleHash: String(r.bundle_hash),
    artifactKey: String(r.artifact_key),
    artifactSize: Number(r.artifact_size),
    artifactSha256: String(r.artifact_sha256),
    contentSha256: String(r.content_sha256),
    fileCount: Number(r.file_count ?? 0),
    agentsCount: Number(r.agents_count ?? 0),
    toolsCount: Number(r.tools_count ?? 0),
    roomsCount: Number(r.rooms_count ?? 0),
    viewsCount: Number(r.views_count ?? 0),
    datasetsCount: Number(r.datasets_count ?? 0),
    taskBoardsCount: Number(r.task_boards_count ?? 0),
  };
}

export class BundleRegistryRepository {
  private conn: PostgresConnection;
  constructor(connection?: PostgresConnection) {
    this.conn = connection ?? getConnection();
  }

  async createBundle(args: {
    id: string;
    slug: string;
    displayName: string;
    description: string;
    kind: BundleKind;
    visibility: BundleVisibility;
    createdByUserId: string | null;
  }): Promise<BundleRow> {
    const rows = await this.conn.query(
      `
      INSERT INTO bundles (id, slug, display_name, description, kind, visibility, created_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [args.id, args.slug, args.displayName, args.description, args.kind, args.visibility, args.createdByUserId]
    );
    return mapBundleRow(rows[0]);
  }

  async listBundles(): Promise<BundleRow[]> {
    const rows = await this.conn.query(`SELECT * FROM bundles ORDER BY created_at DESC`);
    return rows.map(mapBundleRow);
  }

  async findBundleById(id: string): Promise<BundleRow | null> {
    const row = await this.conn.queryOne(`SELECT * FROM bundles WHERE id = $1`, [id]);
    return row ? mapBundleRow(row) : null;
  }

  async findBundleBySlug(slug: string): Promise<BundleRow | null> {
    const row = await this.conn.queryOne(`SELECT * FROM bundles WHERE slug = $1`, [slug]);
    return row ? mapBundleRow(row) : null;
  }

  async createBundleVersion(args: {
    id: string;
    bundleId: string;
    version: string;
    createdByUserId: string | null;
    sourceStarshipId: string | null;
    sourceStarshipSlug: string | null;
    schemaVersion: string;
    bundleHash: string;
    artifactKey: string;
    artifactSize: number;
    artifactSha256: string;
    contentSha256: string;
    fileCount: number;
    agentsCount: number;
    toolsCount: number;
    roomsCount: number;
    viewsCount: number;
    datasetsCount: number;
    taskBoardsCount: number;
  }): Promise<BundleVersionRow> {
    const rows = await this.conn.query(
      `
      INSERT INTO bundle_versions (
        id, bundle_id, version,
        created_by_user_id,
        source_starship_id, source_starship_slug,
        schema_version,
        bundle_hash,
        artifact_key, artifact_size, artifact_sha256, content_sha256,
        file_count,
        agents_count, tools_count, rooms_count, views_count, datasets_count, task_boards_count
      )
      VALUES (
        $1,$2,$3,
        $4,
        $5,$6,
        $7,
        $8,
        $9,$10,$11,$12,
        $13,
        $14,$15,$16,$17,$18,$19
      )
      RETURNING *
      `,
      [
        args.id,
        args.bundleId,
        args.version,
        args.createdByUserId,
        args.sourceStarshipId,
        args.sourceStarshipSlug,
        args.schemaVersion,
        args.bundleHash,
        args.artifactKey,
        args.artifactSize,
        args.artifactSha256,
        args.contentSha256,
        args.fileCount,
        args.agentsCount,
        args.toolsCount,
        args.roomsCount,
        args.viewsCount,
        args.datasetsCount,
        args.taskBoardsCount,
      ]
    );
    return mapVersionRow(rows[0]);
  }

  async listVersionsByBundle(bundleId: string): Promise<BundleVersionRow[]> {
    const rows = await this.conn.query(`SELECT * FROM bundle_versions WHERE bundle_id = $1 ORDER BY created_at DESC`, [bundleId]);
    return rows.map(mapVersionRow);
  }

  async findVersionById(id: string): Promise<BundleVersionRow | null> {
    const row = await this.conn.queryOne(`SELECT * FROM bundle_versions WHERE id = $1`, [id]);
    return row ? mapVersionRow(row) : null;
  }
}

