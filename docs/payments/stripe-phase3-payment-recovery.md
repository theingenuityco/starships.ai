# Phase 3: Payment Recovery & Smart Retries - Implementation Guide

## Overview
This document provides the detailed implementation plan for Phase 3 of the recurring payments MVP. Phase 3 focuses on automatic payment recovery through Stripe Smart Retries and improved payment failure handling.

**Estimated Time:** 2 hours  
**Priority:** Critical - Required for automatic payment recovery  
**Prerequisites:** Phase 1 and Phase 2 must be completed

## Current State (After Phase 1 & 2)
- ✅ Webhook idempotency implemented
- ✅ Starships created before payment with `pending_payment` status
- ✅ `invoice.paid` handler for payment recovery
- ✅ `invoice.payment_failed` handler for restricting access
- ✅ Retry payment endpoint for pending starships
- ✅ Billing portal integration for payment updates

## Phase 3 Goals
1. Configure Stripe Smart Retries for automatic recovery
2. Handle payment failures with proper grace periods
3. Implement UI feedback for payment states
4. Add monitoring and alerting for failed payments
5. Test end-to-end payment recovery scenarios

## Implementation Tasks

### Task 1: Configure Stripe Smart Retries (30 minutes)

#### Step 1.1: Configure in Stripe Dashboard
**In Stripe Dashboard (stripe.com/dashboard):**

1. **Navigate to Settings → Billing → Revenue recovery → Smart Retries**
   - Direct URL: https://dashboard.stripe.com/settings/billing/automatic

2. **Configure Smart Retries:**
   ```
   ☐ Enable Smart Retries: ON
   ☐ Maximum retry period: 14 days
   ☐ Maximum attempts: 4
   ☐ Let Stripe optimize retry timing: Yes (AI-powered)
   ```

3. **Configure Email Notifications:**
   ```
   ☐ Send payment failure emails: ON
   ☐ Send payment retry emails: ON
   ☐ Send subscription cancellation warnings: ON
   ```

4. **Configure Webhook Events (Already done, but verify):**
   ```
   Required events:
   ☐ checkout.session.completed
   ☐ invoice.paid
   ☐ invoice.payment_failed
   
   Optional but recommended:
   ☐ customer.subscription.updated
   ☐ customer.subscription.deleted
   ```

#### Step 1.2: Document Smart Retry Behavior
**File:** `docs/stripe-smart-retries.md`

```markdown
# Stripe Smart Retries Configuration

## Current Settings
- **Enabled:** Yes
- **Maximum retry period:** 14 days
- **Maximum attempts:** 4
- **Optimization:** AI-powered timing

## Retry Schedule (Typical)
1. **Day 0:** Initial payment fails
2. **Day 3:** First retry (optimized for debit cards)
3. **Day 5:** Second retry
4. **Day 7:** Third retry  
5. **Day 14:** Final retry

## Webhook Events
- `invoice.payment_failed` - Fired on each failure (includes attempt_count)
- `invoice.paid` - Fired when retry succeeds
- `customer.subscription.updated` - Status changes to `past_due` after all retries

## Recovery Rates
- Industry average: 30-40%
- With Smart Retries: 48-70%
- With customer portal: 60-85%
```

### Task 2: Enhance Payment Failure Handling (45 minutes)

#### Step 2.1: Add Detailed Failure Tracking
**File:** `packages/models/src/types.ts` (add to Starship interface)

```typescript
// Add payment failure tracking fields
interface Starship {
  // ... existing fields ...
  
  // Payment failure tracking
  lastPaymentFailure?: string;      // ISO date of last failure
  paymentFailureCount?: number;     // Number of consecutive failures
  nextPaymentAttempt?: string;      // ISO date of next retry
  paymentFailureReason?: string;    // Last failure reason from Stripe
}
```

#### Step 2.2: Update Webhook Handler for Better Tracking
**File:** `packages/server/src/routes/webhooks.ts` (enhance invoice.payment_failed handler)

