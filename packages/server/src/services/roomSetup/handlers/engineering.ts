/**
 * Engineering room setup handler.
 *
 * Requires the GitHub connector. On post-connect it lists the repositories the
 * connected GitHub identity can access and seeds them into the room's `repos` Table,
 * so the crew (Anvil et al.) has a real backlog of repositories to operate on without
 * anyone hand-typing owner/repo/branch.
 */

import type { RoomSetupContext, RoomSetupDomainStatus, RoomSetupHandler } from '../types';

const REPOS_TABLE_SLUG = 'repos';

interface RepoRow {
  name: string;
  owner: string;
  repo: string;
  default_branch: string;
}

/** Pull the repo array out of either a bare list or { repositories: [...] }. */
function extractRepoEntries(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object') {
    const repos = (body as Record<string, unknown>).repositories;
    if (Array.isArray(repos)) return repos;
  }
  return [];
}

/** Map a GitHub repository entry to a `repos` Table row, or null if unusable. */
function toRepoRow(raw: unknown): RepoRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const ownerObj = r.owner as Record<string, unknown> | undefined;
  const owner = ownerObj && typeof ownerObj.login === 'string' ? ownerObj.login : undefined;
  const repo = typeof r.name === 'string' ? r.name : undefined;
  if (!owner || !repo) return null;
  return {
    name: typeof r.full_name === 'string' ? r.full_name : `${owner}/${repo}`,
    owner,
    repo,
    default_branch: typeof r.default_branch === 'string' && r.default_branch ? r.default_branch : 'main',
  };
}

export const engineeringSetupHandler: RoomSetupHandler = {
  bundleTag: 'engineering',
  roomSlugs: ['engineering', 'eng'],
  requiredConnectors: ['github'],

  async inspect(ctx: RoomSetupContext): Promise<RoomSetupDomainStatus> {
    const repoCount = await ctx.tableCount(REPOS_TABLE_SLUG);
    return {
      seeded: repoCount > 0,
      summary: repoCount > 0 ? `${repoCount} repositories imported` : 'No repositories imported yet',
      details: { repoCount },
    };
  },

  async run(ctx: RoomSetupContext): Promise<RoomSetupDomainStatus> {
    // GitHub App installation tokens list repos via /installation/repositories, which
    // returns { total_count, repositories: [...] } rather than a bare array.
    const body = await ctx.runConnectorAction('github', 'list-installation-repos', { per_page: 100 });
    const entries = extractRepoEntries(body);
    const rows = entries.map(toRepoRow).filter((r): r is RepoRow => r !== null);
    const { inserted } = await ctx.seedTable(REPOS_TABLE_SLUG, rows as unknown as Array<Record<string, unknown>>);
    return {
      seeded: inserted > 0,
      summary: `Imported ${inserted} repositories from GitHub`,
      details: { repoCount: inserted },
    };
  },
};
