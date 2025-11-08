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
  title: string;
  content: string;
  contentLower: string;
};

const DOCS_ROOT_DIR =
  process.env.PUBLIC_DOCS_DIR ||
  // Resolve from monorepo root when server starts from workspace root
  path.resolve(process.cwd(), 'public-docs');

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
  for await (const relPath of walk(rootDir, rootDir)) {
    const absPath = path.join(rootDir, relPath);
    const content = await fs.promises.readFile(absPath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const firstHeading = lines.find((l) => /^#{1,6}\s+/.test(l)) || '';
    const extractedTitle = firstHeading.replace(/^#{1,6}\s+/, '').trim() || path.basename(relPath).replace(/\.(md|mdx)$/i, '');
    const record: DocRecord = {
      relativePath: relPath.split(path.sep).join('/'),
      title: extractedTitle,
      content,
      contentLower: content.toLowerCase(),
    };
    records.push(record);
  }
  return records;
}

async function getDocsIndex(): Promise<DocRecord[]> {
  if (!docsIndexPromise) {
    docsIndexPromise = buildDocsIndex(DOCS_ROOT_DIR).catch((err) => {
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

function searchDocs(records: DocRecord[], query: string, limit: number): DocSearchResult[] {
  const q = query.trim();
  if (!q) return [];
  const qLower = q.toLowerCase();
  const results: DocSearchResult[] = [];

  for (const rec of records) {
    let score = 0;
    if (rec.title.toLowerCase().includes(qLower)) score += 10;
    // Weight occurrences in content
    score += Math.min(50, countOccurrences(rec.contentLower, qLower));
    if (score === 0) continue;
    results.push({
      slug: toSlug(rec.relativePath),
      title: rec.title,
      excerpt: buildExcerpt(rec.content, qLower),
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
      const listing = index.slice(0, limit).map((r) => ({ slug: toSlug(r.relativePath), title: r.title }));
      sendSuccess(res, {
        query,
        count: index.length,
        results: listing,
        sourceDir: path.basename(DOCS_ROOT_DIR),
      });
      return;
    }

    const results = searchDocs(index, query, limit);
    sendSuccess(res, {
      query,
      count: results.length,
      results,
      sourceDir: path.basename(DOCS_ROOT_DIR),
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
router.get('/docs/*', async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = (req.params as Record<string, unknown>)[0] as string | undefined;
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
    const rec = index.find((r) => toSlug(r.relativePath) === normalizedSlug);
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
