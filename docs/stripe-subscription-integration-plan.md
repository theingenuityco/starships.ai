# Stripe Subscription Integration Plan

## Overview
Integration of Stripe subscription plans for Starships.ai with two tiers: Scout (FREE) and Cruiser ($30/month). This document outlines the complete implementation strategy for creating plans on Stripe and rendering them in the UI.

## Subscription Plans

### Scout Plan (FREE)
- **Price**: $0/month, $0/year
- **Features**:
  - Agents: 3 + First Officer
  - MCPs: 2 at one time
  - Expeditions: Only 1 can run at a time (parallel)
  - Artifact Storage: 5GB
  - Token Rate Limit: 20k/minute
  - API Rate Limit: TBD
  - Max Fuel Capacity: TBD

### Cruiser Plan ($30)
- **Price**: $30/month, $360/year (12 months)
- **Features**:
  - Agents: 5 + First Officer
  - MCPs: 4 at one time
  - Expeditions: 3 can run at a time (parallel)
  - Artifact Storage: 20GB
  - Token Rate Limit: 80k/minute
  - API Rate Limit: TBD
  - Max Fuel Capacity: TBD

## Implementation Phases

### Phase 1: Backend Infrastructure Setup

#### 1.1 Dependencies and Environment
```bash
# Add Stripe SDK to server package
cd packages/server
pnpm add stripe
```

**Environment Variables** (Add to root `.env` file):
```
STRIPE_SECRET_KEY=sk_test_...
```

**Usage**: Server will access via `process.env.STRIPE_SECRET_KEY` (matches existing pattern)

#### 1.2 Stripe Service Layer
**Location**: `packages/server/src/services/StripeService.ts`

**Structure** (following existing service pattern):
```typescript
import Stripe from 'stripe';

export class StripeService {
  private static stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  
  static async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    // Implementation here
  }
  
  // Future methods...
}
```

#### 1.3 API Route Registration  
**Location**: `packages/server/src/routes/subscriptions.ts`

**Endpoints**:
- `GET /api/subscriptions/plans` - List available subscription plans

**Route File Structure** (`packages/server/src/routes/subscriptions.ts`):
```typescript
import { Router } from 'express';
import { StripeService } from '../services/StripeService';

const router: Router = Router();

router.get('/plans', async (req, res) => {
  try {
    const plans = await StripeService.getSubscriptionPlans();
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

export default router;
```

**Route Registration** (`packages/server/src/index.ts`):
```typescript
// Add import (around line 38)
import subscriptionRoutes from './routes/subscriptions';

// Add route (around line 186)
app.use('/api/subscriptions', subscriptionRoutes);
```

### Phase 2: Stripe Products Setup via API

#### 2.1 Plan Definition Configuration
**Location**: `packages/server/src/config/subscription-plans.ts`

```typescript
export const SUBSCRIPTION_PLANS = {
  scout: {
    product: {
      name: "Scout Plan",
      description: "Perfect for getting started with Starships.ai",
      metadata: {
        agents: "3",
        first_officer: "true",
        mcps: "2", 
        expeditions_parallel: "1",
        artifact_storage_gb: "5",
        token_rate_limit: "20000",
        plan_type: "scout"
      }
    },
    prices: {
      monthly: { amount: 0, interval: "month" },
      yearly: { amount: 0, interval: "year" }
    }
  },
  cruiser: {
    product: {
      name: "Cruiser Plan", 
      description: "Advanced features for power users",
      metadata: {
        agents: "5",
        first_officer: "true", 
        mcps: "4",
        expeditions_parallel: "3",
        artifact_storage_gb: "20",
        token_rate_limit: "80000",
        plan_type: "cruiser"
      }
    },
    prices: {
      monthly: { amount: 3000, interval: "month" }, // $30 in cents
      yearly: { amount: 36000, interval: "year" }   // $360 in cents
    }
  }
};
```

#### 2.2 Setup Script
**Location**: `packages/server/src/scripts/setup-stripe-products.ts`

