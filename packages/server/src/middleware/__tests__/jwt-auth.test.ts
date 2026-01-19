import type { NextFunction, Request, Response } from 'express';

jest.mock('@/services/UserService', () => ({
  UserService: {
    getUserById: jest.fn(),
  },
}));

import { optionalJwtAuth } from '@/middleware/jwt-auth';
import { UserService } from '@/services/UserService';

const createMockReq = (authorization?: string): Request => {
  const headers: Request['headers'] = authorization ? { authorization } : {};
  return { headers } as unknown as Request;
};

type MockRes = {
  status: jest.Mock<Response, [number]>;
  json: jest.Mock<Response, [unknown]>;
};

const createMockRes = (): MockRes => {
  const res: MockRes = {
    status: jest.fn<Response, [number]>(),
    json: jest.fn<Response, [unknown]>(),
  };
  res.status.mockImplementation(() => res as unknown as Response);
  res.json.mockImplementation(() => res as unknown as Response);
  return res;
};

describe('optionalJwtAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows requests with no token (anonymous)', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = jest.fn();

    await optionalJwtAuth(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
  });

  it('attaches user when token is valid', async () => {
    const { SignJWT } = await (new Function('m', 'return import(m)') as (m: string) => Promise<typeof import('jose')>)('jose');
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || '');
    const token = await new SignJWT({ agentId: 'agent-1', starshipId: 'ship-1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer('starships.ai')
      .setAudience('starships-users')
      .setSubject('user123')
      .setExpirationTime('2h')
      .sign(secret);

    jest.mocked(UserService.getUserById).mockResolvedValue({
      id: 'user123',
      createdAt: new Date().toISOString(),
      onboardingCompleted: false,
      hasPassword: false,
      authMethods: ['password'],
      primaryAuthMethod: 'password',
    });

    const req = createMockReq(`Bearer ${token}`);
    const res = createMockRes();
    const next: NextFunction = jest.fn();

    await optionalJwtAuth(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(UserService.getUserById).toHaveBeenCalledWith('user123');
    expect(req.user?.id).toBe('user123');
    expect(req.authContext).toEqual({ userId: 'user123', agentId: 'agent-1', starshipId: 'ship-1' });
  });
});
