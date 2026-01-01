import express, { Request, Response, Router } from 'express';
import crypto from 'crypto';
import Stripe from 'stripe';
import { logger } from '@/utils/logger';
import { PlatformSecretService } from '@/services/PlatformSecretService';
import { StripeWebhookService } from '@/services/StripeWebhookService';
import { getEnvConfig } from '@starships/env';

const envConfig = getEnvConfig();
const stripe = new Stripe(envConfig.STRIPE_SECRET_KEY);

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
 * POST /api/v1/webhooks/stripe
 *
 * IMPORTANT:
 * - Route is a thin controller: verify signature + delegate to service layer.
 * - All DB mutations happen inside `StripeWebhookService`.
 */
router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'] as string | undefined;
  if (!sig) {
    logger.warn('[WEBHOOK] Missing Stripe signature header');
    res.status(400).send('Missing Stripe signature');
    return;
  }

  const signingSecret = (envConfig.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!signingSecret) {
    logger.error('[WEBHOOK] STRIPE_WEBHOOK_SECRET is not configured; refusing to process Stripe webhooks');
    res.status(500).send('Stripe webhook signing secret not configured');
    return;
  }

  // express.raw() should produce a Buffer; if a JSON parser ran first, the body may already be consumed.
  if (!Buffer.isBuffer(req.body)) {
    logger.error('[WEBHOOK] Stripe webhook received non-raw body; cannot verify signature safely', {
      bodyType: typeof req.body,
    });
    res.status(400).send('Invalid webhook payload');
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, signingSecret);
  } catch (err) {
    logger.error('[WEBHOOK] Stripe signature verification failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    return;
  }

  try {
    await StripeWebhookService.handleEvent(event);
  } catch (err) {
    logger.error('[WEBHOOK] Error handling Stripe webhook', {
      type: event.type,
      id: event.id,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).send('Internal error');
    return;
  }

  res.json({ received: true });
});

export default router;
