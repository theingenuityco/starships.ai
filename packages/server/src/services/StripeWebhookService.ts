import Stripe from 'stripe';
import { TopupRepository, WalletRepository, LedgerRepository, getConnection } from '@starships/models';
import { logger } from '@/utils/logger';
import { CREDITS_PER_USD, toCreditsString } from '@/config/credits';
import { getEnvConfig } from '@starships/env';

const envConfig = getEnvConfig();
const stripe = new Stripe(envConfig.STRIPE_SECRET_KEY);

type TopupRow = {
  id: string;
  wallet_id: string;
  amount_usd: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  stripe_charge_id: string | null;
};

function parseIntOrNull(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function hasId(v: unknown): v is { id: string } {
  if (!v || typeof v !== 'object') return false;
  return 'id' in v && typeof (v as { id?: unknown }).id === 'string';
}

function expandableId(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (hasId(v)) return v.id;
  return null;
}

function readRequiredPlanMetadata(price: Stripe.Price): {
  shipClass: string;
  maxAgents: number;
  maxConcurrentTurns: number;
  monthlyCredits: number;
} {
  const md = price.metadata || {};
  const shipClass = (md.ship_class || md.shipClass || '').toString();
  const maxAgents = parseIntOrNull(md.max_agents ?? md.maxAgents);
  const maxConcurrentTurns = parseIntOrNull(md.max_concurrent_turns ?? md.maxConcurrentTurns);
  const monthlyCredits = parseIntOrNull(md.monthly_credits ?? md.monthlyCredits);

  if (!shipClass || maxAgents === null || maxConcurrentTurns === null || monthlyCredits === null) {
    throw new Error('MISSING_PLAN_METADATA');
  }
  return { shipClass, maxAgents, maxConcurrentTurns, monthlyCredits };
}

export class StripeWebhookService {
  /**
   * Handle a verified Stripe webhook event.
   * Routes should be thin controllers; all DB work happens here.
   */
  static async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event);
        return;
      case 'checkout.session.async_payment_succeeded':
        await this.handleCheckoutSessionAsyncPaymentSucceeded(event);
        return;
      case 'charge.succeeded':
        await this.handleChargeSucceeded(event);
        return;
      case 'invoice.paid':
        await this.handleInvoicePaid(event);
        return;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleSubscriptionChanged(event);
        return;
      // Failure/expiration scenarios for topups (existing behavior)
      case 'charge.failed':
      case 'payment_intent.payment_failed':
      case 'checkout.session.expired':
        await this.handleTopupFailureEvents(event);
        return;
      default:
        return;
    }
  }

  // ---------------------------------------------------------------------------
  // TOPUPS (existing behavior, moved out of route)
  // ---------------------------------------------------------------------------

  private static async handleCheckoutSessionCompleted(event: Stripe.Event): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;

    // Subscription checkout completion (ship class upgrades) — only handle sessions created by our code.
    // StripeService.createSubscriptionCheckoutSession sets:
    // - session.mode = 'subscription'
    // - session.metadata.kind = 'ship_class_subscription'
    if (session.mode === 'subscription') {
      if (session.metadata?.kind !== 'ship_class_subscription') {
        logger.warn('[WEBHOOK] subscription checkout completed with unexpected/missing metadata.kind', {
          sessionId: session.id,
          kind: session.metadata?.kind ?? null,
        });
        return;
      }
      await this.handleShipClassSubscriptionCheckoutCompleted(event, session);
      return;
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string' ? (session.payment_intent as string) : (session.payment_intent?.id as string | undefined);

    const connection = getConnection();
    await connection.transaction(async (client) => {
      let row: TopupRow | null = session.id
        ? ((await client.query<TopupRow>('SELECT * FROM topups WHERE stripe_session_id = $1 FOR UPDATE', [session.id])).rows?.[0] ?? null)
        : null;

      if (!row && session.client_reference_id) {
        row =
          (await client.query<TopupRow>('SELECT * FROM topups WHERE id = $1 FOR UPDATE', [session.client_reference_id])).rows?.[0] ?? null;
      }

      if (!row) {
        // Not a topup checkout; ignore (subscription logic is handled on invoice.paid)
        logger.warn('[WEBHOOK] No matching topup for checkout.session.completed', {
          sessionId: session.id,
          clientRef: session.client_reference_id,
        });
        return;
      }

      if (row.status === 'completed') {
        logger.info('[WEBHOOK] Topup already completed - idempotent exit', { topupId: row.id });
        if (paymentIntentId && !row.stripe_payment_intent) {
          await client.query('UPDATE topups SET stripe_payment_intent = $1, updated_at = NOW() WHERE id = $2', [paymentIntentId, row.id]);
        }
        return;
      }

      const topupRepo = new TopupRepository();
      const walletRepo = new WalletRepository();
      const ledgerRepo = new LedgerRepository();

      const amountUsd: string = row.amount_usd;
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
  }

  private static async handleCheckoutSessionAsyncPaymentSucceeded(event: Stripe.Event): Promise<void> {
    // Same behavior as checkout.session.completed for topups
    return await this.handleCheckoutSessionCompleted(event);
  }

  private static async handleChargeSucceeded(event: Stripe.Event): Promise<void> {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? (charge.payment_intent as string)
        : (charge.payment_intent as Stripe.PaymentIntent | null)?.id;

    const stripeChargeId = charge.id;

    const topupRepo = new TopupRepository();
    let topup = paymentIntentId ? await topupRepo.findByStripePaymentIntent(paymentIntentId) : null;

    const topupIdFromCharge = charge.metadata?.['topup_id'];
    if (!topup && topupIdFromCharge) {
      topup = await topupRepo.findById(topupIdFromCharge);
    }

    if (!topup) {
      // charge.succeeded can be emitted for subscription invoice payments as well; only topups are handled here.
      logger.debug('[WEBHOOK] charge.succeeded ignored (no matching topup)', { paymentIntentId, stripeChargeId });
      return;
    }

    const connection = getConnection();
    await connection.transaction(async (client) => {
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
  }

  private static async handleTopupFailureEvents(event: Stripe.Event): Promise<void> {
    // Keep existing behavior: mark topup failed/cancelled where possible.
    // (Implementation preserved from route-level code pattern; best-effort.)
    let topupId: string | undefined;

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session;
      topupId = (session.client_reference_id as string | undefined) ?? undefined;
    }

    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent;
      topupId = pi.metadata?.['topup_id'];
    }

    if (event.type === 'charge.failed') {
      const charge = event.data.object as Stripe.Charge;
      topupId = charge.metadata?.['topup_id'];
    }

    if (!topupId) return;
    const topupRepo = new TopupRepository();
    try {
      await topupRepo.updateStatus(topupId, 'failed');
    } catch (e) {
      logger.warn('[WEBHOOK] Failed to update topup status on failure event', { topupId, eventId: event.id }, e as Error);
    }
  }

  // ---------------------------------------------------------------------------
  // SUBSCRIPTIONS (Option A: plan lives in Stripe Price metadata)
  // ---------------------------------------------------------------------------

  private static async handleShipClassSubscriptionCheckoutCompleted(event: Stripe.Event, session: Stripe.Checkout.Session): Promise<void> {
    // Concrete shape: StripeService.createSubscriptionCheckoutSession sets session.metadata.kind.
    if (session.metadata?.kind !== 'ship_class_subscription') {
      logger.warn('[WEBHOOK] subscription checkout completed ignored (unexpected metadata.kind)', {
        sessionId: session.id,
        kind: session.metadata?.kind ?? null,
      });
      return;
    }

    const invoiceId = expandableId(session.invoice as unknown);
    const subscriptionId = expandableId(session.subscription as unknown);

    logger.info('[WEBHOOK] subscription checkout completed', {
      sessionId: session.id,
      invoiceId: invoiceId ?? null,
      subscriptionId: subscriptionId ?? null,
      clientRef: session.client_reference_id ?? null,
      kind: session.metadata?.kind ?? null,
    });

    if (invoiceId) {
      // Reuse invoice-driven logic so credit granting remains idempotent (keyed by invoiceId).
      // Require subscriptionId explicitly (do not attempt to infer from invoice retrieval).
      if (!subscriptionId) {
        logger.warn('[WEBHOOK] subscription checkout completed missing subscriptionId (cannot apply entitlements)', {
          sessionId: session.id,
          invoiceId,
        });
        return;
      }
      await this.applyEntitlementsAndCreditsForPaidInvoice({ invoiceId, subscriptionId, stripeEventId: event.id });
      return;
    }

    if (!subscriptionId) {
      logger.warn('[WEBHOOK] subscription checkout completed missing subscription/invoice', {
        sessionId: session.id,
        mode: session.mode,
        clientRef: session.client_reference_id,
        metadata: session.metadata,
      });
      return;
    }

    // Apply entitlements from subscription; credits are granted on invoice.paid (requires invoiceId for idempotency).
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    });
    const starshipId = subscription.metadata?.starship_id;
    if (!starshipId) {
      logger.warn('[WEBHOOK] subscription checkout completed missing subscription.metadata.starship_id', {
        subscriptionId,
        sessionId: session.id,
      });
      return;
    }

    const userId = subscription.metadata?.user_id || null;
    const customerId = expandableId(subscription.customer as unknown);
    const item0 = subscription.items?.data?.[0];
    const price = item0?.price as Stripe.Price | undefined;
    if (!price) {
      logger.warn('[WEBHOOK] subscription checkout completed missing subscription.items[0].price', {
        subscriptionId,
        sessionId: session.id,
      });
      return;
    }

    let plan: { shipClass: string; maxAgents: number; maxConcurrentTurns: number; monthlyCredits: number };
    try {
      plan = readRequiredPlanMetadata(price);
    } catch (e) {
      logger.warn('[WEBHOOK] subscription checkout completed missing required price metadata', {
        subscriptionId,
        sessionId: session.id,
        priceId: price.id,
        error: e instanceof Error ? e.message : String(e),
        metadata: price.metadata,
      });
      return;
    }

    const connection = getConnection();
    await connection.transaction(async (client) => {
      if (customerId && userId) {
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
          [`starship-sub-${subscriptionId}`, starshipId, userId, customerId, subscriptionId, subscription.status ?? 'active']
        );
      }

      await client.query(
        `UPDATE starships
            SET ship_class = $2,
                max_agents = $3,
                max_concurrent_turns = $4,
                updated_at = NOW()
          WHERE id = $1`,
        [starshipId, plan.shipClass, plan.maxAgents, plan.maxConcurrentTurns]
      );
    });
  }

  private static async applyEntitlementsAndCreditsForPaidInvoice(params: {
    invoiceId: string;
    subscriptionId: string;
    stripeEventId: string;
  }): Promise<void> {
    const invoiceId = params.invoiceId;
    const subscriptionId = params.subscriptionId;

    // Retrieve subscription + expanded price to read plan metadata (Option A).
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    });
    const starshipId = subscription.metadata?.starship_id;
    if (!starshipId) {
      logger.warn('[WEBHOOK] paid invoice missing subscription.metadata.starship_id', { subscriptionId, invoiceId });
      return;
    }
    const userId = subscription.metadata?.user_id || null;
    const customerId = expandableId(subscription.customer as unknown);
    const item0 = subscription.items?.data?.[0];
    const price = item0?.price as Stripe.Price | undefined;
    if (!price) {
      logger.warn('[WEBHOOK] paid invoice missing subscription.items[0].price', { subscriptionId, invoiceId });
      return;
    }

    let plan: { shipClass: string; maxAgents: number; maxConcurrentTurns: number; monthlyCredits: number };
    try {
      plan = readRequiredPlanMetadata(price);
    } catch (e) {
      logger.warn('[WEBHOOK] paid invoice missing required price metadata', {
        subscriptionId,
        invoiceId,
        priceId: price.id,
        error: e instanceof Error ? e.message : String(e),
        metadata: price.metadata,
      });
      return;
    }

    const connection = getConnection();
    await connection.transaction(async (client) => {
      // Persist subscription mapping (enables plan switching/cancellation flows).
      if (customerId && userId) {
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
          [`starship-sub-${subscriptionId}`, starshipId, userId, customerId, subscriptionId, 'active']
        );
      }

      // Apply entitlements from Stripe plan metadata
      const updateRes = await client.query(
        `UPDATE starships
            SET ship_class = $2,
                max_agents = $3,
                max_concurrent_turns = $4,
                updated_at = NOW()
          WHERE id = $1`,
        [starshipId, plan.shipClass, plan.maxAgents, plan.maxConcurrentTurns]
      );
      logger.info('[WEBHOOK] Applied subscription entitlements to starship', {
        starshipId,
        shipClass: plan.shipClass,
        maxAgents: plan.maxAgents,
        maxConcurrentTurns: plan.maxConcurrentTurns,
        invoiceId,
        subscriptionId,
        rowCount: (updateRes as unknown as { rowCount?: number }).rowCount ?? null,
      });

      const verifyRes = await client.query<{ ship_class: string; max_agents: number; max_concurrent_turns: number }>(
        `SELECT ship_class, max_agents, max_concurrent_turns FROM starships WHERE id = $1`,
        [starshipId]
      );
      const verified = verifyRes.rows?.[0] ?? null;
      logger.info('[WEBHOOK] Verified starship entitlements after update', {
        starshipId,
        verified,
        invoiceId,
        subscriptionId,
      });

      // Lock wallet
      const walletRes = await client.query<{ id: string }>('SELECT id FROM wallets WHERE starship_id = $1 FOR UPDATE', [starshipId]);
      const walletRow = walletRes.rows?.[0] ?? null;
      if (!walletRow) {
        logger.warn('[WEBHOOK] paid invoice: wallet not found for starship', { starshipId, invoiceId });
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
        logger.info('[WEBHOOK] paid invoice grant already applied (idempotent exit)', { walletId: walletRow.id, invoiceId });
        return;
      }

      const creditsGranted = toCreditsString(plan.monthlyCredits);
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
          shipClass: plan.shipClass,
          invoiceId,
          subscriptionId,
          starshipId,
          priceId: price.id,
          creditsGranted,
          stripeEvent: params.stripeEventId,
        },
      });
    });
  }

  private static async handleInvoicePaid(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    if (!invoice?.id) return;
    const subscriptionId = expandableId((invoice as unknown as { subscription?: unknown }).subscription as unknown);
    if (!subscriptionId) {
      logger.warn('[WEBHOOK] invoice.paid missing invoice.subscription (cannot apply entitlements)', { invoiceId: invoice.id });
      return;
    }
    await this.applyEntitlementsAndCreditsForPaidInvoice({ invoiceId: invoice.id, subscriptionId, stripeEventId: event.id });
  }

  private static async handleSubscriptionChanged(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const subscriptionId = subscription.id;
    const status = subscription.status;

    const starshipId = subscription.metadata?.starship_id;
    if (!starshipId) {
      logger.warn('[WEBHOOK] subscription update missing metadata.starship_id', { subscriptionId, status });
      return;
    }

    const isPaying = status === 'active' || status === 'trialing';
    const connection = getConnection();
    await connection.transaction(async (client) => {
      // Best-effort upsert mapping for later management
      const customerId = expandableId(subscription.customer as unknown);
      const userId = subscription.metadata?.user_id || null;
      if (customerId && userId) {
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
          [`starship-sub-${subscriptionId}`, starshipId, userId, customerId, subscriptionId, status]
        );
      }

      if (!isPaying) {
        await client.query(
          `UPDATE starships
              SET ship_class = 'scout',
                  max_agents = LEAST(max_agents, 5),
                  max_concurrent_turns = 1,
                  updated_at = NOW()
            WHERE id = $1`,
          [starshipId]
        );
      } else {
        // Entitlements are enforced on invoice.paid; keep as-is here.
        await client.query(`UPDATE starships SET updated_at = NOW() WHERE id = $1`, [starshipId]);
      }
    });
  }
}

export default StripeWebhookService;
