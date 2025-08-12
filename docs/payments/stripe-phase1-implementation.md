# Stripe Integration Phase 1: Detailed Implementation Guide

## Overview
This document provides step-by-step implementation instructions for Phase 1 of the Stripe integration for starships.ai. Phase 1 focuses on setting up the Stripe infrastructure, configuring products/prices, and preparing the database schema.

## Prerequisites
- [ ] Stripe account created at https://stripe.com
- [ ] Access to Stripe Dashboard
- [ ] pnpm and Node.js installed
- [ ] Neo4j database running
- [ ] Access to environment variables

## ⚠️ Critical Issues Identified & Resolved

**This implementation plan has been updated based on comprehensive codebase analysis conducted on 2025-01-10.**

### Key Findings & Status:
1. **✅ Environment System**: Uses custom configuration (not zod) - plan updated accordingly  
2. **✅ Repository Patterns**: Uses `getConnection().executeQuery/executeWrite` - plan updated with correct patterns
3. **🔴 Type System BLOCKER**: Starship interface missing 'draught' class and billing fields - **MUST be fixed first**
4. **✅ Tools Available**: tsx v4.20.3, pnpm workspace, TypeScript v5.8.3 all ready
5. **🟡 Database Repository**: Needs Stripe-specific methods - plan includes required additions
6. **✅ Authentication**: Kinde integration ready for Stripe middleware
7. **✅ Server Structure**: Express v5.1.0 with proper route/middleware patterns established

### New Critical Issues Found:
1. **🔴 Repository Method Mismatch**: StarshipRepository uses `executeQuery/executeWrite`, not `connection.run` - **FIXED in plan**
2. **🔴 Starship Validation Constraint**: Current validation only allows 'scout'|'cruiser' classes, rejects 'draught' - **MUST be fixed**
3. **🔴 Type Interface Mismatch**: User interface missing stripeCustomerId field - **MUST be added**  
4. **🟡 Environment Config Structure**: Missing Stripe environment variables in ServerEnvironmentConfig - **MUST be added**

### Implementation Order (Critical):
1. **FIRST**: Update type definitions in packages/models/src/types.ts (resolves blocker)
2. **SECOND**: Update environment config in packages/env-config/ (adds Stripe support)
3. **THIRD**: Install Stripe dependency (`pnpm --filter @starships/server add stripe`)
4. **THEN**: Follow remaining steps

---

## Step 1: Stripe Account Setup

### 1.1 Create Stripe Account
1. Navigate to https://stripe.com
2. Sign up for a new account
3. Complete business verification (can use test mode initially)
4. Navigate to Developers > API keys
5. Copy your test mode keys:
   - Publishable key (starts with `pk_test_`)
   - Secret key (starts with `sk_test_`)

### 1.2 Configure Stripe Dashboard Settings
1. **Customer Portal Configuration**:
   - Go to Settings > Billing > Customer Portal
   - Enable the customer portal
   - Configure allowed actions:
     - ✅ Update payment methods
     - ✅ Cancel subscriptions
     - ✅ View invoices
     - ✅ Update billing address
   - Set cancellation policy: "Cancel immediately"
   - Save configuration

2. **Webhook Configuration** (will complete after server setup):
   - Go to Developers > Webhooks
   - Will add endpoint later: `https://your-domain.com/webhooks/stripe`
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`

---

## Step 2: Environment Configuration

### 2.1 Update Environment Config Package

**Important**: Follow the existing environment pattern instead of introducing zod schemas.

Update `packages/env-config/src/types.ts`:

```typescript
// Add to ServerEnvironmentConfig interface
export interface ServerEnvironmentConfig {
  // ... existing fields ...
  
  // Stripe Configuration
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLISHABLE_KEY: string;
  STRIPE_WEBHOOK_SECRET?: string;
  
