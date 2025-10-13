'use strict';

// Runner CLI: reads JSON payload from stdin and executes the Engine.
// Emits events to stderr as JSONL: { type: 'event', event }
// Emits final result to stdout as a single JSON line: { ok: true, result } or { ok: false, error }

(async () => {
  try {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    const payload = raw ? JSON.parse(raw) : {};

    const { blueprint, execution, config, autopilotCredentials } = payload || {};

    try {
      const mod = require('../dist/Autopilot.js');
      const autopilot = mod && (mod.autopilot || (mod.default && mod.default.autopilot));
      if (autopilot && typeof autopilot.setCredentials === 'function' && autopilotCredentials) {
        autopilot.setCredentials(autopilotCredentials);
      }
    } catch {}

    const { Engine } = require('../dist/engine/Engine.js');

    const bridgedConfig = Object.assign({}, config, {
      eventCallback: async (event) => {
        try {
          process.stderr.write(JSON.stringify({ type: 'event', event }) + '\n');
        } catch {}
      },
    });

    const engine = new Engine(bridgedConfig);
    const result = await engine.executeBlueprint(blueprint, execution);
    process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
    process.exit(0);
  } catch (err) {
    const message = err && err.message ? String(err.message) : String(err);
    const stack = err && err.stack ? String(err.stack) : undefined;
    process.stdout.write(JSON.stringify({ ok: false, error: { message, stack } }) + '\n');
    process.exit(1);
  }
})();

process.on('uncaughtException', (err) => {
  const message = err && err.message ? String(err.message) : 'uncaughtException';
  const stack = err && err.stack ? String(err.stack) : undefined;
  try { process.stdout.write(JSON.stringify({ ok: false, error: { message, stack } }) + '\n'); } catch {}
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  try { process.stdout.write(JSON.stringify({ ok: false, error: { message: err.message, stack: err.stack } }) + '\n'); } catch {}
  process.exit(1);
});


