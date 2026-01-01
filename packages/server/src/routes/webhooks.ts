import express, { Request, Response, Router } from 'express';
import crypto from 'crypto';
import Stripe from 'stripe';
import { TopupRepository, WalletRepository, LedgerRepository, getConnection } from '@starships/models';
import { logger } from '@/utils/logger';
import { CREDITS_PER_USD, toCreditsString } from '@/config/credits';
import { PlatformSecretService } from '@/services/PlatformSecretService';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

const router: Router = Router();

/**
 * Shopify mandatory compliance (GDPR) webhooks
 *
 * Shopify typically delivers multiple topics to a single subscription URI.
 * We branch on `X-Shopify-Topic` and must verify `X-Shopify-Hmac-Sha256`.
 *
 * Shopify requirements (per docs):
 * - Handle POST requests with a JSON body and `Content-Type: application/json`
 * - If HMAC is invalid (or missing), return 401 Unauthorized
 * - Otherwise return a 200-series status quickly
 *
 * Shopify topics:
 * - customers/data_request
 * - customers/redact
 * - shop/redact
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
    // Don't accidentally ACK unknown topics on this endpoint.
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

  // Shopify expects a fast 200 response. We can add async processing later.
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
 * Stripe webhook to finalize wallet top-ups
 *
 * Notes:
 * - Uses express.raw to preserve body for signature verification
 * - Idempotent: checks topup.status before crediting wallet
 * - Handles both checkout.session.completed and charge.succeeded
 * - Stores stripe_payment_intent and stripe_charge_id for refunds
 */
