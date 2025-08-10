# Stripe Per-Workspace Billing - MVP Implementation Guide
## For Starships.ai

---

## Overview

This guide provides the **minimum viable implementation** for per-workspace (per-starship) billing using Stripe. Each starship requires its own subscription.

**Important**: This implementation follows a "fail-fast" principle. If any billing operation fails (payment, webhook, subscription), the system will return an error rather than providing fallbacks. This ensures billing integrity and prevents users from accessing paid features without valid subscriptions.

### Billing Model
- **Scout (Free)**: Up to 3 starships per user
- **Cruiser**: $30/month or $360/year per starship
- **Draught**: $100/month or $1,200/year per starship

---

## 1. Database Schema (Neo4j)

```typescript
// Add to existing User node
interface User {
  // ... existing fields
  stripeCustomerId?: string;  // Stripe customer ID
}

// Add to existing Starship node
interface Starship {
  // ... existing fields
  subscriptionId?: string;     // Stripe subscription ID
  plan: 'scout' | 'cruiser' | 'draught';
  status: 'active' | 'restricted' | 'disabled';
  billingPeriod?: 'monthly' | 'yearly';
}
```

---

## 2. Stripe Setup Script

```typescript
// packages/server/scripts/setup-stripe.ts
import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PRODUCTS = {
  cruiser: {
    name: 'Cruiser Starship',
    metadata: { plan_type: 'cruiser' }
  },
  draught: {
    name: 'Draught Starship', 
    metadata: { plan_type: 'draught' }
  }
};

const PRICES = {
  cruiser_monthly: { amount: 3000, interval: 'month' },
  cruiser_yearly: { amount: 36000, interval: 'year' },
  draught_monthly: { amount: 10000, interval: 'month' },
  draught_yearly: { amount: 120000, interval: 'year' }
};

async function setup() {
  // Create products
  for (const [key, config] of Object.entries(PRODUCTS)) {
    const product = await stripe.products.create(config);
    console.log(`Created product: ${product.id}`);
    
    // Create prices
    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: PRICES[`${key}_monthly`].amount,
      currency: 'usd',
      recurring: { interval: PRICES[`${key}_monthly`].interval }
    });
    
    const yearlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: PRICES[`${key}_yearly`].amount,
      currency: 'usd',
      recurring: { interval: PRICES[`${key}_yearly`].interval }
    });
    
    console.log(`  Monthly price: ${monthlyPrice.id}`);
    console.log(`  Yearly price: ${yearlyPrice.id}`);
  }
}

setup();
```

---

## 3. Backend Implementation

### Subscription Service

```typescript
// packages/server/src/services/subscription.service.ts
import Stripe from 'stripe';

export class SubscriptionService {
  private stripe: Stripe;
  
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  
  // Check if user can create free starship
  async canCreateFreeStarship(userId: string): Promise<boolean> {
    const count = await db.query(`
      MATCH (u:User {id: $userId})-[:OWNS]->(s:Starship {plan: 'scout'})
      RETURN count(s) as count
    `, { userId });
    
    return count < 3;
  }
  
  // Create checkout session for paid starship
  async createCheckoutSession(params: {
    userId: string;
    starshipName: string;
    plan: 'cruiser' | 'draught';
    billingPeriod: 'monthly' | 'yearly';
  }) {
    // Get or create Stripe customer
    const user = await db.findUser(params.userId);
    let customerId = user.stripeCustomerId;
    
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        metadata: { userId: params.userId }
      });
      customerId = customer.id;
      await db.updateUser(params.userId, { stripeCustomerId: customerId });
    }
    
    // Get price ID
    const prices = await this.stripe.prices.list({
      lookup_keys: [`${params.plan}_${params.billingPeriod}`]
    });
    const priceId = prices.data[0]?.id;
    
    if (!priceId) {
      throw new Error('Price not found');
    }
    
    // Build URLs dynamically based on PORT
    const port = process.env.PORT || 4000;
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? `https://${process.env.DOMAIN}` 
      : `http://localhost:${port}`;
    
    // Create checkout session
    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${baseUrl}/starships/create/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/starships/create/cancel`,
      metadata: {
        userId: params.userId,
        starshipName: params.starshipName,
        plan: params.plan
      }
    });
    
    return session.url;
  }
  
  // Create portal session for managing subscription
  async createPortalSession(starshipId: string) {
    const starship = await db.findStarship(starshipId);
    const user = await db.findUser(starship.ownerId);
    
    // Build return URL dynamically
    const port = process.env.PORT || 4000;
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? `https://${process.env.DOMAIN}` 
      : `http://localhost:${port}`;
    
    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${baseUrl}/starships/${starshipId}`
    });
    
    return session.url;
  }
}
```

