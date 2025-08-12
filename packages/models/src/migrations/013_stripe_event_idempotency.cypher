// Migration: Create StripeEvent node type for webhook idempotency
// Version: 013
// Date: 2025-08-12
// Description: Prevent duplicate webhook processing

// Create unique constraint to prevent duplicate event processing
CREATE CONSTRAINT stripe_event_unique IF NOT EXISTS
FOR (e:StripeEvent) REQUIRE e.eventId IS UNIQUE;

// Create index for timestamp queries
CREATE INDEX stripe_event_processed IF NOT EXISTS
FOR (e:StripeEvent) ON (e.processedAt);

// Create index for event type filtering
CREATE INDEX stripe_event_type IF NOT EXISTS
FOR (e:StripeEvent) ON (e.eventType);