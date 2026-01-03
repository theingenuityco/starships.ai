import type { NextFunction } from 'express';
import { SignJWT } from 'jose';

jest.mock('@/services/UserService', () => ({
  UserService: {
    getUserById: jest.fn(),
  },
}));

import { optionalJwtAuth } from '@/middleware/jwt-auth';
import { UserService } from '@/services/UserService';
import { sendError } from '@/utils/responseHelpers';

const mockSendError = sendError as jest.MockedFunction<typeof sendError>;

const createMockReq = (authorization?: string): any => ({
  headers: authorization ? { authorization } : {},
});

const createMockRes = (): any => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

describe('optionalJwtAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows requests with no token (anonymous)', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = jest.fn();

    await optionalJwtAuth(req as any, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
    expect(mockSendError).not.toHaveBeenCalled();
  });

  it('attaches user when token is valid', async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only');
    const token = await new SignJWT({ agentId: 'agent-1', starshipId: 'ship-1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('starships.ai')
      .setAudience('starships-users')
      .setSubject('user123')
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(secret);

    (UserService.getUserById as jest.Mock).mockResolvedValue({ id: 'user123' });

    const req = createMockReq(`Bearer ${token}`);
    const res = createMockRes();
    const next: NextFunction = jest.fn();

    await optionalJwtAuth(req as any, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(UserService.getUserById).toHaveBeenCalledWith('user123');
    expect(req.user).toEqual({ id: 'user123' });
    expect((req as any).authContext).toEqual({ userId: 'user123', agentId: 'agent-1', starshipId: 'ship-1' });
    expect(mockSendError).not.toHaveBeenCalled();
  });
});