  // Stripe Price IDs (populated by setup script)
  STRIPE_PRICE_CRUISER_MONTHLY?: string;
  STRIPE_PRICE_CRUISER_YEARLY?: string;
  STRIPE_PRICE_DRAUGHT_MONTHLY?: string;
  STRIPE_PRICE_DRAUGHT_YEARLY?: string;
}
```

Update `packages/env-config/src/server.ts`:

```typescript
// Add to loadServerEnvironment function
export function loadServerEnvironment(): ServerEnvironmentConfig {
  return {
    // ... existing fields ...
    
    // Stripe Configuration
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    
    // Stripe Price IDs
    STRIPE_PRICE_CRUISER_MONTHLY: process.env.STRIPE_PRICE_CRUISER_MONTHLY,
    STRIPE_PRICE_CRUISER_YEARLY: process.env.STRIPE_PRICE_CRUISER_YEARLY,
    STRIPE_PRICE_DRAUGHT_MONTHLY: process.env.STRIPE_PRICE_DRAUGHT_MONTHLY,
    STRIPE_PRICE_DRAUGHT_YEARLY: process.env.STRIPE_PRICE_DRAUGHT_YEARLY,
  };
}
```

Add validation in `validateEnvironmentVariables()`:

```typescript
// Add to validateEnvironmentVariables function
if (!env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required');
}
if (!env.STRIPE_PUBLISHABLE_KEY) {
  throw new Error('STRIPE_PUBLISHABLE_KEY is required');
}
```

### 2.2 Update .env.example

```bash
# Add to .env.example

# ============================================
# Stripe Configuration
# ============================================
# Get these from https://dashboard.stripe.com/test/apikeys
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Will be set after creating webhook endpoint in Stripe Dashboard
STRIPE_WEBHOOK_SECRET=whsec_...

# Price IDs - will be populated by setup script
STRIPE_PRICE_CRUISER_MONTHLY=
STRIPE_PRICE_CRUISER_YEARLY=
STRIPE_PRICE_DRAUGHT_MONTHLY=
STRIPE_PRICE_DRAUGHT_YEARLY=
```

### 2.3 Update Your Local .env File

```bash
# Add your actual Stripe test keys to .env
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
# Leave webhook secret empty for now
STRIPE_WEBHOOK_SECRET=
```

---

## Step 3: Install Dependencies

### 3.1 Add Stripe to Server Package

```bash
# From root directory
pnpm --filter @starships/server add stripe
# Note: @types/node already exists in the project
```

### 3.2 Add Script Commands

Update `packages/server/package.json`:

```json
{
  "scripts": {
    // ... existing scripts ...
    "stripe:setup": "tsx scripts/setup-stripe.ts",
    "stripe:setup:dev": "NODE_ENV=development tsx scripts/setup-stripe.ts",
    "stripe:listen": "stripe listen --forward-to localhost:4000/webhooks/stripe",
    "stripe:trigger": "stripe trigger checkout.session.completed"
  }
}
```

---

## Step 4: Create Stripe Setup Script

### 4.1 Create the Setup Script

Create `packages/server/scripts/setup-stripe.ts`:

```typescript
import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
});

interface ProductConfig {
  name: string;
  description: string;
  metadata: {
    plan_type: string;
    max_agents: string;
    max_expeditions: string;
  };
}

interface PriceConfig {
  amount: number;
  interval: 'month' | 'year';
  lookup_key: string;
}

const PRODUCTS: Record<string, ProductConfig> = {
  cruiser: {
    name: 'Cruiser Starship',
    description: 'Advanced starship with enhanced capabilities for growing teams',
    metadata: {
      plan_type: 'cruiser',
      max_agents: '10',
      max_expeditions: '5',
    },
  },
  draught: {
    name: 'Draught Starship',
    description: 'Enterprise-grade starship with unlimited potential',
    metadata: {
      plan_type: 'draught',
      max_agents: 'unlimited',
      max_expeditions: 'unlimited',
    },
  },
};

const PRICES: Record<string, PriceConfig> = {
  cruiser_monthly: {
    amount: 3000, // $30.00
    interval: 'month',
    lookup_key: 'cruiser_monthly',
  },
  cruiser_yearly: {
    amount: 36000, // $360.00
    interval: 'year',
    lookup_key: 'cruiser_yearly',
  },
  draught_monthly: {
    amount: 10000, // $100.00
    interval: 'month',
    lookup_key: 'draught_monthly',
  },
  draught_yearly: {
    amount: 120000, // $1,200.00
    interval: 'year',
    lookup_key: 'draught_yearly',
  },
};

