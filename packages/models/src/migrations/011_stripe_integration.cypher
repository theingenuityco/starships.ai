// Migration: Add Stripe fields to User and Starship nodes
// Version: 011
// Date: 2025-01-10
// Description: Add Stripe customer ID to users and subscription fields to starships

// Add stripeCustomerId to all existing Users
MATCH (u:User)
WHERE u.stripeCustomerId IS NULL
SET u.stripeCustomerId = null;

// Add subscription fields to all existing Starships
MATCH (s:Starship)
WHERE s.subscriptionId IS NULL
SET s.subscriptionId = null,
    s.plan = CASE 
        WHEN s.class = 'scout' THEN 'scout'
        WHEN s.class = 'cruiser' THEN 'cruiser'
        WHEN s.class = 'draught' THEN 'draught'
        ELSE 'scout'
    END,
    s.billingPeriod = null;

// No need to modify status field - keep existing 'active'/'inactive' values
// 'restricted' and 'disabled' will be set by webhook events

// Create indexes for better query performance
CREATE INDEX starship_subscription_id IF NOT EXISTS FOR (s:Starship) ON (s.subscriptionId);
CREATE INDEX user_stripe_customer_id IF NOT EXISTS FOR (u:User) ON (u.stripeCustomerId);