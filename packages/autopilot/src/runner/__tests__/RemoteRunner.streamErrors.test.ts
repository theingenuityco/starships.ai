import { autopilot } from '@/Autopilot';
import { RemoteRunner } from '@/runner/RemoteRunner';
import type { Blueprint, Execution } from '@/types';

function createSseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

describe('RemoteRunner (SSE)', () => {
  beforeEach(() => {
    autopilot.reset();

    globalThis.fetch = jest.fn();
  });

  it('rejects when the runner emits an SSE error event', async () => {
    autopilot.setRunnerConfig({ url: 'http://runner.test' });

    const body = createSseBody([
      // SSE prelude/comment line (runner may send this)
      ':ok\n\n',
      'event: error\n',
      'data: {"error":{"message":"boom"}}\n\n',
    ]);

    const fetchMock = globalThis.fetch as unknown as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      body,
    });

    const runner = new RemoteRunner();
    const blueprint = globalThis.createMockBlueprint() as Blueprint;
    const execution = globalThis.createMockExecution() as Execution;

    await expect(runner.run(blueprint, execution, { eventCallback: jest.fn() })).rejects.toThrow('boom');
  });

  it('preserves error.cause when the runner includes it in SSE error payload', async () => {
    autopilot.setRunnerConfig({ url: 'http://runner.test' });

    const body = createSseBody([
      ':ok\n\n',
      'event: error\n',
      'data: {"error":{"message":"boom","cause":{"status":400,"body":{"success":false,"error":{"code":"VALIDATION_ERROR","message":"bad"}}}}}\n\n',
    ]);

    const fetchMock = globalThis.fetch as unknown as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      body,
    });

    const runner = new RemoteRunner();
    const blueprint = globalThis.createMockBlueprint() as Blueprint;
    const execution = globalThis.createMockExecution() as Execution;

    try {
      await runner.run(blueprint, execution, { eventCallback: jest.fn() });
      throw new Error('expected runner to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      const err = e as unknown as { message?: string; cause?: unknown };
      expect(err.message).toBe('boom');
      expect(err.cause).toMatchObject({ status: 400 });
    }
  });

  it('rejects if the stream ends without a completed event', async () => {
    autopilot.setRunnerConfig({ url: 'http://runner.test' });

    const body = createSseBody([
      ':ok\n\n',
      'event: message\n',
      'data: {"type":"log","data":{"message":"hi"}}\n\n',
      // no completed
    ]);

    const fetchMock = globalThis.fetch as unknown as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      body,
    });

    const runner = new RemoteRunner();
    const blueprint = globalThis.createMockBlueprint() as Blueprint;
    const execution = globalThis.createMockExecution() as Execution;

    await expect(runner.run(blueprint, execution, { eventCallback: jest.fn() })).rejects.toThrow(/ended without a completed result/i);
  });
});

