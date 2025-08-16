// Migration: Add stripeCustomerId to Starship nodes
// Version: 012
// Date: 2025-08-12
// Description: Add Stripe customer ID to starships for portal access

// Add stripeCustomerId field to all existing Starships
MATCH (s:Starship)
WHERE s.stripeCustomerId IS NULL
SET s.stripeCustomerId = null;

// Create index for faster Customer ID lookups
CREATE INDEX starship_stripe_customer IF NOT EXISTS
FOR (s:Starship) ON (s.stripeCustomerId);