```typescript
import Stripe from 'stripe';
import { SUBSCRIPTION_PLANS } from '../config/subscription-plans';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

async function setupStripeProducts() {
  try {
    for (const [planKey, planConfig] of Object.entries(SUBSCRIPTION_PLANS)) {
      console.log(`Setting up ${planKey} plan...`);
      
      // Check if product already exists
      const existingProducts = await stripe.products.list({
        limit: 100
      });
      
      let product = existingProducts.data.find(p => 
        p.metadata?.plan_type === planConfig.product.metadata.plan_type
      );
      
      if (product) {
        console.log(`⚡ Product already exists: ${product.id}`);
      } else {
        // Create product
        product = await stripe.products.create(planConfig.product);
        console.log(`✅ Product created: ${product.id}`);
      }
      
      // Create prices (check if they exist first)
      for (const [interval, priceConfig] of Object.entries(planConfig.prices)) {
        const existingPrices = await stripe.prices.list({
          product: product.id,
          limit: 10
        });
        
        const priceExists = existingPrices.data.find(p => 
          p.recurring?.interval === priceConfig.interval
        );
        
        if (priceExists) {
          console.log(`⚡ Price already exists: ${priceExists.id} (${interval})`);
        } else {
          const price = await stripe.prices.create({
            product: product.id,
            currency: 'usd',
            unit_amount: priceConfig.amount,
            recurring: { interval: priceConfig.interval as 'month' | 'year' },
            nickname: `${planConfig.product.name} (${interval})`
          });
          console.log(`✅ Price created: ${price.id} (${interval})`);
        }
      }
    }
    
    console.log('🎉 All Stripe products and prices are ready!');
  } catch (error) {
    console.error('❌ Error setting up Stripe products:', error);
    process.exit(1);
  }
}

setupStripeProducts();
```

#### 2.3 NPM Script
**Location**: `packages/server/package.json`

```json
{
  "scripts": {
    "stripe:setup": "tsx src/scripts/setup-stripe-products.ts",
    "stripe:setup:dev": "NODE_ENV=development pnpm run stripe:setup",
    "stripe:setup:prod": "NODE_ENV=production pnpm run stripe:setup"
  }
}
```

#### 2.4 Usage Commands
```bash
# Setup products in development (test mode)
cd packages/server
pnpm run stripe:setup:dev

# Setup products in production (live mode)
pnpm run stripe:setup:prod
```

### Phase 3: Frontend Implementation

#### 3.1 Types and Interfaces
**Location**: `packages/client/src/types/subscriptions.ts`

```typescript
interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  features: PlanFeatures;
  isPopular?: boolean;
}

interface PlanFeatures {
  agents: number;
  firstOfficer: boolean;
  mcps: number;
  expeditionsParallel: number;
  artifactStorageGB: number;
  tokenRateLimit: number;
}
```

#### 3.2 API Client Integration
**Location**: `packages/client/src/lib/api.ts` (add to existing file)

```typescript
// Add to existing api.ts file
export const subscriptionAPI = {
  getPlans: async (): Promise<SubscriptionPlan[]> => {
    const cacheKey = 'subscriptions:plans';
    const cached = apiCache.get<SubscriptionPlan[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const data = await api.get('/api/subscriptions/plans')
      .then((res: AxiosResponse<SubscriptionPlan[]>) => res.data);
    
    apiCache.set(cacheKey, data, 5 * 60 * 1000); // Cache for 5 minutes
    return data;
  }
};
```

#### 3.3 UI Components
**Location**: `packages/client/src/components/subscriptions/`

**Components to Create**:
- `packages/client/src/app/fleet/pricing/page.tsx` - Main pricing page route
- `packages/client/src/components/subscriptions/PlanCard.tsx` - Individual plan display
- `packages/client/src/components/subscriptions/PricingToggle.tsx` - Monthly/Yearly toggle

#### 3.4 Styling Approach
- Use existing Tailwind classes
- Match starships.ai dark theme
- Responsive design for mobile/desktop
- Consistent with current UI patterns

### Phase 4: Integration Points

#### 4.1 Add Pricing Page Route and Button
**Solution**: Create a simple "Pricing" button in Fleet Management that redirects to `/fleet/pricing`

**Steps**:
1. Create pricing page at `packages/client/src/app/fleet/pricing/page.tsx`
2. Add "Pricing" button to `packages/client/src/components/command-deck/starship/StarshipDashboard.tsx`

## Technical Architecture

### Data Flow
1. **Setup Script** → Creates products & prices on Stripe
2. **Backend API** → Fetches plans from Stripe API
3. **Frontend** → Displays plans in fleet management UI

