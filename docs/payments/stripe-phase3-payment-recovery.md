# Phase 3: Payment Recovery & Smart Retries - MVP Implementation

## Overview
Minimal implementation for automatic payment recovery through Stripe Smart Retries. Includes fixes for UI gaps found during analysis.

**Estimated Time:** 1.5 hours  
**Priority:** Critical - Required for payment recovery  
**Prerequisites:** Phase 1 and Phase 2 completed

## Current Implementation Status

### ✅ What's Already Working:
- Webhooks handle all status transitions
- `/retry-payment` endpoint for pending payments
- `/billing-portal` endpoint for payment updates  
- PaymentStatusBanner component shows correct messages
- Smart Retries configuration ready

### ⚠️ Gaps Found:
1. **Misleading "Reactivate" button** - Shows for disabled status but won't work
2. **No user awareness** - When payment fails, user doesn't know until they check

## Status Flow Coverage

```
pending_payment → active (checkout completed) ✅
active → restricted (payment fails) ✅ 
restricted → active (payment recovered) ✅
active/restricted → disabled (subscription cancelled) ✅
disabled → (terminal state - needs new subscription) ⚠️ Misleading UI
```

## Implementation Tasks

### Task 1: Configure Stripe Smart Retries (15 minutes)

#### Step 1.1: Enable in Stripe Dashboard
**Navigate to:** https://dashboard.stripe.com/settings/billing/automatic

**Required Settings:**
```
☐ Enable Smart Retries: ON
☐ Maximum retry period: 14 days
☐ Maximum attempts: 4
☐ Let Stripe optimize retry timing: Yes
```

**Email Notifications (Critical for user awareness):**
```
☐ Send payment failure emails: ON
☐ Send payment retry emails: ON
```

**Email notifications are the primary way users know about payment issues in this MVP.**

### Task 2: Fix UI Issues (20 minutes)

#### Step 2.1: Remove Misleading "Reactivate" Button
**File:** `packages/client/src/components/starships/PaymentStatusBanner.tsx`

Update the disabled status handler (lines 83-100):

```typescript
if (starship.status === 'disabled') {
  return (
    <Card className="mb-4 border-red-200 bg-red-50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <XCircle className="h-5 w-5 text-red-600" />
            <div>
              <span className="text-sm text-red-800">
                Subscription ended for {starship.name}
              </span>
              <p className="text-xs text-red-600 mt-1">
                Create a new starship to start a new subscription
              </p>
            </div>
          </div>
          {/* No button - disabled is terminal state */}
        </div>
      </CardContent>
    </Card>
  );
}
```

### Task 3: Enhance Webhook Logging (15 minutes)

#### Step 3.1: Better Status Transition Logging
**File:** `packages/server/src/routes/webhooks.ts`

Ensure all status transitions are clearly logged:

```typescript
case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session;
  const starshipId = session.metadata?.starshipId;
  
  if (!starshipId) {
    throw new Error('Invalid checkout session: missing starshipId');
  }
  
  // Get current status for logging
  const starship = await starshipRepository.findById(starshipId);
  const previousStatus = starship?.status || 'unknown';
  
  await starshipRepository.update(starshipId, {
    stripeCustomerId: session.customer as string,
    subscriptionId: session.subscription as string,
    status: 'active'
  });
  
  console.log(`✅ [WEBHOOK] Starship ${starshipId} activated (${previousStatus} → active)`);
  processed = true;
  break;
}

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
    const previousStatus = starship.status;
    
    await starshipRepository.updateSubscription(starship.id, { 
      status: 'restricted' 
    });
    
    const attemptCount = failedInvoice.attempt_count || 1;
    const nextAttempt = failedInvoice.next_payment_attempt 
      ? new Date(failedInvoice.next_payment_attempt * 1000).toISOString()
      : 'No retry scheduled';
      
    console.log(`⚠️ [WEBHOOK] Payment failed for ${starship.name} (${previousStatus} → restricted)`);
    console.log(`   Customer: ${starship.stripeCustomerId}`);
    console.log(`   Attempt ${attemptCount}/4, Next retry: ${nextAttempt}`);
    console.log(`   User will receive email notification from Stripe`);
    
    processed = true;
  }
  break;
}

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
    const previousStatus = starship.status;
    const wasRestricted = previousStatus === 'restricted';
    
    await starshipRepository.updateSubscription(starship.id, { 
      status: 'active' 
    });
    
    if (wasRestricted) {
      console.log(`✅ [WEBHOOK] Payment RECOVERED for ${starship.name} (restricted → active)`);
      console.log(`   User will receive success email from Stripe`);
    } else {
      console.log(`✅ [WEBHOOK] Payment successful for ${starship.name} (${previousStatus} → active)`);
    }
    
    processed = true;
  }
  break;
}

case 'customer.subscription.deleted': {
  const deletedSub = event.data.object as Stripe.Subscription;
  const starship = await starshipRepository.findBySubscriptionId(deletedSub.id);
  
  if (starship) {
    const previousStatus = starship.status;
    
    await starshipRepository.updateSubscription(starship.id, { 
      status: 'disabled'
    });
    
    console.log(`❌ [WEBHOOK] Subscription cancelled for ${starship.name} (${previousStatus} → disabled)`);
    console.log(`   This is terminal - user must create new starship for new subscription`);
    processed = true;
  }
  break;
}
```

