'use strict';

/**
 * Child process entry for executing Autopilot Engine via IPC.
 * This file is bundled/copied to dist/scripts/child-entry.js during build.
 *
 * Protocol:
 * Parent sends:
 *   { type: 'start', payload: { blueprint, execution, config, autopilotCredentials } }
 *
 * Child responds with:
 *   { type: 'event', event }
 *   { type: 'done', result }
 *   { type: 'error', error: { message, stack } }
 */

// Ensure fetch is available and network issues are handled
// This helps with SSL/TLS issues in child processes
if (typeof globalThis.fetch === 'undefined') {
  console.log('[child-entry] fetch not available, something is wrong with Node.js version');
}

// Test network connectivity on startup
const dns = require('dns');
const https = require('https');

// Quick DNS test
dns.lookup('openrouter.ai', (err, address) => {
  if (err) {
    console.error('[child-entry] DNS lookup failed for openrouter.ai:', err.message);
  } else {
    console.log('[child-entry] DNS resolved openrouter.ai to:', address);
  }
});

// Event buffering to prevent race conditions with early events
let isParentReady = false;
let eventBuffer = [];

function safeSend(msg) {
  try {
    if (process.send) {
      // Buffer events until parent is ready, except for critical messages
      if (!isParentReady && msg.type === 'event') {
        eventBuffer.push(msg);
        return;
      }
      process.send(msg);
    }
  } catch (e) {
    // ignore send errors (parent may have exited)
  }
}

function flushEventBuffer() {
  if (eventBuffer.length > 0) {
    // Send all buffered events
    eventBuffer.forEach((bufferedEvent) => {
      try {
        if (process.send) process.send(bufferedEvent);
      } catch (e) {
        // ignore send errors
      }
    });
    eventBuffer = [];
  }
}

process.on('message', async (msg) => {
  if (!msg || typeof msg !== 'object') return;

  // Handle parent ready signal
  if (msg.type === 'parent_ready') {
    isParentReady = true;
    flushEventBuffer();
    return;
  }

  if (msg.type !== 'start') return;
  const payload = msg.payload || {};
  const blueprint = payload.blueprint;
  const execution = payload.execution;
  const config = payload.config || {};
  const autopilotCredentials = payload.autopilotCredentials || undefined;

  try {
    // Optional: set credentials if provided
    try {
      const mod = require('../Autopilot.js');
      const autopilot = mod && (mod.autopilot || (mod.default && mod.default.autopilot));
      if (autopilot && typeof autopilot.setCredentials === 'function' && autopilotCredentials) {
        autopilot.setCredentials(autopilotCredentials);
      }
    } catch (_e) {
      // ignore if Autopilot manager is not available
    }

    const { Engine } = require('../engine/Engine.js');

    // Bridge event callback to parent
    const bridgedConfig = Object.assign({}, config, {
      eventCallback: async (event) => {
        safeSend({ type: 'event', event });
      },
    });

    const engine = new Engine(bridgedConfig);
    const result = await engine.executeBlueprint(blueprint, execution);

    safeSend({ type: 'done', result });
  } catch (err) {
    const errorPayload = {
      message: err && err.message ? String(err.message) : String(err),
      stack: err && err.stack ? String(err.stack) : undefined,
    };
    safeSend({ type: 'error', error: errorPayload });
  }
});

// Improve robustness: forward top-level errors
process.on('uncaughtException', (err) => {
  safeSend({
    type: 'error',
    error: {
      message: err && err.message ? String(err.message) : 'uncaughtException',
      stack: err && err.stack ? String(err.stack) : undefined,
    },
  });
});
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  safeSend({
    type: 'error',
    error: { message: err.message, stack: err.stack },
  });
});

// Exit cleanly on parent disconnect
process.on('disconnect', () => {
  try {
    process.exit(0);
  } catch (_e) {
    // ignore
  }
});
