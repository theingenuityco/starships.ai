import { Router } from 'express';
import type { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { getEnvConfig } from '@starships/env';
import { sendError, sendSuccess } from '@/utils/responseHelpers';
import { rateLimiters } from '@/middleware/rateLimiter';

const router: Router = Router();

const ExtractBioSchema = z.object({
  websiteUrl: z.string().url().max(500),
});

const SuggestIcpsSchema = z.object({
  companyName: z.string().min(1).max(200),
  websiteUrl: z.string().max(500).optional(),
  bio: z.string().min(10).max(2000),
});

const PreviewAccountsSchema = z.object({
  companyName: z.string().min(1).max(200),
  icp: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    traits: z.object({
      industry: z.string(),
      roles: z.array(z.string()),
      companySize: z.string(),
      geography: z.string(),
    }),
    estimatedAccountCount: z.number(),
  }),
});

async function callOpenRouter(systemPrompt: string, userPrompt: string): Promise<string> {
  const { OPENROUTER_API_KEY } = getEnvConfig();

  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://starships.ai',
      'X-Title': 'Starships.ai',
    },
    body: JSON.stringify({
      model: 'openai/gpt-5.2',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenRouter error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? '';
}

function parseJsonFromLlm(content: string): unknown {
  const cleaned = content
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();
  return JSON.parse(cleaned);
}

/**
 * POST /public/automate/extract-bio
 * Fetches a website URL server-side and uses AI to extract a company bio.
 * Public endpoint — no auth required.
 */
router.post('/public/automate/extract-bio', rateLimiters.sensitive, async (req: Request, res: Response): Promise<void> => {
  try {
    const { websiteUrl } = ExtractBioSchema.parse(req.body);

    // Fetch the website server-side (avoids CORS, sanitizes the URL)
    let rawHtml: string;
    try {
      // Use AbortController for broader Node.js version compatibility
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const pageRes = await fetch(websiteUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Starships.ai/1.0; +https://starships.ai)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!pageRes.ok) {
          sendError(res, 'SERVICE_UNAVAILABLE', 'Could not fetch the website', 422);
          return;
        }
        rawHtml = await pageRes.text();
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (fetchError) {
      console.error('[automate/extract-bio] Website fetch failed:', fetchError);
      sendError(res, 'SERVICE_UNAVAILABLE', 'Could not reach the website', 422);
      return;
    }

    // --- Extract the most useful signals from the HTML ---

    // 1. <title>
    const titleMatch = rawHtml.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1]!.trim() : '';

    // 2. <meta name="description" content="..."> (attribute order can vary)
    const metaDescMatch =
      rawHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,500})["']/i) ??
      rawHtml.match(/<meta[^>]+content=["']([^"']{1,500})["'][^>]+name=["']description["']/i);
    const metaDesc = metaDescMatch ? metaDescMatch[1]!.trim() : '';

    // 3. <meta property="og:description" content="...">
    const ogDescMatch =
      rawHtml.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,500})["']/i) ??
      rawHtml.match(/<meta[^>]+content=["']([^"']{1,500})["'][^>]+property=["']og:description["']/i);
    const ogDesc = ogDescMatch ? ogDescMatch[1]!.trim() : '';

    // 4. Body text — strip scripts/styles/tags, decode entities, collapse whitespace
    const bodyText = rawHtml
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000);

    // Combine signals — meta/og descriptions are the most reliable for SPA/Next.js sites
    const signals = [
      pageTitle ? `Page title: ${pageTitle}` : '',
      metaDesc ? `Meta description: ${metaDesc}` : '',
      ogDesc && ogDesc !== metaDesc ? `OG description: ${ogDesc}` : '',
      bodyText.length > 100 ? `Page text excerpt: ${bodyText}` : '',
    ].filter(Boolean).join('\n');

    if (!signals) {
      sendError(res, 'INVALID_INPUT', 'Not enough content found on the website', 422);
      return;
    }

    const systemPrompt = `You are a business analyst. Given signals extracted from a company website (title, meta descriptions, page text), write a concise 2-4 sentence company bio describing what the company does, who their customers are, and what problem they solve. Be factual and specific. Return ONLY the bio text — no labels, no quotes, no extra formatting.`;

    const userPrompt = `Website: ${websiteUrl}

Extracted signals:
${signals}

Write a 2-4 sentence company bio based on these signals.`;

    let bio: string;
    try {
      bio = await callOpenRouter(systemPrompt, userPrompt);
    } catch (llmError) {
      console.error('[automate/extract-bio] OpenRouter call failed:', llmError);
      sendError(res, 'SERVICE_UNAVAILABLE', 'AI service unavailable, please describe your company manually', 503);
      return;
    }

    sendSuccess(res, { bio: bio.trim() }, 200);
  } catch (error) {
    if (error instanceof ZodError) {
      sendError(res, 'VALIDATION_ERROR', error.issues[0]?.message ?? 'Invalid input', 400);
      return;
    }
    console.error('[automate/extract-bio] Unexpected error:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to extract bio from website', 500);
  }
});

/**
 * POST /public/automate/suggest-icps
 * Given a company name + bio, returns 3-4 AI-generated ICP profiles.
 * Public endpoint — no auth required.
 */
router.post('/public/automate/suggest-icps', rateLimiters.sensitive, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = SuggestIcpsSchema.parse(req.body);

    const systemPrompt = `You are a B2B sales strategy expert. Given a company description, generate 3-4 distinct Ideal Customer Profile (ICP) segments they should target. Always return ONLY a valid JSON array with no markdown, no explanation, and no surrounding text.`;

    const userPrompt = `Company: ${body.companyName}
${body.websiteUrl ? `Website: ${body.websiteUrl}` : ''}
Description: ${body.bio}

Generate 3-4 ICP profiles as a JSON array. Make each profile distinct (different industry/role/size). Each profile must follow this exact shape:
{
  "id": "kebab-case-slug",
  "name": "Short 2-4 Word Profile Name",
  "description": "1-2 sentence description of this customer segment and why they need this product.",
  "traits": {
    "industry": "Specific industry name",
    "roles": ["Job Title 1", "Job Title 2"],
    "companySize": "X-Y employees",
    "geography": "Region"
  },
  "estimatedAccountCount": 5000
}

Return ONLY the JSON array. No other text.`;

    const content = await callOpenRouter(systemPrompt, userPrompt);

    let profiles: unknown;
    try {
      profiles = parseJsonFromLlm(content);
      if (!Array.isArray(profiles)) throw new Error('Not an array');
    } catch {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to parse AI response', 500);
      return;
    }

    sendSuccess(res, { profiles }, 200);
  } catch (error) {
    if (error instanceof ZodError) {
      sendError(res, 'VALIDATION_ERROR', error.issues[0]?.message ?? 'Invalid input', 400);
      return;
    }
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to generate ICP suggestions', 500);
  }
});