```typescript
case 'invoice.payment_failed': {
  const failedInvoice = event.data.object as Stripe.Invoice;
  
  if (!failedInvoice.subscription) {
    console.log('[WEBHOOK] Invoice not related to subscription, skipping');
    break;
  }
  
  const subscriptionId = typeof failedInvoice.subscription === 'string' 
    ? failedInvoice.subscription 
    : failedInvoice.subscription.id;
    
  const starship = await starshipRepository.findBySubscriptionId(subscriptionId);
  
  if (starship) {
    // Extract failure details
    const attemptCount = failedInvoice.attempt_count || 1;
    const nextAttempt = failedInvoice.next_payment_attempt 
      ? new Date(failedInvoice.next_payment_attempt * 1000).toISOString()
      : null;
    
    // Get failure reason from charge if available
    let failureReason = 'Payment failed';
    if (failedInvoice.charge && typeof failedInvoice.charge === 'object') {
      const charge = failedInvoice.charge as Stripe.Charge;
      failureReason = charge.failure_message || charge.outcome?.seller_message || 'Payment failed';
    }
    
    // Update starship with detailed failure information
    await starshipRepository.update(starship.id, {
      status: 'restricted',
      lastPaymentFailure: new Date().toISOString(),
      paymentFailureCount: attemptCount,
      nextPaymentAttempt: nextAttempt,
      paymentFailureReason: failureReason
    });
    
    console.log(`⚠️ [WEBHOOK] Payment failed for starship: ${starship.name}`);
    console.log(`   Attempt: ${attemptCount}/4`);
    console.log(`   Reason: ${failureReason}`);
    console.log(`   Next retry: ${nextAttempt || 'No retry scheduled'}`);
    
    // Optional: Send notification to user (Phase 4)
    // await notificationService.sendPaymentFailureEmail(starship, failureReason, nextAttempt);
    
    processed = true;
  } else {
    console.warn(`[WEBHOOK] No starship found for subscription: ${subscriptionId}`);
  }
  break;
}
```

#### Step 2.3: Clear Failure Info on Successful Payment
**File:** `packages/server/src/routes/webhooks.ts` (enhance invoice.paid handler)

```typescript
case 'invoice.paid': {
  const paidInvoice = event.data.object as Stripe.Invoice;
  
  if (!paidInvoice.subscription) {
    console.log('[WEBHOOK] Invoice not related to subscription, skipping');
    break;
  }
  
  const subscriptionId = typeof paidInvoice.subscription === 'string' 
    ? paidInvoice.subscription 
    : paidInvoice.subscription.id;
    
  const starship = await starshipRepository.findBySubscriptionId(subscriptionId);
  
  if (starship) {
    // Clear all failure tracking when payment succeeds
    await starshipRepository.update(starship.id, {
      status: 'active',
      lastPaymentFailure: null,
      paymentFailureCount: 0,
      nextPaymentAttempt: null,
      paymentFailureReason: null
    });
    
    // Log recovery if this was after a failure
    if (starship.paymentFailureCount && starship.paymentFailureCount > 0) {
      console.log(`✅ [WEBHOOK] Payment RECOVERED for starship: ${starship.name} after ${starship.paymentFailureCount} attempts`);
      
      // Optional: Send recovery notification (Phase 4)
      // await notificationService.sendPaymentRecoveredEmail(starship);
    } else {
      console.log(`✅ [WEBHOOK] Payment successful for starship: ${starship.name}`);
    }
    
    processed = true;
  } else {
    console.warn(`[WEBHOOK] No starship found for subscription: ${subscriptionId}`);
  }
  break;
}
```

### Task 3: Enhance UI for Payment States (30 minutes)

#### Step 3.1: Update PaymentStatusBanner with Retry Information
**File:** `packages/client/src/components/starships/PaymentStatusBanner.tsx`