### Webhook Handler

```typescript
// packages/server/src/routes/webhooks.ts
import { Router } from 'express';
import express from 'express';
import Stripe from 'stripe';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// IMPORTANT: Use raw body for webhook signature verification
// This creates the endpoint at /webhooks/stripe (separate from /api routes)
router.post('/webhooks/stripe', 
  express.raw({ type: 'application/json' }), 
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    
    let event: Stripe.Event;
    
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return res.status(400).send('Webhook Error');
    }
    
    // Process webhook events - let errors bubble up
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        
        // Create starship after successful payment
        // If this fails, Stripe will retry the webhook
        await db.createStarship({
          name: session.metadata.starshipName,
          ownerId: session.metadata.userId,
          plan: session.metadata.plan,
          subscriptionId: session.subscription,
          status: 'active'
        });
        break;
        
      case 'customer.subscription.updated':
        const subscription = event.data.object;
        
        // Update starship status based on subscription
        const status = subscription.status === 'active' ? 'active' : 'restricted';
        await db.updateStarshipBySubscription(subscription.id, { status });
        break;
        
      case 'customer.subscription.deleted':
        // Disable starship when subscription is cancelled
        await db.updateStarshipBySubscription(event.data.object.id, { 
          status: 'disabled' 
        });
        break;
        
      case 'invoice.payment_failed':
        // Restrict starship on payment failure
        const invoice = event.data.object;
        await db.updateStarshipBySubscription(invoice.subscription, { 
          status: 'restricted' 
        });
        break;
    }
    
    res.json({ received: true });
  }
);

export default router;
```

---

## 4. Frontend Implementation

### API Endpoint for Pricing

First, add an endpoint to serve pricing data from Stripe:

```typescript
// packages/server/src/routes/starships.ts (add to existing router)

// Get pricing information from Stripe
router.get('/starships/pricing', async (req, res) => {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    
    // Fetch all active products with their prices
    const products = await stripe.products.list({ active: true });
    const prices = await stripe.prices.list({ active: true });
    
    // Format pricing data for frontend
    const pricing = products.data
      .filter(product => product.metadata.plan_type) // Only our plan products
      .map(product => {
        const productPrices = prices.data.filter(p => p.product === product.id);
        const monthlyPrice = productPrices.find(p => p.recurring?.interval === 'month');
        const yearlyPrice = productPrices.find(p => p.recurring?.interval === 'year');
        
        return {
          id: product.metadata.plan_type,
          name: product.name,
          description: product.description,
          monthly: monthlyPrice ? monthlyPrice.unit_amount / 100 : 0,
          yearly: yearlyPrice ? yearlyPrice.unit_amount / 100 : 0,
          features: {
            maxAgents: parseInt(product.metadata.max_agents || '0'),
            maxExpeditions: parseInt(product.metadata.max_expeditions || '0')
          }
        };
      });
    
    // Add Scout (free) plan info
    pricing.unshift({
      id: 'scout',
      name: 'Scout Starship',
      description: 'Free tier with limited features',
      monthly: 0,
      yearly: 0,
      features: {
        maxAgents: 3,
        maxExpeditions: 2
      }
    });
    
    res.json(pricing);
  } catch (error) {
    console.error('Failed to fetch pricing:', error);
    res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});
```