/**
 * POST /public/automate/preview-accounts
 * Given a company name + ICP profile, returns 10 realistic AI-generated account rows.
 * Public endpoint — no auth required.
 */
router.post('/public/automate/preview-accounts', rateLimiters.sensitive, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = PreviewAccountsSchema.parse(req.body);
    const { icp, companyName } = body;

    const systemPrompt = `You are a B2B sales database expert. Generate realistic, diverse company account data for sales prospecting. Always return ONLY a valid JSON array with no markdown, no explanation, and no surrounding text.`;

    const userPrompt = `Generate 10 realistic company accounts that match this Ideal Customer Profile:

ICP: ${icp.name}
Industry: ${icp.traits.industry}
Roles: ${icp.traits.roles.join(', ')}
Company Size: ${icp.traits.companySize}
Geography: ${icp.traits.geography}
Description: ${icp.description}

These are prospects for: ${companyName}

Return a JSON array of exactly 10 accounts. Each account must have:
{
  "company": "Real-sounding company name",
  "role": "Specific job title from the ICP roles",
  "industry": "Specific industry",
  "size": "Employee count range (e.g. 11-50)",
  "location": "City, Country"
}

Use varied, realistic company names and locations. Return ONLY the JSON array.`;

    const content = await callOpenRouter(systemPrompt, userPrompt);

    let accounts: unknown;
    try {
      accounts = parseJsonFromLlm(content);
      if (!Array.isArray(accounts)) throw new Error('Not an array');
    } catch {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to parse AI response', 500);
      return;
    }

    sendSuccess(res, { accounts }, 200);
  } catch (error) {
    if (error instanceof ZodError) {
      sendError(res, 'VALIDATION_ERROR', error.issues[0]?.message ?? 'Invalid input', 400);
      return;
    }
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to generate account preview', 500);
  }
});

export default router;