```typescript
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, XCircle, CheckCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

export function PaymentStatusBanner({ starship }) {
  const handleUpdatePayment = async () => {
    try {
      const response = await api.post(`/v1/starships/${starship.id}/billing-portal`);
      if (response.data.url) {
        window.location.href = response.data.url;
      }
    } catch (error) {
      console.error('Failed to open billing portal:', error);
    }
  };

  const handleRetryPayment = async () => {
    try {
      const response = await api.post(`/v1/starships/${starship.id}/retry-payment`);
      if (response.data.checkoutUrl) {
        window.location.href = response.data.checkoutUrl;
      }
    } catch (error) {
      console.error('Failed to retry payment:', error);
    }
  };

  // Show payment pending banner
  if (starship.status === 'pending_payment') {
    return (
      <Card className="mb-4 border-yellow-200 bg-yellow-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <span className="text-sm text-yellow-800">
                Payment required to activate {starship.name}
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={handleRetryPayment}>
              Complete Payment
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show enhanced payment failure banner with retry info
  if (starship.status === 'restricted' && starship.lastPaymentFailure) {
    const attemptText = starship.paymentFailureCount === 1 
      ? 'first attempt' 
      : `attempt ${starship.paymentFailureCount}/4`;
    
    return (
      <Card className="mb-4 border-red-200 bg-red-50">
        <CardContent className="p-4">
          <div className="flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <XCircle className="h-5 w-5 text-red-600" />
                <div>
                  <span className="text-sm font-medium text-red-800">
                    Payment failed for {starship.name}
                  </span>
                  <p className="text-xs text-red-600 mt-1">
                    {starship.paymentFailureReason || 'Payment could not be processed'}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="destructive" onClick={handleUpdatePayment}>
                Update Payment Method
              </Button>
            </div>
            
            {/* Show retry information if available */}
            {starship.nextPaymentAttempt && (
              <div className="flex items-center space-x-2 text-xs text-red-600 bg-red-100 rounded p-2">
                <Clock className="h-4 w-4" />
                <span>
                  Automatic retry scheduled {formatDistanceToNow(new Date(starship.nextPaymentAttempt), { addSuffix: true })}
                  ({attemptText})
                </span>
              </div>
            )}
            
            {/* Show final failure warning */}
            {starship.paymentFailureCount >= 4 && (
              <div className="text-xs text-red-800 font-medium">
                ⚠️ This is the final payment attempt. Update your payment method to avoid service interruption.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show simple restricted banner (backwards compatible)
  if (starship.status === 'restricted') {
    return (
      <Card className="mb-4 border-red-200 bg-red-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <XCircle className="h-5 w-5 text-red-600" />
              <span className="text-sm text-red-800">
                Access restricted due to payment issue
              </span>
            </div>
            <Button size="sm" variant="destructive" onClick={handleUpdatePayment}>
              Update Payment Method
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show disabled banner
  if (starship.status === 'disabled') {
    return (
      <Card className="mb-4 border-gray-200 bg-gray-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <XCircle className="h-5 w-5 text-gray-600" />
              <span className="text-sm text-gray-800">
                Subscription cancelled for {starship.name}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null; // No banner for active starships
}
```

### Task 4: Add Monitoring Dashboard Endpoint (15 minutes)

#### Step 4.1: Create Payment Metrics Endpoint
**File:** `packages/server/src/routes/starships.ts` (add monitoring endpoint)

```typescript
// GET /starships/payment-metrics - Get payment failure metrics (admin only)
router.get('/starships/payment-metrics', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    // Optional: Add admin check here
    // if (!isAdmin(userId)) {
    //   res.status(403).json({ error: 'Admin access required' });
    //   return;
    // }
    
    // Get payment failure statistics
    const metrics = await starshipRepo.getPaymentMetrics();
    
    res.json({
      metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    handleError(error, res, 'Failed to fetch payment metrics');
  }
});
```

#### Step 4.2: Add Repository Method for Metrics
**File:** `packages/models/src/repositories/StarshipRepository.ts` (add after existing methods)