### Create Starship Flow

```tsx
// components/CreateStarship.tsx
import { useState, useEffect } from 'react';

export function CreateStarship() {
  const [starshipName, setStarshipName] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Fetch pricing from API
  useEffect(() => {
    async function fetchPricing() {
      try {
        const response = await fetch('/api/starships/pricing');
        if (!response.ok) throw new Error('Failed to fetch pricing');
        const data = await response.json();
        setPlans(data);
      } catch (error) {
        console.error('Failed to load pricing:', error);
        // No fallback - show error to user
        alert('Failed to load pricing. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    }
    fetchPricing();
  }, []);
  
  const handleCreate = async () => {
    if (selectedPlan === 'scout') {
      // Create free starship
      const response = await fetch('/api/starships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: starshipName, class: 'scout' })
      });
      
      if (response.ok) {
        window.location.href = '/starships';
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create starship');
      }
    } else {
      // Redirect to Stripe Checkout
      const response = await fetch('/api/starships/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          starshipName,
          plan: selectedPlan,
          billingPeriod
        })
      });
      
      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url;
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to start checkout');
      }
    }
  };
  
  if (loading) {
    return <div>Loading pricing...</div>;
  }
  
  if (!plans.length) {
    return <div>Failed to load pricing. Please refresh the page.</div>;
  }
  
  return (
    <div>
      <input
        type="text"
        placeholder="Starship Name"
        value={starshipName}
        onChange={(e) => setStarshipName(e.target.value)}
      />
      
      <div>
        {plans.map(plan => (
          <div key={plan.id} onClick={() => setSelectedPlan(plan.id)}>
            <h3>{plan.name}</h3>
            <p>{plan.description}</p>
            {plan.id === 'scout' ? (
              <div>
                <p>Free</p>
                <p>Max 3 starships per account</p>
                <p>{plan.features.maxAgents} agents • {plan.features.maxExpeditions} expeditions</p>
              </div>
            ) : (
              <div>
                <label>
                  <input
                    type="radio"
                    name={`billing-${plan.id}`}
                    checked={selectedPlan === plan.id && billingPeriod === 'monthly'}
                    onChange={() => {
                      setSelectedPlan(plan.id);
                      setBillingPeriod('monthly');
                    }}
                  />
                  ${plan.monthly}/month
                </label>
                <label>
                  <input
                    type="radio"
                    name={`billing-${plan.id}`}
                    checked={selectedPlan === plan.id && billingPeriod === 'yearly'}
                    onChange={() => {
                      setSelectedPlan(plan.id);
                      setBillingPeriod('yearly');
                    }}
                  />
                  ${plan.yearly}/year
                </label>
                <p>{plan.features.maxAgents} agents • {plan.features.maxExpeditions} expeditions</p>
              </div>
            )}
          </div>
        ))}
      </div>
      
      <button 
        onClick={handleCreate}
        disabled={!starshipName || !selectedPlan}
      >
        Create Starship
      </button>
    </div>
  );
}
```

### Manage Subscription

```tsx
// components/StarshipSettings.tsx
export function StarshipSettings({ starship }) {
  const handleManageSubscription = async () => {
    const response = await fetch(`/api/starships/${starship.id}/portal`);
    const { url } = await response.json();
    window.location.href = url;
  };
  
  return (
    <div>
      <h2>{starship.name}</h2>
      <p>Plan: {starship.plan}</p>
      <p>Status: {starship.status}</p>
      
      {starship.plan !== 'scout' && (
        <button onClick={handleManageSubscription}>
          Manage Subscription
        </button>
      )}
      
      {starship.status === 'restricted' && (
        <div className="alert">
          Your starship has limited functionality due to a payment issue.
          <button onClick={handleManageSubscription}>Update Payment</button>
        </div>
      )}
    </div>
  );
}
```

---

## 5. Dependencies & Environment