async function setupStripe() {
  console.log('🚀 Starting Stripe setup...\n');
  
  const priceIds: Record<string, string> = {};
  
  try {
    // First, check if products already exist
    console.log('📦 Checking existing products...');
    const existingProducts = await stripe.products.list({ limit: 100 });
    
    for (const [key, config] of Object.entries(PRODUCTS)) {
      let product = existingProducts.data.find(
        p => p.metadata.plan_type === config.metadata.plan_type
      );
      
      if (product) {
        console.log(`✅ Product already exists: ${product.name} (${product.id})`);
      } else {
        console.log(`📝 Creating product: ${config.name}`);
        product = await stripe.products.create(config);
        console.log(`✅ Created product: ${product.name} (${product.id})`);
      }
      
      // Check/Create prices for this product
      const existingPrices = await stripe.prices.list({
        product: product.id,
        limit: 100,
      });
      
      // Monthly price
      const monthlyKey = `${key}_monthly`;
      const monthlyConfig = PRICES[monthlyKey];
      let monthlyPrice = existingPrices.data.find(
        p => p.recurring?.interval === 'month'
      );
      
      if (monthlyPrice) {
        console.log(`  💵 Monthly price exists: $${monthlyPrice.unit_amount! / 100}/month (${monthlyPrice.id})`);
      } else {
        console.log(`  📝 Creating monthly price: $${monthlyConfig.amount / 100}/month`);
        monthlyPrice = await stripe.prices.create({
          product: product.id,
          unit_amount: monthlyConfig.amount,
          currency: 'usd',
          recurring: { interval: monthlyConfig.interval },
          lookup_key: monthlyConfig.lookup_key,
        });
        console.log(`  ✅ Created monthly price: ${monthlyPrice.id}`);
      }
      priceIds[`STRIPE_PRICE_${key.toUpperCase()}_MONTHLY`] = monthlyPrice.id;
      
      // Yearly price
      const yearlyKey = `${key}_yearly`;
      const yearlyConfig = PRICES[yearlyKey];
      let yearlyPrice = existingPrices.data.find(
        p => p.recurring?.interval === 'year'
      );
      
      if (yearlyPrice) {
        console.log(`  💵 Yearly price exists: $${yearlyPrice.unit_amount! / 100}/year (${yearlyPrice.id})`);
      } else {
        console.log(`  📝 Creating yearly price: $${yearlyConfig.amount / 100}/year`);
        yearlyPrice = await stripe.prices.create({
          product: product.id,
          unit_amount: yearlyConfig.amount,
          currency: 'usd',
          recurring: { interval: yearlyConfig.interval },
          lookup_key: yearlyConfig.lookup_key,
        });
        console.log(`  ✅ Created yearly price: ${yearlyPrice.id}`);
      }
      priceIds[`STRIPE_PRICE_${key.toUpperCase()}_YEARLY`] = yearlyPrice.id;
      
      console.log('');
    }
    
    // Update .env file with price IDs
    console.log('\n📄 Updating .env file with price IDs...');
    const envPath = path.resolve(__dirname, '../../../.env');
    let envContent = fs.readFileSync(envPath, 'utf-8');
    
    for (const [key, value] of Object.entries(priceIds)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Updated .env file with price IDs');
    
    // Display summary
    console.log('\n' + '='.repeat(60));
    console.log('✨ Stripe setup completed successfully!');
    console.log('='.repeat(60));
    console.log('\n📋 Summary:');
    console.log('  Products created: 2 (Cruiser, Draught)');
    console.log('  Prices created: 4 (2 monthly, 2 yearly)');
    console.log('\n💡 Next steps:');
    console.log('  1. Set up webhook endpoint in Stripe Dashboard');
    console.log('  2. Add STRIPE_WEBHOOK_SECRET to .env');
    console.log('  3. Run database migrations');
    console.log('  4. Start implementing subscription service');
    console.log('\n🔑 Price IDs have been saved to .env:');
    for (const [key, value] of Object.entries(priceIds)) {
      console.log(`  ${key}=${value}`);
    }
    
  } catch (error) {
    console.error('\n❌ Error during setup:', error);
    process.exit(1);
  }
}

// Run the setup
setupStripe().catch(console.error);
```

---

## Step 5: Database Schema Updates

### 5.1 Update Type Definitions

**CRITICAL**: This step resolves a key blocker identified in the codebase analysis.

Update `packages/models/src/types.ts`:

```typescript
// Extend the existing User interface
export interface User {
  id: string;
  kindeId?: string;
  username: string;
  email?: string;
  displayName?: string;
  avatar?: string;
  createdAt: string;
  // NEW: Stripe integration
  stripeCustomerId?: string;  // Stripe customer ID
}

// Update the existing Starship interface  
export interface Starship {
  id: string;
  slug: string;
  ownerId: string;
  class: 'scout' | 'cruiser' | 'draught';  // ADD: 'draught' plan
  name: string;
  maxActiveExpeditions: number;
  maxAgents: number;
  status: 'active' | 'inactive' | 'restricted' | 'disabled';  // ADD: billing status
  createdAt: string;
  updatedAt: string;
  // NEW: Stripe integration
  subscriptionId?: string;     // Stripe subscription ID
  plan?: 'scout' | 'cruiser' | 'draught';  // Separate from class for billing
  billingPeriod?: 'monthly' | 'yearly';  // Billing period
}
```

**Note**: We maintain both `class` (for starship type) and `plan` (for billing) to ensure backward compatibility.

### 5.1.1 **CRITICAL**: Update StarshipRepository Validation

**Blocker Fix**: The current StarshipRepository validation will reject 'draught' starships. Update `packages/models/src/repositories/StarshipRepository.ts`:

```typescript
// REPLACE this validation method (around line 44):
private validateStarshipClass(starshipClass: Starship['class']): void {
  const validClasses: Starship['class'][] = ['scout', 'cruiser', 'draught']; // ADD 'draught'
  if (!validClasses.includes(starshipClass)) {
    throw new ValidationError(
      `Starship class must be one of: ${validClasses.join(', ')}. Got: ${starshipClass}`,
      'class'
    );
  }
}

// ALSO UPDATE status validation method (around line 57):
private validateStarshipStatus(status: Starship['status']): void {
  const validStatuses: Starship['status'][] = ['active', 'inactive', 'restricted', 'disabled']; // ADD billing statuses
  if (!validStatuses.includes(status)) {
    throw new ValidationError(
      `Starship status must be one of: ${validStatuses.join(', ')}. Got: ${status}`,
      'status'
    );
  }
}
```

### 5.2 Create Database Migration

Create `packages/models/src/migrations/011_stripe_integration.cypher` (following existing migration pattern):

```cypher
// Migration: Add Stripe fields to User and Starship nodes
// Version: 011
// Date: 2025-01-10
// Description: Add Stripe customer ID to users and subscription fields to starships

// Add stripeCustomerId to all existing Users
MATCH (u:User)
WHERE NOT EXISTS(u.stripeCustomerId)
SET u.stripeCustomerId = null;

// Add subscription fields to all existing Starships
MATCH (s:Starship)
WHERE NOT EXISTS(s.subscriptionId)
SET s.subscriptionId = null,
    s.plan = CASE 
        WHEN s.class = 'scout' THEN 'scout'
        WHEN s.class = 'cruiser' THEN 'cruiser'
        ELSE 'scout'
    END,
    s.billingPeriod = null;

// No need to modify status field - keep existing 'active'/'inactive' values
// 'restricted' and 'disabled' will be set by webhook events

// Create indexes for better query performance
CREATE INDEX starship_subscription_id IF NOT EXISTS FOR (s:Starship) ON (s.subscriptionId);
CREATE INDEX user_stripe_customer_id IF NOT EXISTS FOR (u:User) ON (u.stripeCustomerId);
```

### 5.3 Update Repository Methods

**Follow existing repository patterns** found in the codebase analysis.

Update `packages/models/src/repositories/UserRepository.ts`:

```typescript
// Add these methods to the existing UserRepository class

async findByStripeCustomerId(stripeCustomerId: string): Promise<User | null> {
  try {
    const connection = getConnection();
    const result = await connection.executeQuery<{ user: User }>(
      `MATCH (user:User {stripeCustomerId: $stripeCustomerId})
       RETURN user`,
      { stripeCustomerId }
    );
    
    return result[0]?.user || null;
  } catch (error) {
    throw error;
  }
}

async updateStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void> {
  try {
    const connection = getConnection();
    await connection.executeWrite(
      `MATCH (user:User {id: $userId})
       SET user.stripeCustomerId = $stripeCustomerId`,
      { userId, stripeCustomerId }
    );
  } catch (error) {
    throw error;
  }
}
```

Update `packages/models/src/repositories/StarshipRepository.ts`:

```typescript
// Add these methods to the existing StarshipRepository class

async findBySubscriptionId(subscriptionId: string): Promise<Starship | null> {
  try {
    const connection = getConnection();
    const result = await connection.executeQuery<{ starship: Starship }>(
      `MATCH (starship:Starship {subscriptionId: $subscriptionId})
       RETURN starship`,
      { subscriptionId }
    );
    
    return result[0]?.starship || null;
  } catch (error) {
    throw error;
  }
}

async updateSubscription(
  starshipId: string, 
  updates: {
    subscriptionId?: string;
    status?: 'active' | 'inactive' | 'restricted' | 'disabled';
    plan?: 'scout' | 'cruiser' | 'draught';
    billingPeriod?: 'monthly' | 'yearly';
  }
): Promise<void> {
  try {
    const connection = getConnection();
    const setClause = Object.entries(updates)
      .map(([key]) => `starship.${key} = $${key}`)
      .join(', ');
      
    await connection.executeWrite(
      `MATCH (starship:Starship {id: $starshipId})
       SET ${setClause}, starship.updatedAt = $timestamp`,
      { starshipId, ...updates, timestamp: new Date().toISOString() }
    );
  } catch (error) {
    throw error;
  }
}

async countFreeStarships(userId: string): Promise<number> {
  try {
    const connection = getConnection();
    const result = await connection.executeQuery<{ count: number }>(
      `MATCH (user:User {id: $userId})-[:OWNS]->(starship:Starship {plan: 'scout'})
       RETURN count(starship) as count`,
      { userId }
    );
    
    return result[0]?.count || 0;
  } catch (error) {
    throw error;
  }
}
```

---

## Step 6: Run Setup Script

### 6.1 Execute the Setup Script

```bash
# From root directory
cd packages/server
pnpm run stripe:setup:dev
```

Expected output:
```
🚀 Starting Stripe setup...

📦 Checking existing products...
📝 Creating product: Cruiser Starship
✅ Created product: Cruiser Starship (prod_xxx)
  📝 Creating monthly price: $30/month
  ✅ Created monthly price: price_xxx
  📝 Creating yearly price: $360/year
  ✅ Created yearly price: price_xxx

📝 Creating product: Draught Starship
✅ Created product: Draught Starship (prod_xxx)
  📝 Creating monthly price: $100/month
  ✅ Created monthly price: price_xxx
  📝 Creating yearly price: $1200/year
  ✅ Created yearly price: price_xxx

📄 Updating .env file with price IDs...
✅ Updated .env file with price IDs

✨ Stripe setup completed successfully!
```

### 6.2 Verify in Stripe Dashboard

1. Go to https://dashboard.stripe.com/test/products
2. Verify you see:
   - Cruiser Starship product with 2 prices
   - Draught Starship product with 2 prices
3. Check that prices have correct amounts and intervals

---

## Step 7: Configure Webhooks

### 7.1 Local Development Setup

For local development, use Stripe CLI:

```bash
# Install Stripe CLI (if not already installed)
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Start webhook forwarding (in a separate terminal)
stripe listen --forward-to localhost:4000/webhooks/stripe
```

Copy the webhook signing secret displayed (starts with `whsec_`) and add to your `.env`:

```bash
STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE
```

### 7.2 Production Webhook Setup

1. Go to Stripe Dashboard > Developers > Webhooks
2. Click "Add endpoint"
3. Enter endpoint URL: `https://your-domain.com/webhooks/stripe`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Click "Add endpoint"
6. Copy the signing secret and add to production environment

---

## Step 8: Run Database Migration

### 8.1 Execute Migration

Based on codebase analysis, execute the migration manually:

```bash
# Method 1: Using Neo4j Browser (Recommended)
# 1. Open Neo4j Browser at http://localhost:7474
# 2. Copy contents of packages/models/src/migrations/011_stripe_integration.cypher
# 3. Paste and execute in Neo4j Browser

# Method 2: Using existing migration pattern
# Check if project has a migration runner in packages/models/src/
# If migration scripts exist, follow that pattern
```

### 8.2 Verify Migration

Run in Neo4j Browser to verify:

```cypher
// Check User nodes have stripeCustomerId
MATCH (u:User)
RETURN u.id, u.email, u.stripeCustomerId
LIMIT 5;

// Check Starship nodes have subscription fields
MATCH (s:Starship)
RETURN s.id, s.name, s.plan, s.subscriptionId, s.status, s.billingPeriod
LIMIT 5;
```

---

## Step 9: Validation Checklist

### Environment Setup
- [ ] Stripe account created and verified
- [ ] Test API keys added to `.env`
- [ ] Environment config package updated
- [ ] Stripe SDK installed

### Stripe Dashboard
- [ ] Products created (Cruiser, Draught)
- [ ] Prices created (4 total)
- [ ] Price IDs saved to `.env`
- [ ] Customer portal configured
- [ ] Webhook endpoint configured (local or production)

### Database
- [ ] Type definitions updated
- [ ] Migration script created
- [ ] Migration executed successfully
- [ ] Repository methods added
- [ ] Indexes created

### Testing
- [ ] Setup script runs without errors
- [ ] Products visible in Stripe Dashboard
- [ ] Environment variables properly set
- [ ] Database schema updated correctly

---

## Next Steps

With Phase 1 complete, you're ready to move to Phase 2:

1. **Implement Subscription Service** (`packages/server/src/services/SubscriptionService.ts`)
2. **Create Webhook Handler** (`packages/server/src/routes/webhooks.ts`)
3. **Extend API Routes** (`packages/server/src/routes/starships.ts`)
4. **Add Access Control Middleware** (`packages/server/src/middleware/starship-access.ts`)

## Troubleshooting

### Common Issues

1. **Stripe API Key Invalid**
   - Ensure you're using test keys (start with `sk_test_` and `pk_test_`)
   - Check that keys are properly copied without extra spaces

2. **Setup Script Fails**
   - Verify `.env` file exists in root directory
   - Check that `STRIPE_SECRET_KEY` is set
   - Ensure you have internet connection

3. **Database Migration Fails**
   - Verify Neo4j is running
   - Check database connection settings
   - Ensure you have write permissions

4. **Webhook Secret Not Working**
   - Make sure you're using the signing secret, not the endpoint secret
   - For local dev, get the secret from `stripe listen` command output

---

## Security Considerations

1. **Never commit API keys** - Ensure `.env` is in `.gitignore`
2. **Use test mode** during development
3. **Validate webhook signatures** in production
4. **Restrict API endpoints** with authentication
5. **Log all billing events** for audit trail

## ✅ Quick Start Implementation

**IMPORTANT**: Execute in this exact order to avoid blockers:

```bash
# Step 1: FIRST - Fix type definitions (resolves critical blocker)
# Edit packages/models/src/types.ts - add User.stripeCustomerId and Starship billing fields
# Edit packages/models/src/repositories/StarshipRepository.ts - update validation arrays

# Step 2: SECOND - Update environment configuration
# Edit packages/env-config/src/types.ts - add Stripe fields to ServerEnvironmentConfig
# Edit packages/env-config/src/server.ts - add Stripe environment loading

# Step 3: THIRD - Install Stripe dependency
pnpm --filter @starships/server add stripe

# Step 4: Add Stripe keys to .env
echo "STRIPE_SECRET_KEY=sk_test_YOUR_KEY" >> .env
echo "STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY" >> .env

# Step 5: Create and run setup script
cd packages/server
# First create the script file as shown in Step 4 of plan
pnpm run stripe:setup:dev

# Step 6: Run database migration  
# Execute 011_stripe_integration.cypher in Neo4j Browser
```

**⚠️ Critical**: Steps 1-2 MUST be completed first or subsequent steps will fail with TypeScript/validation errors.

## 🚀 Ready for Phase 2

With Phase 1 complete, proceed to:
1. **Subscription Service** (`packages/server/src/services/SubscriptionService.ts`)
2. **Webhook Handler** (`packages/server/src/routes/webhooks.ts`) 
3. **API Route Extensions** (`packages/server/src/routes/starships.ts`)
4. **Access Control Middleware** (`packages/server/src/middleware/starship-access.ts`)

---

**Phase 1 Status**: ✅ **COMPLETED**

All tasks have been successfully implemented:

### ✅ Completed Tasks:
1. **Type Definitions Updated** - `packages/models/src/types.ts` updated with User.stripeCustomerId and Starship billing fields
2. **Repository Validation Fixed** - StarshipRepository now supports 'draught' class and billing statuses 
3. **Environment Configuration** - packages/env-config updated with Stripe configuration support
4. **Dependencies Installed** - Stripe SDK v18.4.0 installed in server package
5. **Setup Script Created** - `packages/server/scripts/setup-stripe.ts` with product and price creation
6. **Package Scripts Added** - npm run stripe:setup, stripe:setup:dev, stripe:listen, stripe:trigger
7. **Database Migration Created** - `packages/models/src/migrations/011_stripe_integration.cypher` 
8. **Repository Methods Added** - UserRepository and StarshipRepository with Stripe integration methods
9. **Environment Example Updated** - .env.example includes all Stripe configuration variables

### 🚀 Ready for Phase 2 Implementation:
- Subscription Service (`packages/server/src/services/SubscriptionService.ts`)
- Webhook Handler (`packages/server/src/routes/webhooks.ts`) 
- API Route Extensions (`packages/server/src/routes/starships.ts`)
- Access Control Middleware (`packages/server/src/middleware/starship-access.ts`)

**Phase 1 Status**: ✅ All blockers identified and resolved. Implementation ready to proceed following existing codebase patterns.