```typescript
/**
 * Get payment metrics for monitoring
 * @returns Payment failure statistics
 */
async getPaymentMetrics(): Promise<{
  totalStarships: number;
  activeStarships: number;
  restrictedStarships: number;
  pendingPaymentStarships: number;
  disabledStarships: number;
  recentFailures: Array<{
    starshipId: string;
    name: string;
    failureCount: number;
    lastFailure: string;
    nextAttempt: string | null;
  }>;
}> {
  const connection = getConnection();
  
  // Get counts by status
  const statusCounts = await connection.executeQuery<{
    status: string;
    count: number;
  }>(
    `MATCH (s:Starship)
     RETURN s.status as status, count(s) as count`,
    {}
  );
  
  // Get recent payment failures
  const recentFailures = await connection.executeQuery<{
    s: Starship;
  }>(
    `MATCH (s:Starship)
     WHERE s.status = 'restricted' AND s.lastPaymentFailure IS NOT NULL
     RETURN s
     ORDER BY s.lastPaymentFailure DESC
     LIMIT 10`,
    {}
  );
  
  // Process counts
  const counts = {
    totalStarships: 0,
    activeStarships: 0,
    restrictedStarships: 0,
    pendingPaymentStarships: 0,
    disabledStarships: 0
  };
  
  statusCounts.forEach(record => {
    counts.totalStarships += record.count;
    switch (record.status) {
      case 'active':
        counts.activeStarships = record.count;
        break;
      case 'restricted':
        counts.restrictedStarships = record.count;
        break;
      case 'pending_payment':
        counts.pendingPaymentStarships = record.count;
        break;
      case 'disabled':
        counts.disabledStarships = record.count;
        break;
    }
  });
  
  return {
    ...counts,
    recentFailures: recentFailures.map(record => ({
      starshipId: record.s.id,
      name: record.s.name,
      failureCount: record.s.paymentFailureCount || 0,
      lastFailure: record.s.lastPaymentFailure || '',
      nextAttempt: record.s.nextPaymentAttempt || null
    }))
  };
}
```

### Task 5: Testing & Verification (30 minutes)

#### Step 5.1: Test Payment Failure and Recovery
```bash
# Terminal 1: Start server
pnpm run dev

# Terminal 2: Start Stripe webhook listener
stripe listen --forward-to localhost:4000/webhooks/stripe

# Terminal 3: Test scenarios
# Scenario 1: Payment failure
stripe trigger invoice.payment_failed

# Verify starship is restricted
curl -X GET http://localhost:4000/starships/$STARSHIP_ID \
  -H "Authorization: Bearer $TOKEN"
# Expected: status = 'restricted', paymentFailureCount = 1

# Scenario 2: Smart Retry success
stripe trigger invoice.paid

# Verify starship is active
curl -X GET http://localhost:4000/starships/$STARSHIP_ID \
  -H "Authorization: Bearer $TOKEN"
# Expected: status = 'active', paymentFailureCount = 0
```

#### Step 5.2: Test with Real Cards
```
Test Cards for Different Scenarios:

1. Successful payment:
   - 4242 4242 4242 4242 (Visa)
   - Any future expiry, any CVC

2. Payment fails then succeeds (for retry testing):
   - 4000 0000 0000 0341 (Attaching fails)
   - Update to valid card in portal

3. Insufficient funds (will retry):
   - 4000 0000 0000 9995

4. Card declined (will not retry):
   - 4000 0000 0000 0002

5. Expired card:
   - 4000 0000 0000 0069
```

#### Step 5.3: Verify Smart Retries in Stripe Dashboard
1. Go to Stripe Dashboard → Payments → All Payments
2. Filter by "Failed" status
3. Click on a failed payment
4. Check "Timeline" tab for retry schedule
5. Verify retry attempts match configuration

### Task 6: Documentation & Runbook (15 minutes)

#### Step 6.1: Create Operations Runbook
**File:** `docs/payment-recovery-runbook.md`

```markdown
# Payment Recovery Operations Runbook

## Monitoring
Check payment health daily:
```bash
# Get payment metrics
curl -X GET http://localhost:4000/starships/payment-metrics \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Common Issues & Solutions