### Package.json

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "stripe": "^14.0.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "neo4j-driver": "^5.14.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.20",
    "@types/cors": "^2.8.15",
    "typescript": "^5.2.2",
    "ts-node": "^10.9.1",
    "nodemon": "^3.0.1"
  },
  "scripts": {
    "dev": "nodemon --exec ts-node src/app.ts",
    "stripe:setup": "ts-node scripts/setup-stripe.ts",
    "stripe:listen": "node -e \"const p=process.env.PORT||4000; console.log('Forwarding to port',p); require('child_process').spawn('stripe',['listen','--forward-to',`localhost:${p}/webhooks/stripe`],{stdio:'inherit'})\""
  }
}
```

### Install Dependencies

```bash
# From root directory (pnpm workspace)
pnpm install

# Add Stripe to the server package
pnpm --filter @starships/server add stripe
pnpm --filter @starships/server add -D @types/stripe

# Or navigate to server package
cd packages/server
pnpm add stripe
pnpm add -D @types/stripe
```

### Environment Variables

```bash
# .env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Server (PORT is already defined in your env-config)
PORT=4000  # Optional, defaults to 4000

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password
```

---

## 6. Express API Routes

```typescript
// packages/server/src/routes/starships.ts (add to existing file)
import { Router } from 'express';
import { SubscriptionService } from '../services/subscription.service';

const router = Router();
const subscriptionService = new SubscriptionService();

// NOTE: These routes will be added to your existing starships.ts router
// The router is mounted at /api, so endpoints become /api/starships/...

// Modified POST /starships to handle free tier
// Update your existing POST /starships endpoint to check for free tier limits
router.post('/starships', authMiddleware, async (req, res) => {
  const { name, class: starshipClass } = req.body;
  const userId = req.user.id;
  
  // For MVP, treat 'scout' class as free tier
  if (starshipClass === 'scout') {
    const canCreate = await subscriptionService.canCreateFreeStarship(userId);
    if (!canCreate) {
      return res.status(400).json({ error: 'Free starship limit reached (max 3)' });
    }
  }
  
  // Continue with existing starship creation logic...
  // Your existing starship creation code here
});

