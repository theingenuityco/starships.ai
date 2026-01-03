import type { NextFunction, Request, Response } from 'express';

jest.mock('@/services/UserService', () => ({
  UserService: {
    getUserById: jest.fn(),
  },
}));

jest.mock('@/utils/responseHelpers', () => ({
  sendError: jest.fn(),
}));

jest.mock('jose', () => ({
  jwtVerify: jest.fn(),
}));

import { jwtVerify } from 'jose';
import { optionalJwtAuth } from '@/middleware/jwt-auth';
import { UserService } from '@/services/UserService';
import { sendError } from '@/utils/responseHelpers';

const mockSendError = jest.mocked(sendError);
const mockJwtVerify = jest.mocked(jwtVerify);

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
    expect(mockSendError).not.toHaveBeenCalled();
  });

  it('attaches user when token is valid', async () => {
    const token = 'valid-test-token';

    mockJwtVerify.mockResolvedValue({
      payload: {
        sub: 'user123',
        agentId: 'agent-1',
        starshipId: 'ship-1',
      },
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>);

    const mockedGetUserById = jest.mocked(UserService.getUserById);
    mockedGetUserById.mockResolvedValue({
      id: 'user123',
      createdAt: new Date().toISOString(),
      hasPassword: false,
      authMethods: ['password'],
      primaryAuthMethod: 'password',
    });

    const req = createMockReq(`Bearer ${token}`);
    const res = createMockRes();
    const next: NextFunction = jest.fn();

    await optionalJwtAuth(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(jwtVerify).toHaveBeenCalledTimes(1);
    expect(UserService.getUserById).toHaveBeenCalledWith('user123');
    expect(req.user?.id).toBe('user123');
    expect(req.authContext).toEqual({ userId: 'user123', agentId: 'agent-1', starshipId: 'ship-1' });
    expect(mockSendError).not.toHaveBeenCalled();
  });
});