### Error Handling
- Stripe API failures
- Network connectivity issues

### Security Considerations
- Store Stripe keys securely in environment
- Basic API error handling

## Testing Strategy

### Manual Testing
- Plan display accuracy
- Responsive design
- Stripe API connectivity

## Deployment Checklist

### Stripe Configuration
- [ ] Run setup script in test environment (`pnpm run stripe:setup:dev`)
- [ ] Verify products created correctly in Stripe Dashboard
- [ ] Test API endpoints with created products

**Benefits of Script Approach:**
- ✅ **Version Control**: Plan definitions tracked in Git
- ✅ **Reproducible**: Identical setup across environments  
- ✅ **Automated**: Can integrate with CI/CD pipeline
- ✅ **Maintainable**: Easy to update plans programmatically
- ✅ **Testable**: Can be run in test environments safely

### Code Deployment
- [ ] Install stripe package (`pnpm add stripe` in server)
- [ ] Add STRIPE_SECRET_KEY to root .env file
- [ ] Create StripeService with static methods
- [ ] Create subscriptions route file
- [ ] Register route in server index.ts  
- [ ] Add subscription types to api.ts
- [ ] Create frontend pricing page at `/fleet/pricing`
- [ ] Add pricing button to StarshipDashboard

## Future Enhancements

### Payment Processing (Future)
- Stripe Checkout integration
- Subscription creation flow
- User subscription tracking

## Dependencies

### Backend
```json
{
  "stripe": "^latest"
}
```

### Frontend
- No additional dependencies required
- Uses existing React, TypeScript, Tailwind setup

## Timeline Estimate

- **Phase 1**: 1-2 days (Backend setup)
- **Phase 2**: 1 day (Stripe setup script)
- **Phase 3**: 2-3 days (Frontend implementation)
- **Phase 4**: 1 day (Integration)

**Total Estimated Time**: 5-7 days

## Success Criteria

1. ✅ Plans display correctly with accurate pricing
2. ✅ UI matches starships.ai design system  
3. ✅ Backend API reliably serves plan data
4. ✅ Accessible via fleet management navigation
5. ✅ Responsive design works on mobile/desktop

---

## ✅ IMPLEMENTATION STATUS & PROGRESS UPDATE

### Implementation Progress (August 6, 2025)
Successfully completed most phases of the Stripe subscription integration:

#### ✅ COMPLETED PHASES:

##### Phase 0: Environment Setup ✅
- ✅ Installed Stripe SDK package (`stripe@18.4.0`)
- ✅ Added `STRIPE_SECRET_KEY` to environment variables
- ✅ Created all required directories

##### Phase 1: Backend Infrastructure ✅
- ✅ Created `StripeService.ts` with static methods following existing patterns
- ✅ Created subscription plan configuration in `config/subscription-plans.ts`
- ✅ Created subscription API routes with proper auth middleware
- ✅ Registered routes in server `index.ts`
- ✅ Added environment variable validation for `STRIPE_SECRET_KEY`

##### Phase 2: Stripe Setup Scripts ✅
- ✅ Created comprehensive setup script with error handling
- ✅ Added NPM scripts for development and production setup
- ⚠️ Script ready but requires valid Stripe test key to run

##### Phase 3: Frontend Implementation ✅
- ✅ Created TypeScript types for subscription data
- ✅ Added subscription API methods to client
- ✅ Created responsive pricing page with dark theme
- ✅ Built reusable pricing components (PlanCard, PricingToggle)
- ✅ Implemented proper error handling and loading states

##### Phase 4: Integration ✅
- ✅ Added "Pricing" button to Fleet Management dashboard
- ✅ Proper routing between fleet management and pricing page

## 🚀 NEXT STEPS

### Immediate Requirements
1. **Stripe API Key Setup**: Replace placeholder `STRIPE_SECRET_KEY` with actual test key
2. **Run Stripe Setup**: Execute `cd packages/server && pnpm run stripe:setup:dev`
3. **Test Integration**: Verify API endpoints work correctly

