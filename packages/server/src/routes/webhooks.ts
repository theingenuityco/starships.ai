import { Router } from 'express';
import type { Request, Response, Router as ExpressRouter } from 'express';
import Stripe from 'stripe';
import { UserRepository, StarshipRepository } from '@starships/models';
import { loadServerEnvironment } from '@starships/env-config';

const router: ExpressRouter = Router();
const env = loadServerEnvironment();

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-07-30.basil', // ✅ CONFIRMED: Matches your setup-stripe.ts (line 10)
});

// ⚠️ UPDATED: Add initialization function for dependency injection
let starshipRepository: StarshipRepository;

export function initializeWebhookRoutes(deps: {
  starshipRepository: StarshipRepository;
}) {
  starshipRepository = deps.starshipRepository;
}

// Webhook endpoint
router.post('/stripe', async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'];
  
  if (!sig) {
    res.status(400).send('No Stripe signature');
    return;
  }

  let event: Stripe.Event;
  
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    res.status(400).send('Webhook Error');
    return;
  }

  console.log(`Processing webhook: ${event.type}`);

  try {
    // ⚠️ CRITICAL UPDATE: Use dependency injection pattern, not serviceRegistry
    // These repositories are available via the router initialization
    // You'll need to pass them via the webhook initialization function

    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;
        
        // Create starship after payment
        await starshipRepository.create({
          name: session.metadata!.starshipName,
          slug: `${session.metadata!.starshipName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`,
          ownerId: session.metadata!.userId,
          class: session.metadata!.plan as 'cruiser' | 'draught',
          maxActiveExpeditions: session.metadata!.plan === 'cruiser' ? 3 : 5,
          status: 'active',
          subscriptionId: session.subscription as string,
          plan: session.metadata!.plan as 'cruiser' | 'draught',
          billingPeriod: session.metadata!.billingPeriod as 'monthly' | 'yearly',
        });
        console.log(`✅ Created starship: ${session.metadata!.starshipName}`);
        break;
        
      case 'customer.subscription.updated':
        const subscription = event.data.object as Stripe.Subscription;
        const starship = await starshipRepository.findBySubscriptionId(subscription.id);
        
        if (starship) {
          const status = subscription.status === 'active' ? 'active' : 'restricted';
          await starshipRepository.updateSubscription(starship.id, { status });
          console.log(`✅ Updated starship ${starship.name} to ${status}`);
        }
        break;
        
      case 'customer.subscription.deleted':
        const deletedSub = event.data.object as Stripe.Subscription;
        const disabledShip = await starshipRepository.findBySubscriptionId(deletedSub.id);
        
        if (disabledShip) {
          await starshipRepository.updateSubscription(disabledShip.id, { status: 'disabled' });
          console.log(`✅ Disabled starship ${disabledShip.name}`);
        }
        break;
        
      case 'invoice.payment_failed':
        const invoice = event.data.object as any; // Use any to bypass strict typing for now
        if (invoice.subscription) {
          const subscriptionId = typeof invoice.subscription === 'string' 
            ? invoice.subscription 
            : invoice.subscription.id;
          if (subscriptionId) {
            const restrictedShip = await starshipRepository.findBySubscriptionId(subscriptionId);
            if (restrictedShip) {
              await starshipRepository.updateSubscription(restrictedShip.id, { status: 'restricted' });
              console.log(`✅ Restricted starship ${restrictedShip.name}`);
            }
          }
        }
        break;
        
      default:
        console.log(`Unhandled event: ${event.type}`);
    }
    
    res.json({ received: true });
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;