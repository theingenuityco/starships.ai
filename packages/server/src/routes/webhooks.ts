import { Router } from 'express';
import type { Request, Response, Router as ExpressRouter } from 'express';
import Stripe from 'stripe';
import { StarshipRepository } from '@starships/models';
import { getEnvConfig } from '@starships/env';

const router: ExpressRouter = Router();
const env = getEnvConfig();

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-07-30.basil',
});

let starshipRepository: StarshipRepository;

export function initializeWebhookRoutes(deps: {
  starshipRepository: StarshipRepository;
}) {
  starshipRepository = deps.starshipRepository;
}

router.post('/stripe', async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'];
  
  if (!sig) {
    console.error('Missing Stripe signature header');
    res.status(400).send('No Stripe signature');
    return;
  }

  let event: Stripe.Event;
  
  // Verify webhook signature
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    res.status(400).send('Webhook Error: Invalid signature');
    return;
  }

  // CRITICAL: Idempotency check to prevent duplicate processing
  try {
    const isProcessed = await starshipRepository.isEventProcessed(event.id);
    if (isProcessed) {
      console.log(`[WEBHOOK] Event ${event.id} already processed, skipping`);
      res.json({ received: true, skipped: true });
      return;
    }
  } catch (error) {
    console.error('[WEBHOOK] Error checking idempotency:', error);
    // Continue processing if check fails (fail-open)
  }

  console.log(`[WEBHOOK] Processing event: ${event.type} (${event.id})`);

  try {
    let processed = false;

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        // REQUIRED: starshipId must be in metadata (created before payment)
        const starshipId = session.metadata?.starshipId;
        
        if (!starshipId) {
          // This is a critical error - subscription without starship
          console.error('[WEBHOOK] CRITICAL: No starshipId in checkout metadata');
          console.error('[WEBHOOK] Metadata received:', session.metadata);
          // Let it fail - don't process payment without proper setup
          throw new Error('Invalid checkout session: missing starshipId');
        }
        
        // Get previous status for logging
        const starship = await starshipRepository.findById(starshipId);
        const previousStatus = starship?.status || 'unknown';
        
        // Update existing Starship with subscription details
        await starshipRepository.update(starshipId, {
          stripeCustomerId: session.customer as string,
          subscriptionId: session.subscription as string,
          status: 'active'
        });
        
        console.log(`✅ [WEBHOOK] Activated starship: ${starshipId} (${previousStatus} → active)`);
        processed = true;
        break;
      }
        
      case 'invoice.paid': {
        // CRITICAL: Handle payment recovery (including Smart Retries)
        const paidInvoice = event.data.object as Stripe.Invoice;
        
        // Check if invoice has a subscription field
        const subscriptionField = (paidInvoice as any).subscription;
        if (!subscriptionField) {
          console.log('[WEBHOOK] Invoice not related to subscription, skipping');
          break;
        }
        
        const subscriptionId = typeof subscriptionField === 'string' 
          ? subscriptionField 
          : subscriptionField.id;
          
        const starship = await starshipRepository.findBySubscriptionId(subscriptionId);
        
        if (starship) {
          const wasRestricted = starship.status === 'restricted';
          // Reactivate access after successful payment
          await starshipRepository.updateSubscription(starship.id, { 
            status: 'active' 
          });
          
          if (wasRestricted) {
            console.log(`✅ [WEBHOOK] Payment RECOVERED for starship: ${starship.name} (restricted → active)`);
          } else {
            console.log(`✅ [WEBHOOK] Payment successful for starship: ${starship.name} (${starship.status} → active)`);
          }
          processed = true;
        } else {
          console.warn(`[WEBHOOK] No starship found for subscription: ${subscriptionId}`);
        }
        break;
      }
        
      case 'invoice.payment_failed': {
        const failedInvoice = event.data.object as Stripe.Invoice;
        
        // Check if invoice has a subscription field
        const subscriptionField = (failedInvoice as any).subscription;
        if (!subscriptionField) {
          console.log('[WEBHOOK] Invoice not related to subscription, skipping');
          break;
        }
        
        const subscriptionId = typeof subscriptionField === 'string' 
          ? subscriptionField 
          : subscriptionField.id;
          
        const starship = await starshipRepository.findBySubscriptionId(subscriptionId);
        
        if (starship) {
          // Restrict access due to payment failure
          await starshipRepository.updateSubscription(starship.id, { 
            status: 'restricted' 
          });
          
          // Log retry information if available
          const attemptCount = failedInvoice.attempt_count || 1;
          const nextAttempt = failedInvoice.next_payment_attempt 
            ? new Date(failedInvoice.next_payment_attempt * 1000).toISOString()
            : 'No retry scheduled';
            
          console.log(`⚠️ [WEBHOOK] Payment failed for starship: ${starship.name} (${starship.status} → restricted)`);
          console.log(`   Attempt: ${attemptCount}, Next retry: ${nextAttempt}`);
          processed = true;
        } else {
          console.warn(`[WEBHOOK] No starship found for subscription: ${subscriptionId}`);
        }
        break;
      }
        
      case 'customer.subscription.deleted': {
        const deletedSub = event.data.object as Stripe.Subscription;
        const starship = await starshipRepository.findBySubscriptionId(deletedSub.id);
        
        if (starship) {
          // Permanently disable access
          // Note: We keep the subscriptionId for historical reference
          await starshipRepository.updateSubscription(starship.id, { 
            status: 'disabled'
            // subscriptionId remains for audit trail
          });
          console.log(`❌ [WEBHOOK] Subscription cancelled for ${starship.name} (${starship.status} → disabled)`);
          console.log(`   Cleared subscription ID: ${deletedSub.id}`);
          processed = true;
        } else {
          console.warn(`[WEBHOOK] No starship found for deleted subscription: ${deletedSub.id}`);
        }
        break;
      }
        
      default:
        console.log(`[WEBHOOK] Unhandled event type: ${event.type}`);
    }
    
    // Mark event as processed (even if we didn't handle it)
    await starshipRepository.markEventProcessed(event.id, event.type);
    
    res.json({ 
      received: true, 
      processed,
      eventId: event.id,
      eventType: event.type 
    });
    
  } catch (error) {
    console.error('[WEBHOOK] Processing error:', error);
    // For subscription webhooks, we want to fail properly
    // Return 500 to trigger Stripe retries for legitimate failures
    res.status(500).json({ 
      received: false, 
      error: error instanceof Error ? error.message : 'Processing failed'
    });
  }
});

export default router;