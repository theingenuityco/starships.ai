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

export default router;
