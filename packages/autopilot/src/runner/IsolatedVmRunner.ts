/**
 * Isolated VM Runner
 *
 * NOTE: This is the initial scaffolding for running the entire Engine execution
 * inside an isolated-vm context. Fully wiring module loading inside an isolate
 * requires providing a bundled single-file build of @starships/autopilot or a
 * custom module loader bridge. To keep things lean, we surface a clear error
 * until a bundle path is provided.
 */

import type { Blueprint, Execution, ExecutionItem } from '@/types';
import type { EngineConfig } from '@/engine/Engine';
import type { AutopilotEvent } from '@/types/events';
import type { Runner } from './Runner';
import { createRequire } from 'node:module';

/**
 * Minimal type surface for isolated-vm usage to avoid broad `any` types.
 */
type IsolateContext = {
  global: {
    set: (name: string, value: unknown, opts?: { copy?: boolean }) => Promise<void>;
  };
};

type Script = {
  run: (context: unknown, opts?: { timeout?: number }) => Promise<unknown>;
};

type IsolateInstance = {
  createContext: () => Promise<IsolateContext>;
  compileScript: (code: string) => Promise<Script>;
};

type IvmReference = {
  applyIgnored: (receiver?: unknown, args?: unknown[], opts?: { arguments?: { copy?: boolean } }) => void;
};

type IvmModule = {
  Isolate: new (opts: { memoryLimit: number }) => IsolateInstance;
  Reference: new (fn: (evt: unknown) => unknown) => IvmReference;
};

export interface IsolatedVmRunnerOptions {
  /**
   * Memory limit for the isolate in MB (default: 64)
   */
  memoryLimitMB?: number;
  /**
   * Optional path to a single-file bundled build of @starships/autopilot that can be
   * evaluated inside the isolate. When provided, the runner will attempt to load and
   * execute the Engine entirely in the isolate using this bundle.
   */
  bundlePath?: string;
  /**
   * Optional execution timeout (ms) for the isolate's script.
   */
  timeoutMs?: number;
}

export class IsolatedVmRunner implements Runner {
  private options: IsolatedVmRunnerOptions;

  constructor(options?: IsolatedVmRunnerOptions) {
    this.options = {
      memoryLimitMB: 64,
      ...options,
    };
  }

  async run(blueprint: Blueprint, execution: Execution, config?: EngineConfig): Promise<ExecutionItem[]> {
    // Attempt to load isolated-vm dynamically to keep it optional
    let ivm: IvmModule | undefined;
    try {
      // Prefer dynamic import (works in ESM/CJS with TS transpilation)
      const moduleName = 'isolated' + '-vm';
      ivm = (await import(moduleName)) as unknown as IvmModule;
    } catch (err1) {
      // Fallback to CJS require via createRequire for environments where import() fails
      try {
        const rr = createRequire(__filename);
        const mod = rr('isolated-vm');
        ivm = mod as IvmModule;
      } catch (err2) {
        const m1 = err1 instanceof Error ? err1.message : String(err1);
        const m2 = err2 instanceof Error ? err2.message : String(err2);
        throw new Error(
          `isolated-vm load failed. First import() error: ${m1}. Fallback require() error: ${m2}. Ensure isolated-vm@6.0.1 is installed and built.`
        );
      }
    }
    if (!ivm) {
      throw new Error('isolated-vm could not be loaded (unknown error).');
    }

    // If no bundlePath provided, attempt to resolve published subpath export
    if (!this.options.bundlePath) {
      try {
        const rr = createRequire(__filename);
        this.options.bundlePath = rr.resolve('@starships/autopilot/isolated');
      } catch {
        throw new Error(
          'IsolatedVmRunner requires a single-file bundle of @starships/autopilot. ' +
            'Unable to resolve "@starships/autopilot/isolated". Ensure the Autopilot build emitted the isolated bundle ' +
            '(dist/autopilot.isolated.js) or pass options.bundlePath explicitly.'
        );
      }
    }

    const fs = await import('node:fs/promises');
    const source = await fs.readFile(this.options.bundlePath, 'utf8');

    // Create an isolate with the specified memory limit
    const memoryLimitMB = Number(this.options.memoryLimitMB ?? 64);
    const isolate = new ivm.Isolate({ memoryLimit: memoryLimitMB });

    // Create a context within this isolate.
    const context = await isolate.createContext();

    // Get a Reference to the global object within the context.
    const jail = context.global;

    // Expose a minimal console for debugging (no-op if not desired)
    await jail.set(
      'console',
      {
        log: (...args: unknown[]) => {
          // Mark args as used to satisfy no-unused-vars
          void args.length;
        },
        error: (...args: unknown[]) => {
          void args.length;
        },
      },
      { copy: true }
    );

    // Bridge event callback to host if provided
    if (config?.eventCallback) {
      const eventRef = new ivm.Reference((evt: unknown) => {
        const cb = config.eventCallback!;
        // fire-and-forget to avoid blocking the isolate
        Promise.resolve(cb(evt as AutopilotEvent)).catch(() => {});
      });
      await jail.set('__EVENT_REF__', eventRef);
    }

    // Inject serialized data for blueprint/execution/config into the isolate's global scope.
    // Note: Functions (like eventCallback) cannot be copied into the isolate. Strip them for now.
    const safeConfig = config ? { ...config, eventCallback: undefined } : undefined;
    await jail.set('ENGINE_INPUT', { blueprint, execution, config: safeConfig }, { copy: true });

    // The bundle is expected to expose a global function:
    //   globalThis.__autopilot_run_engine__(ENGINE_INPUT): Promise<ExecutionItem[]>
    // which performs:
    //   const { Engine } = require('@starships/autopilot');
    //   return new Engine(config).executeBlueprint(blueprint, execution);
    //
    // This avoids leaking host objects into the isolate.
    const bootstrap = `
      (async () => {
        // Evaluate the provided bundle which must register globalThis.__autopilot_run_engine__
        ${source}
        if (typeof globalThis.__autopilot_run_engine__ !== 'function') {
          throw new Error('Bundle did not define globalThis.__autopilot_run_engine__');
        }
        const input = globalThis.ENGINE_INPUT;
        const hostRef = globalThis.__EVENT_REF__;
        if (hostRef) {
          const bridged = (e) => hostRef.applyIgnored(undefined, [e], { arguments: { copy: true } });
          input.config = Object.assign({}, input.config, { eventCallback: bridged });
        }
        const result = await globalThis.__autopilot_run_engine__(input);
        // Return result to host
        result;
      })();
    `;

    const script = await isolate.compileScript(bootstrap);
    const result = await script.run(context, {
      timeout: this.options.timeoutMs ?? 0, // 0 = no timeout
    });

    // The result is plain data (ExecutionItem[]) copied from isolate
    return result as ExecutionItem[];
  }
}