// New endpoint for creating Stripe checkout session
router.post('/starships/checkout-session', authMiddleware, async (req, res) => {
  const { starshipName, plan, billingPeriod } = req.body;
  const userId = req.user.id;
  
  try {
    const checkoutUrl = await subscriptionService.createCheckoutSession({
      userId,
      starshipName,
      plan,
      billingPeriod
    });
    
    res.json({ url: checkoutUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// New endpoint for Stripe portal session
router.post('/starships/:id/billing-portal', authMiddleware, async (req, res) => {
  const starshipId = req.params.id;
  
  try {
    const portalUrl = await subscriptionService.createPortalSession(starshipId);
    res.json({ url: portalUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Your existing GET /starships already lists user's starships
// No changes needed

export default router;
```

### Main Express App Setup

```typescript
// packages/server/src/index.ts (update existing file)
import express from 'express';
import cors from 'cors';
import starshipRoutes from './routes/starships';
import webhookRoutes from './routes/webhooks';

const app = express();

// IMPORTANT: Webhook route must be before body parser
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }), webhookRoutes);

// Regular middleware
app.use(cors());
app.use(express.json());

// Mount routes - matching your existing pattern
app.use('/api', starshipRoutes);  // Creates /api/starships/...

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

---

## 7. Starship Access Control Middleware

```typescript
// packages/server/src/middleware/starship-access.ts
import { Request, Response, NextFunction } from 'express';

export async function checkStarshipAccess(
  req: Request, 
  res: Response, 
  next: NextFunction
) {
  const starshipId = req.params.starshipId;
  const starship = await db.findStarship(starshipId);
  
  if (!starship) {
    return res.status(404).json({ error: 'Starship not found' });
  }
  
  // Check ownership
  if (starship.ownerId !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // Check subscription status
  if (starship.status === 'disabled') {
    return res.status(403).json({ 
      error: 'Subscription ended. Please reactivate to continue.' 
    });
  }
  
  if (starship.status === 'restricted') {
    // Allow read operations but block write operations
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
      return res.status(402).json({ 
        error: 'Payment required. Please update your payment method.',
        updatePaymentUrl: `/api/starships/${starshipId}/portal`
      });
    }
  }
  
  // Attach starship to request for use in route handlers
  req.starship = starship;
  next();
}

// Usage in routes
router.post('/api/starships/:starshipId/expeditions', 
  checkStarshipAccess,
  async (req, res) => {
    // Route handler - starship is available as req.starship
    const expedition = await createExpedition(req.starship.id, req.body);
    res.json(expedition);
  }
);
```

---

## 8. Implementation Steps

### Phase 1: Stripe Account & Configuration
**Goal**: Set up Stripe account and configure products/prices

1. **Create Stripe Account**
   - [ ] Sign up at https://stripe.com
   - [ ] Complete business verification
   - [ ] Note down test mode API keys

2. **Configure Environment**
   - [ ] Create `.env` file in backend
   - [ ] Add `STRIPE_SECRET_KEY` (test key)
   - [ ] Add `STRIPE_PUBLISHABLE_KEY` (test key)

3. **Create Products & Prices**
   - [ ] Install Stripe SDK: `pnpm --filter @starships/server add stripe`
   - [ ] Create `packages/server/scripts/setup-stripe.ts`
   - [ ] Run `pnpm --filter @starships/server run stripe:setup`
   - [ ] Verify products in Stripe Dashboard

4. **Setup Webhook Endpoint**
   - [ ] Go to Stripe Dashboard > Webhooks
   - [ ] Add endpoint: `http://your-domain/webhooks/stripe`
   - [ ] Select events: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`
   - [ ] Copy webhook secret to `.env` as `STRIPE_WEBHOOK_SECRET`

---

### Phase 2: Database Updates
**Goal**: Extend existing schema for subscriptions

1. **Update User Model**
   ```cypher
   // Add stripeCustomerId property to existing users
   MATCH (u:User)
   WHERE NOT EXISTS(u.stripeCustomerId)
   SET u.stripeCustomerId = null
   ```

2. **Update Starship Model**
   ```cypher
   // Add subscription properties to existing starships
   MATCH (s:Starship)
   WHERE NOT EXISTS(s.subscriptionId)
   SET s.subscriptionId = null,
       s.status = 'active',
       s.billingPeriod = null
   ```

3. **Create Database Functions**
   - [ ] Add `findUserByStripeCustomerId` function
   - [ ] Add `updateStarshipBySubscription` function
   - [ ] Add `countFreeStarships` function

---

### Phase 3: Backend Services Implementation
**Goal**: Implement core subscription logic

1. **Create Subscription Service** (`services/subscription.service.ts`)
   - [ ] Implement `canCreateFreeStarship` method
   - [ ] Implement `createCheckoutSession` method
   - [ ] Implement `createPortalSession` method
   - [ ] Add Stripe customer creation logic

2. **Setup Express Routes** (add to existing `routes/starships.ts`)
   - [ ] GET `/api/starships/pricing` - Fetch pricing from Stripe
   - [ ] Modify POST `/api/starships` - Add free tier limit check
   - [ ] POST `/api/starships/checkout-session` - Create Stripe checkout
   - [ ] POST `/api/starships/:id/billing-portal` - Get portal URL
   - [ ] GET `/api/starships` - Already exists, lists starships

3. **Implement Webhook Handler** (`routes/webhooks.ts`)
   - [ ] Setup raw body parser for webhook route
   - [ ] Add signature verification
   - [ ] Handle `checkout.session.completed`
   - [ ] Handle `customer.subscription.updated`
   - [ ] Handle `customer.subscription.deleted`
   - [ ] Handle `invoice.payment_failed`

4. **Add Access Control Middleware** (`middleware/starship-access.ts`)
   - [ ] Check starship ownership
   - [ ] Verify subscription status
   - [ ] Block restricted actions for unpaid starships
   - [ ] Allow read-only access for restricted starships

---

### Phase 4: Frontend Integration
**Goal**: Update UI for subscription flow

1. **Update Create Starship Component**
   - [ ] Add plan selection UI (Scout/Cruiser/Draught)
   - [ ] Add billing period toggle (monthly/yearly)
   - [ ] Integrate free starship creation
   - [ ] Add redirect to Stripe Checkout

2. **Create Success/Cancel Pages**
   - [ ] `/starships/create/success` - Handle successful payment
   - [ ] `/starships/create/cancel` - Handle cancelled payment
   - [ ] Poll for starship creation completion

3. **Update Starship Settings**
   - [ ] Display current plan and status
   - [ ] Add "Manage Subscription" button
   - [ ] Show payment warnings for restricted starships
   - [ ] Handle portal session creation

4. **Handle Payment States in UI**
   - [ ] Show restricted state warnings
   - [ ] Disable actions for disabled starships
   - [ ] Add payment update prompts

---

### Phase 5: Testing & Validation
**Goal**: Ensure everything works correctly

1. **Local Testing Setup**
   - [ ] Install Stripe CLI: `brew install stripe/stripe-cli/stripe`
   - [ ] Login: `stripe login`
   - [ ] Start webhook forwarding: `pnpm run stripe:listen`

2. **Test Payment Flows**
   - [ ] Test creating free starship (should work up to 3)
   - [ ] Test 4th free starship (should fail)
   - [ ] Test checkout with card `4242424242424242`
   - [ ] Verify starship created after payment
   - [ ] Test subscription management portal

3. **Test Failure Scenarios**
   - [ ] Test with declining card `4000000000000002`
   - [ ] Test subscription cancellation
   - [ ] Verify starship becomes restricted/disabled
   - [ ] Test payment recovery flow

4. **Verify Webhook Processing**
   - [ ] Check webhook logs in Stripe Dashboard
   - [ ] Verify database updates after events
   - [ ] Test with Stripe CLI event triggers

---

### Phase 6: Production Deployment
**Goal**: Deploy to production environment

1. **Switch to Production Keys**
   - [ ] Get production API keys from Stripe
   - [ ] Update production environment variables
   - [ ] Create production webhook endpoint

2. **Database Migration**
   - [ ] Run schema updates on production database
   - [ ] Migrate existing starships to free plan

3. **Deploy & Monitor**
   - [ ] Deploy backend changes
   - [ ] Deploy frontend changes
   - [ ] Monitor first transactions
   - [ ] Check webhook delivery

---

## 9. Testing with Stripe CLI

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local (uses PORT env variable, defaults to 4000)
# Using the npm script which reads PORT dynamically:
pnpm run stripe:listen

# Or manually with your PORT:
stripe listen --forward-to localhost:$(echo ${PORT:-4000})/webhooks/stripe

# Test cards
4242424242424242  # Success
4000000000000002  # Decline
```

---

## Key Points

- Each paid starship = separate subscription
- Free starships limited to 3 per user
- Use Stripe Checkout for payments (no custom UI)
- Use Stripe Portal for subscription management
- Restrict functionality when payment fails
- Disable starship when subscription ends

## Error Handling Philosophy

**No Fallbacks**: This implementation intentionally has no fallback mechanisms for billing operations:
- If Stripe API is down → Payment operations fail
- If webhook signature is invalid → Reject the webhook
- If price not found → Throw error, don't use defaults
- If subscription check fails → Deny access

This ensures:
1. **Billing integrity** - Never give access without confirmed payment
2. **Clear failures** - Problems are immediately visible
3. **Audit trail** - All billing decisions are explicit
4. **No hidden issues** - Failures surface immediately for fixing

This MVP implementation provides the core functionality needed for per-workspace billing without unnecessary complexity.