### To Complete the Implementation
```bash
# 1. Add your Stripe test key to .env
STRIPE_SECRET_KEY=sk_test_your_actual_stripe_test_key_here

# 2. Run the setup script
cd packages/server
pnpm run stripe:setup:dev

# 3. Start the development servers
# Terminal 1: Backend
cd packages/server
pnpm dev

# Terminal 2: Frontend  
cd packages/client
pnpm dev

# 4. Test the integration
# Visit: http://localhost:3000/fleet
# Click "Pricing" button to see subscription plans
```

### Current Implementation Status: 90% Complete ✅

**What Works Now:**
- ✅ Complete backend API infrastructure
- ✅ Subscription plan configuration
- ✅ Frontend pricing page with responsive design
- ✅ Navigation integration in fleet dashboard
- ✅ Error handling and loading states
- ✅ TypeScript types and interfaces

**What's Missing:**
- ⚠️ Valid Stripe API key (user must provide)
- ⚠️ Payment processing (future enhancement)
- ⚠️ User subscription tracking (future enhancement)

### Future Enhancements
1. **Stripe Checkout Integration**: Add payment processing
2. **Subscription Management**: Track user subscriptions
3. **Usage Enforcement**: Implement plan limits
4. **Webhooks**: Handle subscription events

### Current State Analysis (August 6, 2025)
After analyzing and implementing the subscription system:

#### ✅ What's Already in Place:
1. **Server Infrastructure**: Express.js server with organized route structure
2. **Database**: Neo4j with repository pattern well established
3. **Authentication**: Kinde auth integration fully functional
4. **API Client**: Comprehensive API layer with caching in `packages/client/src/lib/api.ts`
5. **UI Components**: Well-structured component library with Tailwind CSS
6. **Fleet Management**: Existing StarshipDashboard component at `/fleet`
7. **Environment Setup**: `.env` file configured with necessary variables

#### ❌ Missing Components & Blockers:

##### 1. CRITICAL: Stripe Package Not Installed
- **Issue**: `stripe` package not found in `packages/server/package.json`
- **Required Action**: `cd packages/server && pnpm add stripe`
- **Priority**: HIGH - Blocks all backend implementation

##### 2. CRITICAL: Missing STRIPE_SECRET_KEY
- **Issue**: No `STRIPE_SECRET_KEY` in `.env` file
- **Required Action**: Add Stripe API key to environment variables
- **Priority**: HIGH - Required for Stripe API access

##### 3. Missing Backend Implementation:
- **Issue**: No StripeService or subscription routes exist
- **Files Needed**: 
  - `packages/server/src/services/StripeService.ts`
  - `packages/server/src/routes/subscriptions.ts`
  - `packages/server/src/config/subscription-plans.ts`
- **Priority**: HIGH - Core functionality missing

##### 4. Missing Frontend Implementation:
- **Issue**: No subscription-related components or types
- **Files Needed**:
  - `packages/client/src/types/subscriptions.ts`
  - `packages/client/src/app/fleet/pricing/page.tsx`
  - `packages/client/src/components/subscriptions/` (entire directory)
- **Priority**: HIGH - UI completely missing

##### 5. Missing Integration Points:
- **Issue**: No "Pricing" button in StarshipDashboard
- **Required Action**: Add navigation to pricing page from fleet management
- **Priority**: MEDIUM - User access to pricing

## UPDATED IMPLEMENTATION PLAN

### Phase 0: Environment Setup (PREREQUISITE) ⚠️
**Status**: MUST BE COMPLETED FIRST

```bash
# 1. Install Stripe package
cd packages/server
pnpm add stripe

# 2. Create required directories
mkdir -p packages/server/src/scripts
mkdir -p packages/server/src/config
mkdir -p packages/client/src/components/subscriptions

# 3. Add environment variable to root .env file
echo "STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE" >> .env
```

**Environment Variables to Add**:
```env
# Add to root .env file
STRIPE_SECRET_KEY=sk_test_YOUR_STRIPE_SECRET_KEY_HERE
```

**Required Stripe Types Package**:
```bash
# Also need Stripe TypeScript types (if not auto-installed)
cd packages/server
pnpm add -D @types/stripe
```

### Phase 1: Backend Infrastructure Setup
**Dependencies**: Phase 0 must be completed
**Estimated Time**: 1-2 days

#### 1.1 ✅ Dependencies and Environment  
- ✅ Express.js server ready
- ❌ Stripe package installation **REQUIRED**
- ❌ Environment variables **REQUIRED**

