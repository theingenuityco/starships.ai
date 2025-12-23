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
