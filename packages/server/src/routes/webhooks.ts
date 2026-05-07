import express, { Request, Response, Router } from 'express';
import crypto from 'crypto';
import { logger } from '@/utils/logger';
import { PlatformSecretService } from '@/services/PlatformSecretService';
import { ConnectorEventIngestionService } from '@/services/ConnectorEventIngestionService';
import { AppError } from '@starships/errors';

const router: Router = Router();

/**
 * Shopify mandatory compliance (GDPR) webhooks
 *
 * Shopify typically delivers multiple topics to a single subscription URI.
 * We branch on `X-Shopify-Topic` and must verify `X-Shopify-Hmac-Sha256`.
 */
const shopifyRawJson = express.raw({ type: 'application/json' });

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

async function resolveShopifyClientSecret(): Promise<string | undefined> {
  // Shopify webhook verification uses the app's OAuth client secret (a.k.a. API secret key).
  // This project stores connector secrets in platform_secrets (DB-backed); no env fallback.
  try {
    const svc = new PlatformSecretService();
    const fromDb = await svc.getSecret('SHOPIFY_CLIENT_SECRET');
    return typeof fromDb === 'string' && fromDb.trim() ? fromDb.trim() : undefined;
  } catch (err) {
    logger.warn('[WEBHOOK] Failed to resolve Shopify client secret from platform secrets', {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

function computeShopifyHmacBase64(secret: string, rawBody: Buffer): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
}

async function shopifyComplianceWebhookHandler(req: Request, res: Response): Promise<void> {
  const topic = (req.get('X-Shopify-Topic') || '').trim();
  const hmacHeader = (req.get('X-Shopify-Hmac-Sha256') || '').trim();

  const allowedTopics = new Set(['customers/data_request', 'customers/redact', 'shop/redact']);
  if (!topic || !allowedTopics.has(topic)) {
    res.status(404).send('Not found');
    return;
  }

  const secret = await resolveShopifyClientSecret();
  if (!secret) {
    logger.warn('[WEBHOOK] Shopify client secret not configured (platform secret SHOPIFY_CLIENT_SECRET)', { topic });
    res.status(500).send('Shopify client secret not configured');
    return;
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const computed = computeShopifyHmacBase64(secret, rawBody);
  if (!hmacHeader || !safeEqual(computed, hmacHeader)) {
    res.status(401).send('Unauthorized');
    return;
  }

  // Shopify expects a fast 200 response.
  res.status(200).json({ received: true });
}

/**
 * POST /api/v1/webhooks
 *
 * Recommended Shopify compliance subscription URI:
 * - `${PUBLIC_URL}/api/v1/webhooks`
 */
router.post('/webhooks', shopifyRawJson, shopifyComplianceWebhookHandler);

/**
 * POST /api/v1/webhooks/connectors/:provider
 *
 * Generic connector webhook ingestion entrypoint. Normalization + verification
 * are template-driven via connector_templates.webhooks_json.
 *
 * NOTE: This route is mounted before JSON body parsing so we can verify signatures.
 */
router.post(
  '/webhooks/connectors/:provider',
  express.raw({ type: '*/*' }),
  async (req: Request, res: Response): Promise<void> => {
    const provider = String(req.params?.provider || '').trim();
    if (!provider) {
      res.status(400).json({ received: false, error: 'provider is required' });
      return;
    }

    try {
      const svc = new ConnectorEventIngestionService();
      const result = await svc.ingestConnectorWebhook({ provider, req });
      res.status(200).json({ received: true, ...result });
    } catch (err) {
      logger.error('[WEBHOOK] Connector webhook ingestion failed', {
        provider,
        error: err instanceof Error ? err.message : String(err),
      });
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ received: false, ...err.toResponse() });
        return;
      }
      res.status(500).json({ received: false, error: { code: 'INTERNAL_ERROR', message: 'Internal error' } });
    }
  }
);

export default router;