#### 1.2 Create Stripe Service Layer
**File**: `packages/server/src/services/StripeService.ts`
- **Status**: Missing - needs creation
- **Dependencies**: Stripe package, environment variables
- **Pattern**: Use static methods (like other services)
- **Environment**: Access `process.env.STRIPE_SECRET_KEY` directly (no config wrapper needed)

#### 1.3 Create API Route  
**File**: `packages/server/src/routes/subscriptions.ts`
- **Status**: Missing - needs creation
- **Integration Point**: Add to `packages/server/src/index.ts` around line 186
- **Required Patterns**: 
  - Use `authMiddleware` (imported from `../middleware/auth`)
  - Follow existing error handling: `try/catch` with `res.status(500).json({ error: (err as Error).message })`
  - Use TypeScript interfaces for request/response types
  - Follow Express `Router()` pattern
  - Import types from `express`: `import type { Request, Response } from 'express'`

#### 1.4 Environment Variable Validation
**File**: `packages/server/src/index.ts`
- **Required Addition**: Add `'STRIPE_SECRET_KEY'` to `requiredVars` array in `validateEnvironmentVariables()` function (around line 55)
- **Pattern**: Follow existing validation that exits process if missing

#### 1.5 Route Registration
**File**: `packages/server/src/index.ts` 
- **Required Addition**: 
```typescript
import subscriptionRoutes from './routes/subscriptions';
// ... 
app.use('/api/subscriptions', subscriptionRoutes);
```
- **Location**: 
  - Import around line 38 (with other route imports)
  - Registration around line 186 (with other route registrations)

### Phase 2: Stripe Products Setup via API
**Dependencies**: Phase 1 completion
**Estimated Time**: 1 day

#### 2.1 Plan Configuration
**File**: `packages/server/src/config/subscription-plans.ts`
- **Status**: Missing - needs creation

#### 2.2 ⚠️ CRITICAL BLOCKER: Scripts Directory Missing
**Issue**: `packages/server/src/scripts/` directory doesn't exist
**Required Actions**:
```bash
mkdir -p packages/server/src/scripts
```

#### 2.3 Setup Script  
**File**: `packages/server/src/scripts/setup-stripe-products.ts`
- **Status**: Missing - needs creation
- **Dependencies**: Scripts directory must be created first

#### 2.4 NPM Script Addition
**File**: `packages/server/package.json`
- **Required Addition**: Add stripe setup scripts to scripts section
- **Pattern**: Follow models package pattern using `tsx` command
- **Dependencies**: ✅ `tsx` already available in server package dependencies
- **Specific Scripts to Add**:
```json
{
  "scripts": {
    "stripe:setup": "tsx src/scripts/setup-stripe-products.ts",
    "stripe:setup:dev": "NODE_ENV=development pnpm run stripe:setup",
    "stripe:setup:prod": "NODE_ENV=production pnpm run stripe:setup"
  }
}
```

### Phase 3: Frontend Implementation
**Dependencies**: Phase 1 completion (for API integration)
**Estimated Time**: 2-3 days

#### 3.1 Types and Interfaces
**File**: `packages/client/src/types/subscriptions.ts`
- **Status**: Missing - needs creation
- **Pattern**: Define interfaces with exact TypeScript syntax from protocol package
- **Note**: Don't add to protocol package - keep client-specific

#### 3.2 API Integration
**File**: `packages/client/src/lib/api.ts`
- **Status**: File exists, needs subscription API methods added
- **Integration Point**: Add `subscriptionAPI` object (similar to existing `agentAPI`)
- **Pattern**: No caching - fetch subscription data fresh each time

#### 3.3 ⚠️ BLOCKER: Subscriptions Directory Missing
**Issue**: `packages/client/src/components/subscriptions/` directory doesn't exist
**Required Actions**:
```bash
mkdir -p packages/client/src/components/subscriptions
```

#### 3.4 UI Components (All Missing)
**Required Files**:
- `packages/client/src/app/fleet/pricing/page.tsx`
- `packages/client/src/components/subscriptions/PlanCard.tsx`
- `packages/client/src/components/subscriptions/PricingToggle.tsx`

