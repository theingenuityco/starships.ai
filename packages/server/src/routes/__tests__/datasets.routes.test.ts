import type { Request, Response } from 'express';
import datasetsRouter from '@/routes/datasets';

type MockRes = {
  status: jest.Mock<Response, [number]>;
  json: jest.Mock<Response, [unknown]>;
};

function createMockRes(): MockRes {
  const res: MockRes = {
    status: jest.fn<Response, [number]>(),
    json: jest.fn<Response, [unknown]>(),
  };
  res.status.mockImplementation(() => res as unknown as Response);
  res.json.mockImplementation(() => res as unknown as Response);
  return res;
}

function getHandler(path: string): (req: Request, res: Response) => Promise<void> {
  const layer = (datasetsRouter as any).stack.find((l: any) => l?.route?.path === path);
  if (!layer) throw new Error(`Route not found: ${path}`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

describe('datasets routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /starships/:starshipId/datasets returns 401 when req.user missing', async () => {
    const handler = getHandler('/starships/:starshipId/datasets');
    const req = { params: { starshipId: 'aaaaaaaaaa' } } as unknown as Request;
    const res = createMockRes();

    await handler(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('POST /starships/:starshipId/datasets returns 401 when req.user missing', async () => {
    const handler = getHandler('/starships/:starshipId/datasets');
    const req = { params: { starshipId: 'aaaaaaaaaa' }, body: {} } as unknown as Request;
    const res = createMockRes();

    await handler(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