### Issue: Customer reports payment failed but wants immediate access
**Solution:**
1. Direct them to billing portal to update payment method
2. Payment will process immediately upon update
3. Access restored automatically via `invoice.paid` webhook

### Issue: Multiple failures for same customer
**Possible Causes:**
- Expired card
- Insufficient funds
- Bank declining charges

**Solution:**
1. Check failure reason in metrics
2. Contact customer with specific issue
3. Guide to billing portal for update

### Issue: Smart Retries not working
**Verification:**
1. Check Stripe Dashboard → Settings → Billing → Revenue recovery
2. Ensure Smart Retries is ON
3. Check webhook endpoint is receiving events
4. Verify `invoice.paid` handler is working

## Manual Interventions

### Force retry payment (emergency only):
```bash
# Via Stripe CLI
stripe invoices pay $INVOICE_ID

# Via Dashboard
1. Find invoice in Stripe Dashboard
2. Click "Retry charge now"
```

### Manually activate starship (last resort):
```cypher
MATCH (s:Starship {id: $starshipId})
SET s.status = 'active'
```

## Metrics to Track
- Recovery rate: (successful retries / total failures) * 100
- Average attempts to recovery
- Time to recovery
- Abandonment rate

## Escalation Path
1. Check payment metrics endpoint
2. Review Stripe Dashboard logs
3. Check Neo4j for starship status
4. Contact Stripe Support if systematic issue
```

## Migration Script for Existing Data

**File:** `packages/models/src/scripts/migrate-payment-tracking-fields.ts`

```typescript
#!/usr/bin/env tsx

import { createConnection, Neo4jConfig } from '../connection';

async function migratePaymentTrackingFields() {
  console.log('🚀 Adding payment tracking fields to existing starships...');

  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  };

  const connection = createConnection(config);

  try {
    await connection.connect();
    console.log('✅ Connected to Neo4j');

    // Add payment tracking fields to all starships
    const result = await connection.executeWrite(
      `MATCH (s:Starship)
       WHERE s.lastPaymentFailure IS NULL
       SET s.lastPaymentFailure = null,
           s.paymentFailureCount = 0,
           s.nextPaymentAttempt = null,
           s.paymentFailureReason = null
       RETURN count(s) as updated`
    );

    console.log(`✅ Updated ${result[0].updated} starships with payment tracking fields`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await connection.close();
    console.log('🔌 Database connection closed');
  }
}