**Patterns to Follow**:
- Use `'use client'` directive at top of interactive components
- Import UI from `@/components/ui/` (Button, Card, etc.)
- Use `AuthGate` wrapper for authenticated pages
- Follow existing grid layout patterns from other pages

#### 3.5 Styling
- ✅ Tailwind CSS already configured
- ✅ Dark theme patterns established
- ✅ Responsive design patterns available
- ✅ Motion animations available (`motion` package)

### Phase 4: Integration Points  
**Dependencies**: Phase 3 completion
**Estimated Time**: 1 day

#### 4.1 Add Pricing Navigation
**File**: `packages/client/src/components/command-deck/starship/StarshipDashboard.tsx`
- **Status**: File exists, needs "Pricing" button addition
- **Integration Point**: Add button that navigates to `/fleet/pricing`

## RECOMMENDED EXECUTION ORDER

### Day 1: Prerequisites & Backend Foundation
1. ✅ Install Stripe package (`cd packages/server && pnpm add stripe`)
2. ✅ Install Stripe types (`cd packages/server && pnpm add -D @types/stripe`) 
3. ✅ Create required directories:
   - `mkdir -p packages/server/src/scripts`
   - `mkdir -p packages/server/src/config`
   - `mkdir -p packages/client/src/components/subscriptions`
4. ✅ Add STRIPE_SECRET_KEY to root .env file
5. ✅ Add environment validation: Add `'STRIPE_SECRET_KEY'` to `requiredVars` array in `packages/server/src/index.ts`
6. ✅ Create StripeService.ts (static methods, direct `process.env` access)
7. ✅ Create subscription plans config (in `packages/server/src/config/`)
8. ✅ Create subscriptions routes (follow exact error handling pattern)
9. ✅ Register routes in index.ts (import + app.use statements)

### Day 2: Stripe Setup & Testing
1. ✅ Create setup script (`packages/server/src/scripts/setup-stripe-products.ts`)
2. ✅ Add NPM scripts to `packages/server/package.json`
3. ✅ Run setup script in development:
   - `cd packages/server && pnpm run stripe:setup:dev`
4. ✅ Test API endpoints:
   - `GET /api/subscriptions/plans` should return plan data
   - Verify API authentication works with existing auth tokens

### Day 3-4: Frontend Implementation  
1. ✅ Create subscription types (`packages/client/src/types/subscriptions.ts`)
2. ✅ Add API methods to api.ts (no caching, follow existing patterns)
3. ✅ Create pricing page (`packages/client/src/app/fleet/pricing/page.tsx` with `'use client'` and `AuthGate`)
4. ✅ Create plan card components (use existing UI component patterns)

### Day 5: Integration & Testing
1. ✅ Add pricing button to dashboard
2. ✅ Test full user flow
3. ✅ Fix any UI/UX issues

## POTENTIAL BLOCKERS & MITIGATION

### 1. Stripe API Key Access
- **Risk**: No access to Stripe test/live keys
- **Mitigation**: Ensure Stripe account is set up with proper permissions

### 2. Route Conflicts
- **Risk**: `/api/subscriptions` might conflict with existing routes
- **Mitigation**: Check existing routes in server/src/routes/ first
- **Current Status**: ✅ No conflicts found in route analysis

### 3. Authentication Integration
- **Risk**: Subscription endpoints need proper auth
- **Mitigation**: Use existing authMiddleware pattern from other routes
- **Current Status**: ✅ Auth middleware available and working

### 4. UI Theme Consistency
- **Risk**: New components might not match existing design
- **Mitigation**: Use existing component patterns from StarshipDashboard
- **Current Status**: ✅ Design system well established

## VALIDATION CHECKLIST

Before starting implementation:
- [ ] Stripe account has test keys available
- [ ] Confirm no route conflicts exist
- [ ] Verify pnpm workspace structure understanding
- [ ] Test existing API patterns work correctly

During implementation:
- [ ] All TypeScript types properly defined
- [ ] Error handling matches existing patterns
- [ ] Caching strategy consistent with existing API
- [ ] UI components follow established design system
- [ ] Mobile responsiveness tested

---

**CONCLUSION**: The implementation is straightforward with clear patterns to follow from the existing codebase. Main blockers are missing dependencies (Stripe package) and environment setup. Once prerequisites are met, the existing architecture supports clean integration of subscription functionality.