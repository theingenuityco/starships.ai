import { Code } from '@/nodes/Code';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import type { NodeHandlerOptions } from '@/types/node-handler';

describe('Code Node - module-style main(ctx)', () => {
  test('executes async main(ctx) and returns result', async () => {
    const params = {
      code: `
        async function main(ctx) {
          const input = ctx.input || {};
          return { sum: (input.a || 0) + (input.b || 0) };
        }
      `,
      timeout: 1000,
    };
    const node = new Code(params, {} as NodeHandlerOptions);
    const out = await node.execute(ExecutionItemUtils.wrapSingle({ a: 1, b: 2 }));
    const json = ExecutionItemUtils.unwrapSingle(out) as Record<string, unknown>;
    expect(json).toEqual({ sum: 3 });
  });

  test('validation fails when main is missing', () => {
    const node = new Code(
      {
        code: `function notMain() { return 1; }`,
      },
      {} as NodeHandlerOptions
    );
    const validation = node.validate();
    expect(validation.valid).toBe(false);
    expect(validation.errors?.some((e) => e.message.includes('Missing required entrypoint'))).toBe(true);
  });

  test('validation blocks dangerous patterns (require)', () => {
    const node = new Code(
      {
        code: `async function main(ctx) { return require('fs'); }`,
      },
      {} as NodeHandlerOptions
    );
    const validation = node.validate();
    expect(validation.valid).toBe(false);
  });

  test('times out on long-running main', async () => {
    const node = new Code(
      {
        code: `
          async function main(ctx) {
            await new Promise(() => {});
          }
        `,
        timeout: 200,
      },
      {} as NodeHandlerOptions
    );
    await expect(node.execute(ExecutionItemUtils.wrapSingle({}))).rejects.toThrow('timeout');
  });

  test('globals JSON/Math/Date are available', async () => {
    const node = new Code(
      {
        code: `
          async function main(ctx) {
            return {
              m: Math.max(1, 2),
              j: JSON.parse('{"a":1}').a,
              d: new Date().constructor.name
            };
          }
        `,
        timeout: 1000,
      },
      {} as NodeHandlerOptions
    );
    const out = await node.execute(ExecutionItemUtils.wrapSingle({}));
    const json = ExecutionItemUtils.unwrapSingle(out) as Record<string, unknown>;
    expect(json.m).toBe(2);
    expect(json.j).toBe(1);
    expect(json.d).toBe('Date');
  });

  test('validation blocks timers usage', () => {
    const node = new Code(
      {
        code: `
          async function main(ctx) {
            setTimeout(() => {}, 0);
            return 1;
          }
        `,
        timeout: 1000,
      },
      {} as NodeHandlerOptions
    );
    const validation = node.validate();
    expect(validation.valid).toBe(false);
  });

  test('ctx.lastOutputOf returns prior node output json', async () => {
    const exec = ExecutionItemUtils.createExecution();
    exec.results.push({
      nodeRef: 'prev_node',
      items: ExecutionItemUtils.wrapSingle({ answer: 42 }),
    });

    const node = new Code(
      {
        code: `
          async function main(ctx) {
            const last = ctx.lastOutputOf('prev_node');
            return { answer: last && typeof last === 'object' ? last.answer : null };
          }
        `,
        timeout: 1000,
      },
      { execution: exec } as NodeHandlerOptions
    );

    const out = await node.execute(ExecutionItemUtils.wrapSingle({}));
    const json = ExecutionItemUtils.unwrapSingle(out) as Record<string, unknown>;
    expect(json.answer).toBe(42);
  });
});


