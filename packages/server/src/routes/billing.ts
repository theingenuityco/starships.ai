/**
 * Billing routes for credit management
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { CreditService } from '@/services/CreditService';
import { createPaginationMeta, handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { getEnvConfig } from '@starships/env';
import Stripe from 'stripe';

const router: Router = Router();
const config = getEnvConfig();

const NanoidSchema = z.string().regex(/^[a-z0-9_-]{10,30}$/i, 'Invalid ID format');

function validateData<T>(schema: z.ZodSchema<T>, data: unknown, res: Response, context: string): T | null {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const firstError = error.issues[0];
      const fieldName = firstError.path.join('.');

      sendError(res, 'VALIDATION_ERROR', firstError.message, 400, {
        field: fieldName,
        context,
        validationErrors: error.issues.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
      });
    } else {
      sendError(res, 'INTERNAL_SERVER_ERROR', `${context} validation error`, 500);
    }
    return null;
  }
}

/**
 * GET /users/:userId/credits/balance
 * Returns user credit balance
 */
router.get('/users/:userId/credits/balance', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const paramValidation = validateData(z.object({ userId: NanoidSchema }), req.params, res, 'user parameter');
    if (!paramValidation) return;
    const { userId } = paramValidation;

    // Authorization: Users can only view their own balance
    if (req.user?.id !== userId) {
      sendError(res, 'ACCESS_DENIED', 'You can only access your own credits', 403);
      return;
    }

    const creditService = new CreditService();
    await creditService.ensureBalanceRow(userId);
    const balance = await creditService.getBalance(userId);

    sendSuccess(res, { balance, currency: 'USD' }, 200);
  } catch (error) {
    handleError(error, res, 'fetching credit balance');
  }
});

/**
 * GET /users/:userId/credits/transactions
 * Returns paginated credit transactions for a user
 */
const TransactionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  order: z.enum(['ASC', 'DESC']).optional(),
});

router.get('/users/:userId/credits/transactions', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const paramValidation = validateData(z.object({ userId: NanoidSchema }), req.params, res, 'user parameter');
    if (!paramValidation) return;
    const { userId } = paramValidation;

    // Authorization: Users can only view their own transactions
    if (req.user?.id !== userId) {
      sendError(res, 'ACCESS_DENIED', 'You can only access your own transactions', 403);
      return;
    }

    const queryValidation = validateData(TransactionListQuerySchema, req.query, res, 'pagination parameters');
    if (!queryValidation) return;

    const { page, limit, order } = queryValidation;

    const creditService = new CreditService();
    const result = await creditService.listTransactions(userId, { page, limit, order });

    const meta = createPaginationMeta(page, limit, result.total);
    sendSuccess(res, result.records, 200, meta);
  } catch (error) {
    handleError(error, res, 'fetching credit transactions');
  }
});

/**
 * POST /credits/checkout-session
 * Creates Stripe checkout session for credit purchase
 */
const CheckoutSessionSchema = z.object({
  amount: z.number().min(20).max(10000), // $20 minimum, $10k maximum
});

router.post('/credits/checkout-session', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const bodyValidation = validateData(CheckoutSessionSchema, req.body, res, 'checkout session data');
    if (!bodyValidation) return;

    const { amount } = bodyValidation;
    const userId = req.user!.id;

    if (!config.STRIPE_SECRET_KEY) {
      sendError(res, 'CONFIGURATION_ERROR', 'Stripe secret key not configured', 500);
      return;
    }

    const stripe = new Stripe(config.STRIPE_SECRET_KEY, {
      apiVersion: '2025-09-30.clover',
      appInfo: {
        name: 'starships-api',
        version: process.env.npm_package_version,
        url: config.SERVER_URL,
      },
    });

    if (!config.SERVER_URL) {
      sendError(res, 'CONFIGURATION_ERROR', 'SERVER_URL not configured', 500);
      return;
    }

    // Create Stripe checkout session (hosted)
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Starships Credits',
              description: `$${amount} USD in credits for AI usage`,
            },
            unit_amount: Math.round(amount * 100), // cents (integer)
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${config.PUBLIC_URL}/profile?tab=billing&topup=success`,
      cancel_url: `${config.PUBLIC_URL}/profile?tab=billing&topup=cancel`,
      client_reference_id: userId,
      metadata: {
        type: 'credit_purchase',
        // keep for audit/debug; source of truth for user is client_reference_id
        userId,
      },
      // automatic_tax: { enabled: true },
    });

    sendSuccess(
      res,
      {
        sessionId: session.id,
        url: session.url,
        amount,
        userId,
      },
      200
    );
  } catch (error) {
    handleError(error, res, 'creating checkout session');
  }
});

/**
 * POST /credits/webhook
 * Stripe webhook handler for payment confirmation
 */
router.post('/credits/webhook', async (req: Request, res: Response): Promise<void> => {
  try {
    const sig = req.headers['stripe-signature'] as string | undefined;
    const rawBody = req.body as Buffer;

    if (!sig) {
      res.status(400).json({ error: 'Missing Stripe-Signature header' });
      return;
    }

    if (!config.STRIPE_WEBHOOK_SECRET) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      res.status(500).json({ error: 'Webhook secret not configured' });
      return;
    }

    if (!config.STRIPE_SECRET_KEY) {
      console.error('STRIPE_SECRET_KEY not configured');
      res.status(500).json({ error: 'Stripe secret key not configured' });
      return;
    }

    const stripe = new Stripe(config.STRIPE_SECRET_KEY, {
      apiVersion: '2025-09-30.clover',
      appInfo: {
        name: 'starships-api',
        version: process.env.npm_package_version,
        url: config.SERVER_URL,
      },
    });

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, config.STRIPE_WEBHOOK_SECRET!);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Webhook signature verification failed: ${message}`);
      res.status(400).json({ error: 'Invalid signature' });
      return;
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id ?? session.metadata?.userId ?? null;
        const amountUsd = typeof session.amount_total === 'number' ? session.amount_total / 100 : 0;

        if (userId && amountUsd > 0) {
          const creditService = new CreditService();
          await creditService.topupViaWebhook(userId, amountUsd, session.id, `Credit purchase: $${amountUsd}`);
          console.log(`[CREDITS] Webhook credited user ${userId} with $${amountUsd}`);
        } else {
          console.error('[CREDITS] Invalid webhook data:', { userId, amount_total: session.amount_total });
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[CREDITS] Webhook processing failed:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