router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'] as string | undefined;
  if (!sig) {
    logger.warn('[WEBHOOK] Missing Stripe signature header');
    res.status(400).send('Missing Stripe signature');
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET as string);
  } catch (err) {
    logger.error('[WEBHOOK] Stripe signature verification failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        const paymentIntentId =
          typeof session.payment_intent === 'string'
            ? (session.payment_intent as string)
            : (session.payment_intent?.id as string | undefined);

        const connection = getConnection();
        await connection.transaction(async (client) => {
          // Lock by session id if available, otherwise fallback to topup id reference
          let row: TopupRow | null = session.id
            ? ((await client.query<TopupRow>('SELECT * FROM topups WHERE stripe_session_id = $1 FOR UPDATE', [session.id])).rows?.[0] ??
              null)
            : null;

          if (!row && session.client_reference_id) {
            row =
              (await client.query<TopupRow>('SELECT * FROM topups WHERE id = $1 FOR UPDATE', [session.client_reference_id])).rows?.[0] ??
              null;
          }

          if (!row) {
            // If this session is for a ship class upgrade subscription, handle it here.
            const kind = session.metadata?.kind;
            const shipClass = session.metadata?.ship_class;
            if (kind === 'ship_class_upgrade' && shipClass === 'frigate') {
              const starshipId = session.metadata?.starship_id || session.client_reference_id || undefined;
              const userId = session.metadata?.user_id || undefined;
              const subscriptionId =
                typeof session.subscription === 'string'
                  ? session.subscription
                  : (session.subscription as Stripe.Subscription | null)?.id;
              const customerId =
                typeof session.customer === 'string' ? session.customer : (session.customer as Stripe.Customer | null)?.id;

              if (!starshipId || !userId || !subscriptionId || !customerId) {
                logger.warn('[WEBHOOK] Frigate checkout.session.completed missing identifiers', {
                  sessionId: session.id,
                  starshipId,
                  userId,
                  subscriptionId,
                  customerId,
                });
                return;
              }

              // Upsert mapping (one subscription per starship). Entitlements + credits are granted on invoice.paid.
              await client.query(
                `
                INSERT INTO starship_subscriptions (
                  id,
                  starship_id,
                  user_id,
                  stripe_customer_id,
                  stripe_subscription_id,
                  status,
                  created_at,
                  updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                ON CONFLICT (starship_id) DO UPDATE
                SET stripe_customer_id = EXCLUDED.stripe_customer_id,
                    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
                    status = EXCLUDED.status,
                    updated_at = NOW()
                `,
                [`starship-sub-${subscriptionId}`, starshipId, userId, customerId, subscriptionId, 'incomplete']
              );

              logger.info('[WEBHOOK] Recorded frigate subscription mapping from checkout.session.completed', {
                starshipId,
                subscriptionId,
                customerId,
                sessionId: session.id,
              });
              return;
            }

            logger.warn('[WEBHOOK] No matching topup for checkout.session.completed', {
              sessionId: session.id,
              clientRef: session.client_reference_id,
            });
            return; // nothing to do
          }

          if (row.status === 'completed') {
            logger.info('[WEBHOOK] Topup already completed - idempotent exit', { topupId: row.id });
            // Ensure we persist PI if missing
            if (paymentIntentId && !row.stripe_payment_intent) {
              await client.query('UPDATE topups SET stripe_payment_intent = $1, updated_at = NOW() WHERE id = $2', [
                paymentIntentId,
                row.id,
              ]);
            }
            return;
          }

          // Credit wallet and mark topup completed atomically + append immutable ledger
          const topupRepo = new TopupRepository();
          const walletRepo = new WalletRepository();
          const ledgerRepo = new LedgerRepository();

          const amountUsd: string = row.amount_usd; // DECIMAL(18,4) stored as string
          const creditsGranted = toCreditsString((Number(amountUsd) || 0) * Number(CREDITS_PER_USD || 0));
          const { balance } = await walletRepo.incrementBalanceReturningWithClient(client, row.wallet_id, creditsGranted);
          await topupRepo.markCompletedWithClient(row.id, paymentIntentId ?? null, null, client);

          await ledgerRepo.createWithClient(client, {
            walletId: row.wallet_id,
            type: 'TOPUP',
            amount: creditsGranted,
            balanceAfter: balance,
            meta: {
              topupId: row.id,
              stripeSession: session.id,
              stripePaymentIntent: paymentIntentId ?? null,
              stripeEvent: event.id,
              amountUsd,
              creditsGranted,
              creditsPerUsd: Number(CREDITS_PER_USD),
            },
          });
        });

        break;
      }

      /**
       * Subscription monthly credit grants: grant +1000 credits on successful invoice payment.
       */
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceId = invoice.id;
        const invoiceAny = invoice as unknown as { subscription?: unknown };
        const subscriptionRaw = invoiceAny.subscription as any;
        const subscriptionId = typeof subscriptionRaw === 'string' ? subscriptionRaw : (subscriptionRaw as { id?: string } | null)?.id;
        if (!subscriptionId) break;

        const connection = getConnection();
        await connection.transaction(async (client) => {
          // Lock subscription mapping row to ensure idempotency under concurrency
          const subRes = await client.query<{
            starship_id: string;
            user_id: string;
            stripe_customer_id: string;
            status: string;
          }>('SELECT * FROM starship_subscriptions WHERE stripe_subscription_id = $1 FOR UPDATE', [subscriptionId]);
          const subRow = subRes.rows?.[0] ?? null;
          if (!subRow) {
            logger.warn('[WEBHOOK] invoice.paid but no starship_subscriptions mapping found', { subscriptionId, invoiceId });
            return;
          }

          // Mark as active (invoice paid implies an active/paid period)
          await client.query(
            `UPDATE starship_subscriptions
               SET status = $1,
                   updated_at = NOW()
             WHERE stripe_subscription_id = $2`,
            ['active', subscriptionId]
          );

          // Apply Frigate entitlements
          await client.query(
            `UPDATE starships
                SET ship_class = 'frigate',
                    max_agents = 12,
                    max_concurrent_turns = 2,
                    updated_at = NOW()
              WHERE id = $1`,
            [subRow.starship_id]
          );

          // Lock wallet
          const walletRes = await client.query<{ id: string }>('SELECT id FROM wallets WHERE starship_id = $1 FOR UPDATE', [subRow.starship_id]);
          const walletRow = walletRes.rows?.[0] ?? null;
          if (!walletRow) {
            logger.warn('[WEBHOOK] invoice.paid: wallet not found for starship', { starshipId: subRow.starship_id, invoiceId });
            return;
          }

          // Idempotency: if we've already granted for this invoice, exit
          const existingRes = await client.query<{ id: string }>(
            `SELECT id
               FROM wallet_ledger
              WHERE wallet_id = $1
                AND type = 'ADJUSTMENT'
                AND (meta ->> 'invoiceId') = $2
              LIMIT 1`,
            [walletRow.id, invoiceId]
          );
          if ((existingRes.rows?.[0] ?? null) !== null) {
            logger.info('[WEBHOOK] invoice.paid grant already applied (idempotent exit)', { walletId: walletRow.id, invoiceId });
            return;
          }

          const creditsGranted = toCreditsString(1000);
          const walletRepo = new WalletRepository();
          const ledgerRepo = new LedgerRepository();

          const { balance } = await walletRepo.incrementBalanceReturningWithClient(client, walletRow.id, creditsGranted);
          await ledgerRepo.createWithClient(client, {
            walletId: walletRow.id,
            type: 'ADJUSTMENT',
            amount: creditsGranted,
            balanceAfter: balance,
            meta: {
              reason: 'SUBSCRIPTION_CREDIT_GRANT',
              shipClass: 'frigate',
              invoiceId,
              subscriptionId,
              starshipId: subRow.starship_id,
              creditsGranted,
              stripeEvent: event.id,
            },
          });
        });

        break;
      }

      /**
       * Subscription state updates: upgrade/downgrade entitlements based on Stripe status.
       * Credits are granted only on invoice.paid.
       */
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;
        const status = subscription.status;
        const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
        const subAny = subscription as unknown as { current_period_start?: number; current_period_end?: number };
        const cps = subAny.current_period_start ? new Date(subAny.current_period_start * 1000).toISOString() : null;
        const cpe = subAny.current_period_end ? new Date(subAny.current_period_end * 1000).toISOString() : null;

        const connection = getConnection();
        await connection.transaction(async (client) => {
          // Try to find mapping row; if missing, attempt to upsert from metadata
          let row = (
            await client.query<{
              starship_id: string;
              user_id: string;
            }>('SELECT starship_id, user_id FROM starship_subscriptions WHERE stripe_subscription_id = $1 FOR UPDATE', [subscriptionId])
          ).rows?.[0];

          if (!row) {
            const starshipId = subscription.metadata?.starship_id;
            const userId = subscription.metadata?.user_id;
            const customerId = typeof subscription.customer === 'string' ? subscription.customer : (subscription.customer as any)?.id;
            if (starshipId && userId && customerId) {
              await client.query(
                `
                INSERT INTO starship_subscriptions (
                  id,
                  starship_id,
                  user_id,
                  stripe_customer_id,
                  stripe_subscription_id,
                  status,
                  current_period_start,
                  current_period_end,
                  cancel_at_period_end,
                  created_at,
                  updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
                ON CONFLICT (starship_id) DO UPDATE
                SET stripe_customer_id = EXCLUDED.stripe_customer_id,
                    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
                    status = EXCLUDED.status,
                    current_period_start = EXCLUDED.current_period_start,
                    current_period_end = EXCLUDED.current_period_end,
                    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
                    updated_at = NOW()
                `,
                [`starship-sub-${subscriptionId}`, starshipId, userId, customerId, subscriptionId, status, cps, cpe, cancelAtPeriodEnd]
              );
              row = { starship_id: starshipId, user_id: userId };
            } else {
              logger.warn('[WEBHOOK] subscription update without mapping and missing metadata', {
                subscriptionId,
                status,
                hasStarshipId: Boolean(starshipId),
                hasUserId: Boolean(userId),
              });
              return;
            }
          } else {
            // Update mapping fields
            await client.query(
              `UPDATE starship_subscriptions
                  SET status = $1,
                      current_period_start = $2,
                      current_period_end = $3,
                      cancel_at_period_end = $4,
                      updated_at = NOW()
                WHERE stripe_subscription_id = $5`,
              [status, cps, cpe, cancelAtPeriodEnd, subscriptionId]
            );
          }

          const isPaying = status === 'active' || status === 'trialing';
          if (isPaying) {
            await client.query(
              `UPDATE starships
                  SET ship_class = 'frigate',
                      max_agents = 12,
                      max_concurrent_turns = 2,
                      updated_at = NOW()
                WHERE id = $1`,
              [row.starship_id]
            );
          } else {
            await client.query(
              `UPDATE starships
                  SET ship_class = 'scout',
                      max_agents = LEAST(max_agents, 5),
                      max_concurrent_turns = 1,
                      updated_at = NOW()
                WHERE id = $1`,
              [row.starship_id]
            );
          }
        });

        break;
      }

      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;

        const paymentIntentId =
          typeof session.payment_intent === 'string'
            ? (session.payment_intent as string)
            : (session.payment_intent?.id as string | undefined);

        const connection = getConnection();
        await connection.transaction(async (client) => {
          // Lock by session id if available, otherwise fallback to topup id reference
          let row: TopupRow | null = session.id
            ? ((await client.query<TopupRow>('SELECT * FROM topups WHERE stripe_session_id = $1 FOR UPDATE', [session.id])).rows?.[0] ??
              null)
            : null;

          if (!row && session.client_reference_id) {
            row =
              (await client.query<TopupRow>('SELECT * FROM topups WHERE id = $1 FOR UPDATE', [session.client_reference_id])).rows?.[0] ??
              null;
          }

          if (!row) {
            logger.warn('[WEBHOOK] No matching topup for checkout.session.async_payment_succeeded', {
              sessionId: session.id,
              clientRef: session.client_reference_id,
            });
            return; // nothing to do
          }

          if (row.status === 'completed') {
            logger.info('[WEBHOOK] Topup already completed - idempotent exit', { topupId: row.id });
            // Ensure we persist PI if missing
            if (paymentIntentId && !row.stripe_payment_intent) {
              await client.query('UPDATE topups SET stripe_payment_intent = $1, updated_at = NOW() WHERE id = $2', [
                paymentIntentId,
                row.id,
              ]);
            }
            return;
          }

          // Credit wallet and mark topup completed atomically + append immutable ledger
          const topupRepo = new TopupRepository();
          const walletRepo = new WalletRepository();
          const ledgerRepo = new LedgerRepository();

          const amountUsd: string = row.amount_usd; // DECIMAL stored as string
          const creditsGranted = toCreditsString((Number(amountUsd) || 0) * Number(CREDITS_PER_USD || 0));
          const { balance } = await walletRepo.incrementBalanceReturningWithClient(client, row.wallet_id, creditsGranted);
          await topupRepo.markCompletedWithClient(row.id, paymentIntentId ?? null, null, client);

          await ledgerRepo.createWithClient(client, {
            walletId: row.wallet_id,
            type: 'TOPUP',
            amount: creditsGranted,
            balanceAfter: balance,
            meta: {
              topupId: row.id,
              stripeSession: session.id,
              stripePaymentIntent: paymentIntentId ?? null,
              stripeEvent: event.id,
              amountUsd,
              creditsGranted,
              creditsPerUsd: Number(CREDITS_PER_USD),
            },
          });
        });

        break;
      }
      case 'charge.succeeded': {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId =
          typeof charge.payment_intent === 'string'
            ? (charge.payment_intent as string)
            : (charge.payment_intent as Stripe.PaymentIntent | null)?.id;

        const stripeChargeId = charge.id;

        const topupRepo = new TopupRepository();
        let topup = paymentIntentId ? await topupRepo.findByStripePaymentIntent(paymentIntentId) : null;

        // Fallback: try using metadata.topup_id if present on charge
        if (!topup && charge.metadata && charge.metadata.topup_id) {
          topup = await topupRepo.findById(charge.metadata.topup_id);
        }

        if (!topup) {
          logger.warn('[WEBHOOK] charge.succeeded received but no matching topup found', {
            paymentIntentId,
            stripeChargeId,
          });
          break;
        }

        const connection = getConnection();
        await connection.transaction(async (client) => {
          // Lock row to ensure idempotency
          const locked = (await client.query<TopupRow>('SELECT * FROM topups WHERE id = $1 FOR UPDATE', [topup!.id])).rows?.[0];

          if (!locked) {
            logger.warn('[WEBHOOK] Topup disappeared during transaction', { topupId: topup!.id });
            return;
          }

          const walletRepo = new WalletRepository();
          const ledgerRepo = new LedgerRepository();
          const amountUsd: string = locked.amount_usd;
          const creditsGranted = toCreditsString((Number(amountUsd) || 0) * Number(CREDITS_PER_USD || 0));

          if (locked.status !== 'completed') {
            // Not yet credited (e.g., if checkout.session.completed didn't run), credit now
            const { balance } = await walletRepo.incrementBalanceReturningWithClient(client, locked.wallet_id, creditsGranted);
            await topupRepo.markCompletedWithClient(locked.id, paymentIntentId ?? null, stripeChargeId, client);

            await ledgerRepo.createWithClient(client, {
              walletId: locked.wallet_id,
              type: 'TOPUP',
              amount: creditsGranted,
              balanceAfter: balance,
              meta: {
                topupId: locked.id,
                stripePaymentIntent: paymentIntentId ?? null,
                stripeChargeId: stripeChargeId,
                stripeEvent: event.id,
                amountUsd,
                creditsGranted,
                creditsPerUsd: Number(CREDITS_PER_USD),
              },
            });
          } else if (!locked.stripe_charge_id) {
            // Already completed; just persist charge id if missing
            await client.query(
              `
              UPDATE topups
              SET stripe_charge_id = $1,
                  updated_at = NOW()
              WHERE id = $2
            `,
              [stripeChargeId, locked.id]
            );
          }
        });

        break;
      }

      // Failure/expiration scenarios
      case 'charge.failed':
      case 'payment_intent.payment_failed':
      case 'checkout.session.expired': {
        let topupId: string | undefined;
        let sessionId: string | undefined;
        let paymentIntentId: string | undefined;

        if (event.type === 'checkout.session.expired') {
          const s = event.data.object as Stripe.Checkout.Session;
          sessionId = s.id;
          topupId = s.client_reference_id ?? undefined;
        } else if (event.type === 'charge.failed') {
          const c = event.data.object as Stripe.Charge;
          paymentIntentId =
            typeof c.payment_intent === 'string' ? (c.payment_intent as string) : (c.payment_intent as Stripe.PaymentIntent | null)?.id;
        } else if (event.type === 'payment_intent.payment_failed') {
          const pi = event.data.object as Stripe.PaymentIntent;
          paymentIntentId = pi.id;
        }

        const connection = getConnection();
        await connection.transaction(async (client) => {
          let row: TopupRow | null = null;

          if (sessionId) {
            row =
              (await client.query<TopupRow>('SELECT * FROM topups WHERE stripe_session_id = $1 FOR UPDATE', [sessionId])).rows?.[0] ?? null;
          }

          if (!row && topupId) {
            row = (await client.query<TopupRow>('SELECT * FROM topups WHERE id = $1 FOR UPDATE', [topupId])).rows?.[0] ?? null;
          }

          if (!row && paymentIntentId) {
            row =
              (await client.query<TopupRow>('SELECT * FROM topups WHERE stripe_payment_intent = $1 FOR UPDATE', [paymentIntentId]))
                .rows?.[0] ?? null;
          }

          if (!row) {
            logger.warn('[WEBHOOK] Failure event with no matching topup', {
              sessionId,
              paymentIntentId,
              topupId,
              type: event.type,
            });
            return;
          }

          if (row.status !== 'completed') {
            await client.query('UPDATE topups SET status = $1, updated_at = NOW() WHERE id = $2', ['failed', row.id]);
            logger.info('[WEBHOOK] Marked topup as failed due to Stripe event', { topupId: row.id, type: event.type });
          }
        });

        break;
      }

      default: {
        logger.debug('[WEBHOOK] Unhandled Stripe event type', { type: event.type, id: event.id });
      }
    }
  } catch (err) {
    logger.error('[WEBHOOK] Error handling Stripe webhook', {
      type: event.type,
      id: event.id,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).send('Internal error');
    return;
  }

  // Acknowledge receipt to Stripe
  res.json({ received: true });
});

export default router;

type TopupStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

interface TopupRow {
  id: string;
  wallet_id: string;
  amount_usd: string;
  status: TopupStatus;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  stripe_charge_id: string | null;
}
