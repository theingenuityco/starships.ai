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

// Event buffering to prevent race conditions with early events
let isParentReady = false;
let eventBuffer = [];

// HostRuntime HTTP bridging
let nextHttpRequestId = 1;
const pendingHttpRequests = new Map();

// Sanitize objects before sending over IPC: remove functions and non-cloneable values.
// This prevents host_http requests from getting stuck when parameters accidentally
// contain runtime helpers (for example, (path) => this.extractPath(inputData, path)).
function sanitizeForIpc(value, depth = 0) {
  if (depth > 8) return undefined;
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'function') {
    return undefined;
  }
  if (t !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeForIpc(v, depth + 1));
  }
  const out = {};
  for (const key of Object.keys(value)) {
    const v = value[key];
    if (typeof v === 'function') continue;
    out[key] = sanitizeForIpc(v, depth + 1);
  }
  return out;
}

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
    // Log send errors to help diagnose stuck host_http requests (e.g., IPC channel closed).
    // eslint-disable-next-line no-console
    console.error('[autopilot:child] safeSend error', e);
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

function createHostRuntimeBridge() {
  return {
    http: (request) =>
      new Promise((resolve, reject) => {
        const id = nextHttpRequestId++;
        pendingHttpRequests.set(id, { resolve, reject });
        const safeRequest = sanitizeForIpc(request);
        // Debug trace for outbound host HTTP requests from the child process.
        console.log('[autopilot:child] host_http -> parent', {
          id,
          method: safeRequest && safeRequest.method,
          url: safeRequest && safeRequest.url,
          connector: safeRequest && safeRequest.connector,
        });
        safeSend({ type: 'host_http', id, request: safeRequest });
      }),
  };
}

process.on('message', async (msg) => {
  if (!msg || typeof msg !== 'object') return;

  // Handle parent ready signal
  if (msg.type === 'parent_ready') {
    isParentReady = true;
    flushEventBuffer();
    return;
  }

  // Handle HostRuntime HTTP results from parent
  if (msg.type === 'host_http_result') {
    const entry = pendingHttpRequests.get(msg.id);
    if (!entry) {
      // eslint-disable-next-line no-console
      console.warn('[autopilot:child] host_http_result with unknown id', { id: msg.id });
      return;
    }
    pendingHttpRequests.delete(msg.id);
    if (msg.error) {
      // eslint-disable-next-line no-console
      console.error('[autopilot:child] host_http_result error', { id: msg.id, error: msg.error });
      entry.reject(new Error(String(msg.error)));
    } else {
      // eslint-disable-next-line no-console
      console.log('[autopilot:child] host_http_result ok', { id: msg.id });
      entry.resolve(msg.response);
    }
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

    // Bridge event callback to parent and hostRuntime HTTP via IPC
    const bridgedConfig = Object.assign({}, config, {
      eventCallback: async (event) => {
        safeSend({ type: 'event', event });
      },
      hostRuntime: createHostRuntimeBridge(),
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

// Handle SIGTERM gracefully to allow parent to cancel work
process.on('SIGTERM', () => {
  try {
    // Exit cleanly; Engine work will be interrupted
    process.exit(0);
  } catch (_e) {
    try {
      process.exit(1);
    } catch {}
  }
});
