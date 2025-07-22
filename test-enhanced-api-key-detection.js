/**
 * Test script to validate the enhanced API key detection logic
 */

// Mock the enhanced detection logic
class MockConnectorApiKeyManager {
  static isApiKeyEnvironmentVariable(envKey) {
    const key = envKey.toUpperCase();
    const apiKeyPatterns = [
      'API_KEY',
      'TOKEN',
      'SECRET',
      'ACCESS_TOKEN',
      'AUTH_TOKEN',
      'BEARER_TOKEN',
      'CLIENT_SECRET',
      'PRIVATE_KEY',
      'CONNECTION_STRING',
      'DATABASE_URL',
      '_URL',
      '_ENDPOINT',
      '_KEY',
      '_ID',
    ];

    return apiKeyPatterns.some((pattern) => key.includes(pattern));
  }

  static detectRequirements(template) {
    const requirements = [];
    const foundKeys = new Set();

    if (template.env) {
      try {
        const envVars = JSON.parse(template.env);

        for (const [key, value] of Object.entries(envVars)) {
          if (typeof value === 'string') {
            // Method 1: Check for placeholder patterns (existing logic)
            const placeholderRegex = /\$\{([A-Z_]+)\}/g;
            const placeholders = [...value.matchAll(placeholderRegex)].map((match) => match[1]);

            for (const placeholder of placeholders) {
              if (!foundKeys.has(placeholder)) {
                foundKeys.add(placeholder);
                requirements.push({ envKey: placeholder, source: 'placeholder' });
              }
            }

            // Method 2: Check if the environment variable key itself looks like an API key requirement
            if (this.isApiKeyEnvironmentVariable(key) && !foundKeys.has(key)) {
              foundKeys.add(key);
              requirements.push({ envKey: key, source: 'env_var_name' });
            }
          }
        }
      } catch (error) {
        console.warn('Failed to parse environment variables:', error);
      }
    }

    return requirements;
  }
}

// Test cases
const testCases = [
  {
    name: 'Stripe Connector (Plain Values)',
    connector: {
      id: 'stripe-connector',
      name: 'Stripe',
      env: '{"STRIPE_API_KEY": "your-stripe-api-key-here"}',
    },
    expected: ['STRIPE_API_KEY'],
  },
  {
    name: 'Brave Search Connector (Plain Values)',
    connector: {
      id: 'brave-search-connector',
      name: 'Brave Search',
      env: '{"BRAVE_API_KEY": "your-brave-api-key-here"}',
    },
    expected: ['BRAVE_API_KEY'],
  },
  {
    name: 'Connector with Placeholders',
    connector: {
      id: 'placeholder-connector',
      name: 'Placeholder Test',
      env: '{"SOME_API_KEY": "${SOME_API_KEY}"}',
    },
    expected: ['SOME_API_KEY'], // Should detect from placeholder, not duplicate from env var name
  },
  {
    name: 'Mixed Connector',
    connector: {
      id: 'mixed-connector',
      name: 'Mixed Test',
      env: '{"GITHUB_TOKEN": "${GITHUB_TOKEN}", "OPENAI_API_KEY": "your-key-here", "DATABASE_URL": "postgres://..."}',
    },
    expected: ['GITHUB_TOKEN', 'OPENAI_API_KEY', 'DATABASE_URL'],
  },
  {
    name: 'No API Keys Required',
    connector: {
      id: 'no-keys-connector',
      name: 'No Keys Test',
      env: '{"PORT": "3000", "NODE_ENV": "production"}',
    },
    expected: [],
  },
];

console.log('=== Enhanced API Key Detection Test ===\n');

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log('Connector env:', testCase.connector.env);

  const detected = MockConnectorApiKeyManager.detectRequirements(testCase.connector);
  const detectedKeys = detected.map((r) => r.envKey);

  console.log('Expected:', testCase.expected);
  console.log('Detected:', detectedKeys);
  console.log('Details:', detected);

  const success = JSON.stringify(detectedKeys.sort()) === JSON.stringify(testCase.expected.sort());
  console.log('Result:', success ? '✅ PASS' : '❌ FAIL');
  console.log('---');
});

console.log('\n=== Summary ===');
console.log('The enhanced detection logic should now detect API key requirements from:');
console.log('1. Placeholder patterns: ${STRIPE_API_KEY}');
console.log('2. Environment variable names: STRIPE_API_KEY, BRAVE_API_KEY, etc.');
console.log('This should fix the issue where users cannot enter API keys!');