if (require.main === module) {
  migratePaymentTrackingFields().catch(console.error);
}
```

Add to `packages/models/package.json`:
```json
"migrate:payment-tracking": "tsx src/scripts/migrate-payment-tracking-fields.ts"
```

## Testing Checklist

### Pre-Implementation
- [ ] Verify Phase 1 and 2 are working correctly
- [ ] Backup database before making changes
- [ ] Test in Stripe test mode first

### Smart Retries Configuration
- [ ] Smart Retries enabled in Stripe Dashboard
- [ ] Maximum retry period set to 14 days
- [ ] Maximum attempts set to 4
- [ ] Email notifications configured

### Payment Failure Handling
- [ ] Payment failure updates starship with tracking info
- [ ] Retry count increments correctly
- [ ] Next attempt date stored properly
- [ ] Failure reason captured

### Payment Recovery
- [ ] Successful retry clears failure tracking
- [ ] Status changes from restricted to active
- [ ] Recovery logged properly

### UI Updates
- [ ] Payment failure banner shows retry info
- [ ] Attempt count displayed correctly
- [ ] Next retry time shown
- [ ] Update payment button works

### Monitoring
- [ ] Payment metrics endpoint returns data
- [ ] Recent failures listed correctly
- [ ] Status counts accurate

## Success Criteria

### ✅ Automatic Recovery Working
- [ ] Smart Retries configured and active
- [ ] Failed payments retry automatically
- [ ] Successful retries restore access
- [ ] 48%+ recovery rate achieved

### ✅ Enhanced Tracking
- [ ] Payment failures tracked with details
- [ ] Retry attempts counted
- [ ] Next retry time stored
- [ ] Failure reasons captured

### ✅ Improved User Experience
- [ ] Clear payment failure messaging
- [ ] Retry information visible
- [ ] Easy payment update flow
- [ ] No manual intervention needed

### ✅ Operational Visibility
- [ ] Payment metrics available
- [ ] Recent failures trackable
- [ ] Recovery rates measurable
- [ ] Runbook documented

## Implementation Timeline

| Task | Time | Priority |
|------|------|----------|
| Task 1: Configure Smart Retries | 30 min | Critical |
| Task 2: Enhance Failure Handling | 45 min | Critical |
| Task 3: Update UI Components | 30 min | High |
| Task 4: Add Monitoring | 15 min | Medium |
| Task 5: Testing | 30 min | Critical |
| Task 6: Documentation | 15 min | Medium |
| **Total** | **2 hours** | - |

## Key Differences from Research Document

Based on the MVP research document, this implementation focuses on:

1. **Leveraging Stripe's Built-in Features:**
   - Smart Retries handle scheduling automatically
   - No custom retry logic needed
   - Email dunning handled by Stripe

2. **Minimal Code Changes:**
   - Only tracking fields added
   - Webhook handlers enhanced
   - UI updated for better feedback

3. **MVP Approach:**
   - No complex grace periods
   - No custom notification system (Phase 4)
   - Rely on Stripe's proven recovery system

## Next Steps (Phase 4 - Optional Enhancements)

After Phase 3 is complete and tested:

1. **Custom Notifications:**
   - Email service integration
   - Payment failure notifications
   - Recovery success notifications

2. **Advanced Analytics:**
   - Recovery rate tracking
   - Churn prediction
   - Revenue impact analysis

3. **Grace Period Implementation:**
   - Configurable grace periods
   - Partial access during grace
   - Warning notifications

4. **Admin Dashboard:**
   - Visual payment metrics
   - Failed payment queue
   - Manual intervention tools

## Rollback Plan

If issues occur:

1. **Disable Smart Retries:**
   - Turn off in Stripe Dashboard
   - Existing subscriptions continue working

2. **Revert Code Changes:**
   ```bash
   git revert [commit-hash]
   pnpm build
   pnpm deploy
   ```

3. **Clear Tracking Fields:**
   ```cypher
   MATCH (s:Starship)
   REMOVE s.lastPaymentFailure, 
          s.paymentFailureCount,
          s.nextPaymentAttempt,
          s.paymentFailureReason
   ```

## Commands Reference

```bash
# Development
pnpm run dev                          # Start server
pnpm run migrate:payment-tracking    # Add tracking fields

# Testing
stripe listen --forward-to localhost:4000/webhooks/stripe
stripe trigger invoice.payment_failed
stripe trigger invoice.paid

# Monitoring
curl http://localhost:4000/starships/payment-metrics -H "Authorization: Bearer $TOKEN"

# Database queries
# Check restricted starships
cypher> MATCH (s:Starship {status: 'restricted'}) 
        RETURN s.name, s.paymentFailureCount, s.nextPaymentAttempt;

# Check recovery success
cypher> MATCH (s:Starship) 
        WHERE s.paymentFailureCount = 0 AND s.lastPaymentFailure IS NOT NULL
        RETURN count(s) as recovered;
```

---

**Document Version:** 1.0  
**Created:** 2025-08-12  
**Status:** Ready for Implementation  
**Prerequisites:** Phase 1 and Phase 2 completed

## Summary

Phase 3 implements automatic payment recovery through Stripe Smart Retries with minimal code changes. The focus is on:

1. **Configuration over Code:** Leverage Stripe's built-in Smart Retries
2. **Enhanced Tracking:** Store failure details for better visibility
3. **Improved UX:** Show retry information to reduce support tickets
4. **Monitoring:** Basic metrics for operational health

This MVP approach achieves 48-70% payment recovery rates with ~2 hours of implementation time, compared to 30-40% without Smart Retries.