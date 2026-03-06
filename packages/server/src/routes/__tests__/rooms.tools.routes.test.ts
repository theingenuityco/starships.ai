import type { Request, Response } from 'express';
import roomsRouter from '@/routes/rooms';

function hasRoute(path: string): boolean {
  return Boolean((roomsRouter as any).stack.find((l: any) => l?.route?.path === path));
}

function getRouteLayer(path: string, method: 'get' | 'post' | 'delete' = 'get'): any {
  const layer = (roomsRouter as any).stack.find((l: any) => l?.route?.path === path && Boolean(l?.route?.methods?.[method]));
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer;
}

function createMockRes() {
  const res = {
    status: jest.fn<Response, [number]>(),
    json: jest.fn<Response, [unknown]>(),
  };
  res.status.mockImplementation(() => res as unknown as Response);
  res.json.mockImplementation(() => res as unknown as Response);
  return res;
}

describe('rooms tool assignment routes', () => {
  it('registers new room tool assignment endpoints', () => {
    expect(hasRoute('/rooms/:roomId/tools')).toBe(true);
    expect(hasRoute('/rooms/:roomId/tools/:toolId')).toBe(true);
    expect(hasRoute('/rooms/:roomId/resources')).toBe(true);
  });

  it('does not register legacy pinned tool endpoints', () => {
    expect(hasRoute('/rooms/:roomId/pins/tools')).toBe(false);
    expect(hasRoute('/rooms/:roomId/pins/tools/reorder')).toBe(false);
    expect(hasRoute('/rooms/:roomId/pins/resources')).toBe(false);
  });

  it('protects room tool mutation routes with auth and rate limiting middleware', () => {
    const postLayer = getRouteLayer('/rooms/:roomId/tools', 'post');
    const deleteLayer = getRouteLayer('/rooms/:roomId/tools/:toolId', 'delete');

    expect(postLayer.route.stack).toHaveLength(3);
    expect(deleteLayer.route.stack).toHaveLength(3);
  });

  it('rejects invalid permission values when assigning a room tool', async () => {
    const postLayer = getRouteLayer('/rooms/:roomId/tools', 'post');
    const handler = postLayer.route.stack[postLayer.route.stack.length - 1].handle as (req: Request, res: Response) => Promise<void>;
    const res = createMockRes();
    const req = {
      user: { id: 'user_1234567' },
      params: { roomId: 'room_1234567' },
      body: { toolId: 'tool_1234567', permission: 'banana' },
    } as unknown as Request;

    await handler(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

