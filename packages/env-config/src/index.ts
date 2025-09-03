export * from './types';
export * from './client';

// Server-only exports with conditional loading
export function getServerConfig() {
  if (typeof window === 'undefined') {
    // Only import server module in Node.js environment
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadServerEnvironment } = require('./server');
    return loadServerEnvironment();
  }
  throw new Error('Server config not available in browser environment');
}

export function loadKindeRuntimeConfig() {
  if (typeof window === 'undefined') {
    // Only import server module in Node.js environment
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadKindeRuntimeConfig } = require('./server');
    return loadKindeRuntimeConfig();
  }
  throw new Error('Kinde runtime config not available in browser environment');
}

export function loadApiRuntimeConfig() {
  if (typeof window === 'undefined') {
    // Only import server module in Node.js environment
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadApiRuntimeConfig } = require('./server');
    return loadApiRuntimeConfig();
  }
  throw new Error('API runtime config not available in browser environment');
}

export function getClientConfig() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadClientEnvironment } = require('./client');
  return loadClientEnvironment();
}

// Legacy exports for backward compatibility
export const loadServerEnvironment = getServerConfig;
export const loadClientEnvironment = getClientConfig;

// Combined config - only available server-side
export function getConfig() {
  if (typeof window === 'undefined') {
    return {
      ...getServerConfig(),
      ...getClientConfig(),
    };
  }
  throw new Error('Combined config not available in browser environment');
}

// Legacy export
export const loadEnvironment = getConfig;