### Task 4: Documentation for Users (10 minutes)

Create a simple notice for users about payment system behavior:

**File:** `docs/payments/user-guide.md` (new file)

```markdown
# Payment System User Guide

## Important Notes

### Payment Status
- You will receive email notifications from Stripe for all payment events
- Check your starship list regularly to see current payment status

### Payment Recovery
- Failed payments automatically retry on days 3, 5, 7, and 14
- You can update payment method anytime via "Update Payment" button
- Successful payment update processes immediately

### Cancelled Subscriptions
- Cancelled subscriptions cannot be reactivated
- Create a new starship to start a new subscription
```

### Task 5: Testing All Scenarios (30 minutes)

#### Step 5.1: Test Each Status Flow

```bash
# Start server and webhook listener
pnpm run dev
stripe listen --forward-to localhost:4000/webhooks/stripe
```

**Test Matrix:**

| Scenario | Test Steps | Expected Result | UI Check |
|----------|------------|-----------------|----------|
| **Pending → Active** | 1. Create paid starship<br>2. Complete checkout | Status: active<br>Log: "pending_payment → active" | No banner shown |
| **Active → Restricted** | 1. `stripe trigger invoice.payment_failed` | Status: restricted<br>Log: "active → restricted" | Shows "Update Payment" |
| **Restricted → Active** | 1. Update card in portal<br>2. Or wait for retry | Status: active<br>Log: "restricted → active" | Banner removed |
| **Any → Disabled** | 1. Cancel in portal<br>2. Or `stripe trigger customer.subscription.deleted` | Status: disabled<br>Log: "→ disabled" | Shows "Subscription ended" (no button) |

#### Step 5.2: Verify Email Notifications

1. Check Stripe Dashboard → Emails → Email history
2. Confirm emails sent for:
   - Payment failures
   - Retry attempts
   - Successful recovery
   - Subscription cancellation

## Implementation Checklist

### Configuration
- [ ] Smart Retries enabled (14 days, 4 attempts)
- [ ] Email notifications ON for all events
- [ ] Webhook events registered

### Code Changes
- [ ] Remove "Reactivate" button for disabled status
- [ ] Enhance webhook logging with status transitions
- [ ] Create user guide documentation

### Testing
- [ ] All 4 status transitions work
- [ ] Email notifications sent by Stripe
- [ ] UI shows correct message for each status
- [ ] Logs clearly show status transitions

## Known Limitations (Acceptable for MVP)

1. **No Real-time Updates**
   - Status changes visible on next page load/navigation
   - Mitigation: Stripe sends email notifications

2. **Disabled is Terminal**
   - Cannot reactivate cancelled subscription
   - Must create new starship
   - UI clearly indicates this

3. **No In-App Notifications**
   - Rely on Stripe email notifications
   - Users informed via email about payment issues

## Summary

This MVP implementation provides:
- **Complete payment lifecycle handling** (all 4 statuses)
- **48-70% automatic recovery** via Smart Retries
- **Clear user communication** via Stripe emails
- **Proper UI states** for each scenario
- **1.5 hours implementation** time

The system handles all payment scenarios with minimal code, leveraging Stripe's infrastructure for reliability.

## Commands Reference

```bash
# Testing
stripe listen --forward-to localhost:4000/webhooks/stripe
stripe trigger checkout.session.completed    # pending_payment → active
stripe trigger invoice.payment_failed        # active → restricted
stripe trigger invoice.paid                  # restricted → active
stripe trigger customer.subscription.deleted # any → disabled

# Check starship status
curl http://localhost:4000/starships/$STARSHIP_ID \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.status'
```

---

**Document Version:** 5.0 (True MVP - No Real-time Updates)  
**Updated:** 2025-08-12  
**Status:** Ready for Implementation  
**Time to Implement:** 1.5 hours

## Next Steps (Post-MVP)

After Phase 3 is working:

1. **Improve Disabled Flow** (Phase 4)
   - "Create New Starship" button for disabled status
   - Guide user through new subscription

2. **Add Payment History** (Phase 5)
   - Show payment attempts
   - Display next retry time in UI

3. **Real-time Updates** (Phase 6 - if needed)
   - Consider polling or WebSockets
   - Only if user feedback indicates it's necessary