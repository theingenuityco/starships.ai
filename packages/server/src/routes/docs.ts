import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';

const router: Router = Router();

// ----------------------------------------------------------------------------
// Zod schemas
// ----------------------------------------------------------------------------

const DocsQuerySchema = z
  .object({
    q: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).optional(),
  })
  .strict();

// ----------------------------------------------------------------------------
// Docs indexing/search
// ----------------------------------------------------------------------------

type DocRecord = {
  relativePath: string;
  slug: string;
  slugAliases: string[];
  title: string;
  content: string;
  searchContent: string;
  searchContentLower: string;
};

type Frontmatter = {
  title?: string;
  slug?: string;
  [key: string]: string | undefined;
};

function parseFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } {
  // Minimal YAML frontmatter parser:
  // - supports a `---` block at the file start
  // - supports `key: value` single-line fields
  if (!raw.startsWith('---')) return { frontmatter: {}, body: raw };

  const m = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (!m) return { frontmatter: {}, body: raw };

  const fmRaw = m[1] ?? '';
  const frontmatter: Frontmatter = {};
  for (const line of fmRaw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    const kv = trimmed.match(/^([A-Za-z0-9_/-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let value = (kv[2] ?? '').trim();
    value = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();
    frontmatter[key] = value;
  }

  const body = raw.slice(m[0].length);
  return { frontmatter, body };
}

function normalizeDocSlug(input: string): string | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const normalized = raw.replace(/^[./]+/, '').replace(/\\/g, '/').replace(/\.(md|mdx)$/i, '');
  if (!normalized || normalized.includes('..')) return null;
  return normalized;
}

function resolveDocsRootDir(): string {
  // 1) Explicit env override
  const fromEnv = process.env.PUBLIC_DOCS_DIR;
  if (fromEnv && fs.existsSync(fromEnv) && fs.statSync(fromEnv).isDirectory()) {
    return fromEnv;
  }

  // 2) Common locations in dev/prod
  const candidates = [
    // When server is started from repo root
    path.resolve(process.cwd(), 'public-docs'),
    // When server cwd is packages/server (monorepo root two levels up)
    path.resolve(process.cwd(), '..', '..', 'public-docs'),
    path.resolve(process.cwd(), '..', 'public-docs'),
    // K8s/dev mounts for docs source (see k8s manifests)
    path.resolve(process.cwd(), '..', '..', 'packages', 'docs', '.source'),
    path.resolve(process.cwd(), '..', 'packages', 'docs', '.source'),
    path.resolve(process.cwd(), 'packages', 'docs', '.source'),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      return dir;
    }
  }

  // Fallback to original default (will error later with clear message)
  return path.resolve(process.cwd(), 'public-docs');
}

let docsIndexPromise: Promise<DocRecord[]> | null = null;

async function buildDocsIndex(rootDir: string): Promise<DocRecord[]> {
  async function* walk(dir: string, baseDir: string): AsyncGenerator<string> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        yield* walk(fullPath, baseDir);
      } else if (entry.isFile()) {
        if (/\.(md|mdx)$/i.test(entry.name)) {
          yield path.relative(baseDir, fullPath);
        }
      }
    }
  }

  // Ensure directory exists
  const exists = fs.existsSync(rootDir) && fs.statSync(rootDir).isDirectory();
  if (!exists) {
    throw new Error(`Docs directory not found at: ${rootDir}`);
  }

  const records: DocRecord[] = [];
  const usedPrimarySlugs = new Set<string>();
  for await (const relPath of walk(rootDir, rootDir)) {
    const absPath = path.join(rootDir, relPath);
    const content = await fs.promises.readFile(absPath, 'utf-8');

    const { frontmatter, body } = parseFrontmatter(content);

    const bodyLines = body.split(/\r?\n/);
    const firstHeading = bodyLines.find((l) => /^#{1,6}\s+/.test(l)) || '';
    const extractedTitle =
      (frontmatter.title && String(frontmatter.title).trim()) ||
      firstHeading.replace(/^#{1,6}\s+/, '').trim() ||
      path.basename(relPath).replace(/\.(md|mdx)$/i, '');

    const pathSlug = toSlug(relPath);
    const fmSlug = frontmatter.slug ? normalizeDocSlug(frontmatter.slug) : null;
    const slugCandidates = Array.from(new Set([fmSlug, pathSlug].filter(Boolean))) as string[];

    let primarySlug = fmSlug ?? pathSlug;
    if (usedPrimarySlugs.has(primarySlug)) {
      primarySlug = pathSlug;
    }
    if (usedPrimarySlugs.has(primarySlug)) {
      primarySlug = `${pathSlug}-${records.length + 1}`;
    }
    usedPrimarySlugs.add(primarySlug);

    const record: DocRecord = {
      relativePath: relPath.split(path.sep).join('/'),
      slug: primarySlug,
      slugAliases: slugCandidates.filter((s) => s !== primarySlug),
      title: extractedTitle,
      content,
      // Prefer body-only for search/excerpts so frontmatter doesn't dominate results.
      searchContent: body,
      searchContentLower: body.toLowerCase(),
    };
    records.push(record);
  }
  return records;
}

async function getDocsIndex(): Promise<DocRecord[]> {
  if (!docsIndexPromise) {
    docsIndexPromise = buildDocsIndex(resolveDocsRootDir()).catch((err) => {
      // Reset on failure so a subsequent call can retry
      docsIndexPromise = null;
      throw err;
    });
  }
  return docsIndexPromise;
}

type DocSearchResult = {
  slug: string;
  title: string;
  excerpt: string;
  score: number;
};

function toSlug(relativePath: string): string {
  const normalized = relativePath
    .replace(/^[./]+/, '')
    .split(path.sep)
    .join('/');
  return normalized.replace(/\.(md|mdx)$/i, '');
}

function buildExcerpt(content: string, queryLower: string, radius = 160): string {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(queryLower);
  if (idx === -1) {
    const snippet = content.slice(0, radius).replace(/\s+/g, ' ').trim();
    return snippet.length < content.length ? `${snippet}…` : snippet;
  }
  const start = Math.max(0, idx - Math.floor(radius / 2));
  const end = Math.min(content.length, idx + Math.floor(radius / 2));
  const prefix = start > 0 ? '…' : '';
  const suffix = end < content.length ? '…' : '';
  return `${prefix}${content.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
}

function countOccurrences(haystackLower: string, needleLower: string): number {
  if (!needleLower) return 0;
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = haystackLower.indexOf(needleLower, pos);
    if (idx === -1) break;
    count += 1;
    pos = idx + needleLower.length;
  }
  return count;
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

function buildExcerptAtIndex(content: string, idx: number, radius = 160): string {
  if (idx < 0 || idx >= content.length) {
    const snippet = content.slice(0, radius).replace(/\s+/g, ' ').trim();
    return snippet.length < content.length ? `${snippet}…` : snippet;
  }
  const start = Math.max(0, idx - Math.floor(radius / 2));
  const end = Math.min(content.length, idx + Math.floor(radius / 2));
  const prefix = start > 0 ? '…' : '';
  const suffix = end < content.length ? '…' : '';
  return `${prefix}${content.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
}

function searchDocs(records: DocRecord[], query: string, limit: number): DocSearchResult[] {
  const q = query.trim();
  if (!q) return [];
  const qLower = q.toLowerCase();
  const tokens = tokenize(qLower);
  const results: DocSearchResult[] = [];

  for (const rec of records) {
    let score = 0;
    let excerptIdx = -1;
    const titleLower = rec.title.toLowerCase();

    // Phrase match bonus (exact substring of full query)
    const phraseIdx = rec.searchContentLower.indexOf(qLower);
    if (phraseIdx >= 0) {
      score += 20;
      excerptIdx = phraseIdx;
    }

    if (tokens.length > 0) {
      // Title token hits (heavier weight)
      for (const t of tokens) {
        if (!t) continue;
        if (titleLower.includes(t)) {
          score += 10;
        }
      }

      // Content token hits (cap per token to avoid overly long docs dominating)
      for (const t of tokens) {
        if (!t) continue;
        const occurrences = countOccurrences(rec.searchContentLower, t);
        if (occurrences > 0 && excerptIdx === -1) {
          // First token hit - use for excerpt if phrase not found
          excerptIdx = rec.searchContentLower.indexOf(t);
        }
        score += Math.min(15, occurrences); // per-token cap
      }
    } else {
      // Fallback to simple phrase scoring when tokenization yields nothing meaningful
      if (titleLower.includes(qLower)) score += 10;
      score += Math.min(50, countOccurrences(rec.searchContentLower, qLower));
      if (excerptIdx === -1 && score > 0) {
        excerptIdx = rec.searchContentLower.indexOf(qLower);
      }
    }

    if (score === 0) continue;
    results.push({
      slug: rec.slug,
      title: rec.title,
      excerpt: excerptIdx >= 0 ? buildExcerptAtIndex(rec.searchContent, excerptIdx) : buildExcerpt(rec.searchContent, qLower),
      score,
    });
  }

  results.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  return results.slice(0, limit);
}

// ----------------------------------------------------------------------------
// Route handler
// ----------------------------------------------------------------------------

router.get('/docs', async (req: Request, res: Response): Promise<void> => {
  const data = validateData(DocsQuerySchema, req.query, res, 'docs query');
  if (!data) return;
  try {
    const limit = data.limit ?? 20;
    const query = (data.q ?? '').trim();
    const index = await getDocsIndex();

    if (!query) {
      // No query: return a lightweight listing
      const listing = index.slice(0, limit).map((r) => ({ slug: r.slug, title: r.title }));
      sendSuccess(res, {
        query,
        count: index.length,
        results: listing,
        sourceDir: path.basename(resolveDocsRootDir()),
      });
      return;
    }

    const results = searchDocs(index, query, limit);
    sendSuccess(res, {
      query,
      count: results.length,
      results,
      sourceDir: path.basename(resolveDocsRootDir()),
    });
  } catch (error) {
    console.error('[DOCS] Error handling docs route:', error);
    const message = error instanceof Error ? error.message : 'Failed to handle docs request';
    sendError(res, 'INTERNAL_SERVER_ERROR', message, 500);
  }
});

/**
 * GET /docs/[slug] - return raw markdown content for a single doc
 * Supports nested slugs like examples/example-10-kitchen-sink
 */
router.get(/^\/docs\/(.+)$/, async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = (req.params as unknown as string[])[0] as string | undefined;
    const rawSlug = String(raw ?? '').trim();
    if (!rawSlug) {
      sendError(res, 'MISSING_REQUIRED_FIELD', 'Slug is required', 400, { field: 'slug' });
      return;
    }
    // Normalize and validate slug to prevent traversal
    const normalizedSlug = rawSlug
      .replace(/^[./]+/, '')
      .replace(/\\/g, '/')
      .replace(/\.(md|mdx)$/i, '');
    if (!normalizedSlug || normalizedSlug.includes('..')) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid slug', 400, { field: 'slug' });
      return;
    }

    const index = await getDocsIndex();
    const rec = index.find((r) => r.slug === normalizedSlug || r.slugAliases.includes(normalizedSlug));
    if (!rec) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Doc not found', 404, { slug: normalizedSlug });
      return;
    }

    sendSuccess(res, {
      slug: normalizedSlug,
      title: rec.title,
      content: rec.content,
    });
  } catch (error) {
    console.error('[DOCS] Error fetching doc by slug:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch doc';
    sendError(res, 'INTERNAL_SERVER_ERROR', message, 500);
  }
});

export default router;
