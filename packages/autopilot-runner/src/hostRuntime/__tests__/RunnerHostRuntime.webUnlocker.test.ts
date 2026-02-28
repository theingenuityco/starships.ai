// Important: RunnerHostRuntime imports `CancelledError` from `@starships/autopilot`.
// The compiled Autopilot bundle pulls in some ESM-only deps (e.g. nanoid) that
// Jest (CJS) won't transform by default. We only need `CancelledError` at runtime
// for these tests, so we mock it to avoid importing the whole package.
jest.mock(
  '@starships/autopilot',
  () => {
  class CancelledError extends Error {
    constructor(message = 'cancelled') {
      super(message);
      this.name = 'CancelledError';
    }
  }
  return { CancelledError };
  },
  { virtual: true }
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createRunnerHostRuntime } = require('../RunnerHostRuntime') as typeof import('../RunnerHostRuntime');

type MockResponseInit = {
  status?: number;
  statusText?: string;
  url?: string;
  headers?: Record<string, string>;
  json?: unknown;
  text?: string;
};

const makeHeaders = (headers: Record<string, string>) => {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers || {})) lower[k.toLowerCase()] = v;
  return {
    get(name: string) {
      return lower[String(name || '').toLowerCase()] ?? null;
    },
    forEach(cb: (value: string, key: string) => void) {
      for (const [k, v] of Object.entries(lower)) cb(v, k);
    },
  };
};

const makeResponse = (init: MockResponseInit) => {
  const status = typeof init.status === 'number' ? init.status : 200;
  const statusText = typeof init.statusText === 'string' ? init.statusText : status === 200 ? 'OK' : 'Error';
  const url = typeof init.url === 'string' ? init.url : '';
  const headers = makeHeaders(init.headers ?? {});
  const jsonVal = init.json;
  const textVal = typeof init.text === 'string' ? init.text : typeof jsonVal === 'string' ? jsonVal : JSON.stringify(jsonVal ?? '');
  return {
    status,
    statusText,
    url,
    headers,
    async json() {
      return jsonVal;
    },
    async text() {
      return textVal;
    },
    async arrayBuffer() {
      return new ArrayBuffer(0);
    },
  } as unknown as Response;
};

describe('RunnerHostRuntime Web Unlocker', () => {
  const envSnapshot = { ...process.env };
  const fetchSnapshot = (globalThis as unknown as { fetch?: unknown }).fetch;

  afterEach(() => {
    process.env = { ...envSnapshot };
    Object.defineProperty(globalThis, 'fetch', {
      value: fetchSnapshot,
      writable: true,
      configurable: true,
    });
  });

  it('uses direct fetch when useWebUnlocker is not set', async () => {
    const fetchMock = jest.fn(async () =>
      makeResponse({
        status: 200,
        statusText: 'OK',
        url: 'https://example.com',
        headers: { 'content-type': 'application/json' },
        json: { ok: true },
      })
    );
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, writable: true, configurable: true });

    const rt = createRunnerHostRuntime();
    await rt.http({ method: 'GET', url: 'https://example.com' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        method: 'GET',
      })
    );
  });

  it('routes through Bright Data when useWebUnlocker=true', async () => {
    process.env.BRIGHTDATA_API_KEY = 'test-key';
    process.env.BRIGHTDATA_ZONE = 'test-zone';

    const fetchMock = jest.fn(async (_url: string, _init: RequestInit) =>
      makeResponse({
        status: 200,
        statusText: 'OK',
        url: 'https://api.brightdata.com/request',
        headers: { 'content-type': 'application/json' },
        json: {
          result: '<html>ok</html>',
          headers: { 'content-type': 'text/html; charset=utf-8' },
          url: 'https://example.com',
        },
      })
    );
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, writable: true, configurable: true });

    const rt = createRunnerHostRuntime();
    const resp = await rt.http({
      method: 'GET',
      url: 'https://example.com',
      headers: { 'user-agent': 'StarshipsTest/1.0' },
      useWebUnlocker: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.brightdata.com/request',
      expect.objectContaining({
        method: 'POST',
      })
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body ?? '{}'));
    expect(payload).toEqual(
      expect.objectContaining({
        zone: 'test-zone',
        url: 'https://example.com',
        format: 'raw',
        method: 'GET',
      })
    );
    expect(payload.headers).toEqual(expect.objectContaining({ 'user-agent': 'StarshipsTest/1.0' }));

    expect(resp.status).toBe(200);
    expect(resp.body).toBe('<html>ok</html>');
    expect((resp.headers as Record<string, unknown>)['content-type']).toContain('text/html');
    expect(resp.url).toBe('https://example.com');
  });

  it('parses JSON result when target content-type is application/json', async () => {
    process.env.BRIGHTDATA_API_KEY = 'test-key';
    process.env.BRIGHTDATA_ZONE = 'test-zone';

    const fetchMock = jest.fn(async () =>
      makeResponse({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        json: {
          result: '{"a":1}',
          headers: { 'content-type': 'application/json' },
          url: 'https://example.com/json',
        },
      })
    );
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, writable: true, configurable: true });

    const rt = createRunnerHostRuntime();
    const resp = await rt.http({ method: 'GET', url: 'https://example.com/json', useWebUnlocker: true });
    expect(resp.body).toEqual({ a: 1 });
  });
});

