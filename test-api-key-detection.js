/**
 * Test script to validate API key detection logic
 * This will help us confirm the diagnosis without needing full authentication
 */

// Mock connector data that matches what we see in the screenshot
const mockStripeConnector = {
  id: 'stripe-connector',
  name: 'Stripe',
  command: 'npx',
  args: [],
  env: '{"STRIPE_API_KEY": "your-stripe-api-key-here"}', // This is likely the format
};

const mockBraveConnector = {
  id: 'brave-search-connector',
  name: 'Brave Search',
  command: 'npx',
  args: [],
  env: '{"BRAVE_API_KEY": "your-brave-api-key-here"}', // This is likely the format
};

// Alternative format with placeholders (what our detection logic expects)
const mockStripeConnectorWithPlaceholders = {
  id: 'stripe-connector-placeholders',
  name: 'Stripe',
  command: 'npx',
  args: [],
  env: '{"STRIPE_API_KEY": "${STRIPE_API_KEY}"}', // This format should work
};

// Import the detection logic (we'll need to adjust the path)
console.log('Testing API Key Detection Logic...\n');

// Test 1: Current format (likely what's causing the issue)
console.log('=== Test 1: Current Format (Plain Values) ===');
console.log('Stripe Connector:', JSON.stringify(mockStripeConnector, null, 2));
console.log('Expected: Should NOT detect requirements (no placeholders)');

// Test 2: Expected format (what should work)
console.log('\n=== Test 2: Expected Format (With Placeholders) ===');
console.log('Stripe Connector:', JSON.stringify(mockStripeConnectorWithPlaceholders, null, 2));
console.log('Expected: Should detect STRIPE_API_KEY requirement');

// Test 3: Check the patterns we're looking for
console.log('\n=== Test 3: Pattern Analysis ===');
const testString1 = '{"STRIPE_API_KEY": "your-stripe-api-key-here"}';
const testString2 = '{"STRIPE_API_KEY": "${STRIPE_API_KEY}"}';

console.log('String 1 (plain value):', testString1);
console.log('String 2 (placeholder):', testString2);

// Test the regex patterns
const patterns = [/\$\{([A-Z_]+_API_KEY)\}/g, /\$\{([A-Z_]+_TOKEN)\}/g, /\$\{([A-Z_]+_SECRET)\}/g];

patterns.forEach((pattern, index) => {
  console.log(`\nPattern ${index + 1}: ${pattern}`);
  console.log('Matches in string 1:', [...testString1.matchAll(pattern)]);
  console.log('Matches in string 2:', [...testString2.matchAll(pattern)]);
});

console.log('\n=== Diagnosis ===');
console.log('The issue is likely that the connector environment variables are stored as:');
console.log('{"STRIPE_API_KEY": "your-stripe-api-key-here"}');
console.log('But our detection logic expects:');
console.log('{"STRIPE_API_KEY": "${STRIPE_API_KEY}"}');
console.log('\nThis explains why the API key modal is not opening!');
