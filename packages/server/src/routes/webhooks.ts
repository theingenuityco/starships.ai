import { Router } from 'express';
import Stripe from 'stripe';
import type { Request, Response } from 'express';
import { getConnection, Subscription } from '@starships/models';

const router: Router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Helper function to get plan from Stripe price
function getPlanFromPriceId(priceId: string): 'scout' | 'cruiser' {
  // You'll need to map your actual Stripe price IDs to plans
  // This is just an example - use your actual price IDs
  if (priceId.includes('scout') || priceId === 'price_scout_monthly' || priceId === 'price_scout_yearly') {
    return 'scout';
  }
  return 'cruiser';  // Default to cruiser for paid plans
}

router.post('/stripe', async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    res.status(400).send('Webhook secret not configured');
    return;
  }

  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log(`[WEBHOOK] Processing event: ${event.type}`, JSON.stringify(event.data.object, null, 2));

    const connection = getConnection();

    switch (event.type) {
      case 'checkout.session.completed':
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        console.log(`[WEBHOOK] Checkout completed for session: ${checkoutSession.id}`);
        console.log(`[WEBHOOK] Session details:`, {
          mode: checkoutSession.mode,
          client_reference_id: checkoutSession.client_reference_id,
          subscription: checkoutSession.subscription,
          customer: checkoutSession.customer
        });
        
        if (checkoutSession.mode === 'subscription' && checkoutSession.client_reference_id) {
          const userId = checkoutSession.client_reference_id;
          const subscriptionId = `sub_${Date.now()}_${userId}`;
          const now = new Date().toISOString();
          
          // Get subscription details to determine plan and period
          let planId = 'cruiser'; // Default
          let currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days fallback
          
          if (checkoutSession.subscription) {
            try {
              const subscription = await stripe.subscriptions.retrieve(checkoutSession.subscription as string);
              const priceId = subscription.items.data[0]?.price?.id;
              if (priceId) {
                planId = getPlanFromPriceId(priceId);
              }
              // Get actual period end from Stripe
              currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();
            } catch (error) {
              console.warn('[WEBHOOK] Could not retrieve subscription details:', error);
            }
          }
          
          // Create or update subscription in Neo4j
          try {
            console.log(`[WEBHOOK] Creating subscription with params:`, {
              userId,
              subscriptionId,
              planId,
              stripeCustomerId: checkoutSession.customer,
              stripeSubscriptionId: checkoutSession.subscription,
              currentPeriodEnd,
              now
            });
            
            await connection.executeWrite<{ s: Subscription }>(`
              MERGE (user:User {id: $userId})
              MERGE (s:Subscription {
                id: $subscriptionId,
                userId: $userId,
                status: 'active',
                planId: $planId,
                stripeCustomerId: $stripeCustomerId,
                stripeSubscriptionId: $stripeSubscriptionId,
                currentPeriodEnd: $currentPeriodEnd,
                createdAt: $now,
                updatedAt: $now
              })
              MERGE (user)-[:HAS_SUBSCRIPTION]->(s)
              RETURN s
            `, {
              userId,
              subscriptionId,
              planId,
              stripeCustomerId: checkoutSession.customer as string,
              stripeSubscriptionId: checkoutSession.subscription as string,
              currentPeriodEnd,
              now
            });
          } catch (dbError) {
            console.error(`[WEBHOOK] Database error creating subscription:`, dbError);
            throw dbError;
          }
          
          console.log(`✅ [WEBHOOK] Subscription activated for user: ${userId}`);
        }
        break;

      case 'customer.subscription.updated':
        const updatedSub = event.data.object as Stripe.Subscription;
        console.log(`[WEBHOOK] Subscription updated: ${updatedSub.id}`);
        
        // Update subscription status in Neo4j
        await connection.executeWrite<{ s: Subscription }>(`
          MATCH (s:Subscription {stripeSubscriptionId: $stripeSubscriptionId})
          SET s.status = $status,
              s.currentPeriodEnd = $currentPeriodEnd,
              s.updatedAt = $now
          RETURN s
        `, {
          stripeSubscriptionId: updatedSub.id,
          status: updatedSub.status === 'active' ? 'active' : 
                 updatedSub.status === 'canceled' ? 'canceled' : 'past_due',
          currentPeriodEnd: new Date((updatedSub as any).current_period_end * 1000).toISOString(),
          now: new Date().toISOString()
        });
        break;

      case 'customer.subscription.deleted':
        const deletedSub = event.data.object as Stripe.Subscription;
        console.log(`[WEBHOOK] Subscription canceled: ${deletedSub.id}`);
        
        // Mark subscription as canceled in Neo4j
        await connection.executeWrite<{ s: Subscription }>(`
          MATCH (s:Subscription {stripeSubscriptionId: $stripeSubscriptionId})
          SET s.status = 'canceled',
              s.updatedAt = $now
          RETURN s
        `, {
          stripeSubscriptionId: deletedSub.id,
          now: new Date().toISOString()
        });
        break;

      default:
        console.log(`[WEBHOOK] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[WEBHOOK] Error:', error);
    res.status(400).send(`Webhook Error: ${error}`);
  }
});

export default router;