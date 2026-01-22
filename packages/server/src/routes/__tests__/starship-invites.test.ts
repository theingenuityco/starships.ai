import type { Request, Response } from 'express';

jest.mock('@starships/env', () => ({
  getEnvConfig: () => ({
    PUBLIC_URL: 'https://server.test',
  }),
}));

jest.mock('@/middleware/verify-starship-access', () => ({
  verifyStarshipOwnerAccess: jest.fn(),
}));

jest.mock('@/services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendStarshipInviteEmail: jest.fn(),
  })),
}));

jest.mock('@/services/StarshipService', () => ({
  StarshipService: jest.fn().mockImplementation(() => ({
    getStarship: jest.fn(),
  })),
}));

jest.mock('@starships/models', () => ({
  StarshipInviteTokenRepository: jest.fn(),
  StarshipMemberRepository: jest.fn(),
  UserRepository: jest.fn(),
  getConnection: jest.fn(),
}));

import starshipInvitesRouter from '@/routes/starship-invites';
import { verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
import { EmailService } from '@/services/EmailService';
import { StarshipService } from '@/services/StarshipService';
import { StarshipInviteTokenRepository, StarshipMemberRepository, UserRepository, getConnection } from '@starships/models';

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

function getHandler(path: string, method: 'get' | 'post' | 'delete' | 'patch' = 'get'): (req: Request, res: Response) => Promise<void> {
  const layer = (starshipInvitesRouter as any).stack.find((l: any) => l?.route?.path === path && Boolean(l?.route?.methods?.[method]));
  if (!layer) throw new Error(`Route not found: ${path}`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

describe('starship invite routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /starships/:id/invites creates token and sends email', async () => {
    jest.mocked(verifyStarshipOwnerAccess).mockResolvedValue(true);

    const inviteRepo = {
      cancelOutstandingInvitesForEmail: jest.fn().mockResolvedValue(0),
      generateToken: jest.fn().mockResolvedValue({ token: 't'.repeat(64), expiresAt: new Date().toISOString() }),
    };
    (StarshipInviteTokenRepository as unknown as jest.Mock).mockImplementation(() => inviteRepo);

    const starshipSvc = { getStarship: jest.fn().mockResolvedValue({ id: 'starship_1234', slug: 'ship-1', name: 'Ship 1', ownerId: 'user_1234567' }) };
    (StarshipService as unknown as jest.Mock).mockImplementation(() => starshipSvc);

    const emailSvc = { sendStarshipInviteEmail: jest.fn().mockResolvedValue(undefined) };
    (EmailService as unknown as jest.Mock).mockImplementation(() => emailSvc);

    const req = {
      user: { id: 'user_1234567', email: 'owner@test' },
      params: { id: 'starship_1234' },
      body: { email: 'invitee@test.com' },
    } as unknown as Request;
    const res = createMockRes();

    const handler = getHandler('/starships/:id/invites', 'post');
    await handler(req, res as unknown as Response);

    expect(verifyStarshipOwnerAccess).toHaveBeenCalledWith('starship_1234', 'user_1234567', expect.anything());
    expect(inviteRepo.generateToken).toHaveBeenCalledWith(
      expect.objectContaining({ starshipId: 'starship_1234', invitedEmail: 'invitee@test.com' })
    );
    expect(emailSvc.sendStarshipInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        invitedEmail: 'invitee@test.com',
        starshipName: 'Ship 1',
        inviteUrl: expect.stringContaining('invite='),
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const payload = res.json.mock.calls[0][0] as any;
    expect(payload.success).toBe(true);
    expect(payload.data.ok).toBe(true);
  });

  it('POST /starship-invites/accept adds membership and returns starship', async () => {
    const inviteRepo = {
      validateAndConsumeTokenForEmail: jest.fn().mockResolvedValue({
        starshipId: 'starship_1234',
        invitedEmail: 'invitee@test',
        invitedByUserId: 'user_1234567',
        role: 'collaborator',
      }),
    };
    (StarshipInviteTokenRepository as unknown as jest.Mock).mockImplementation(() => inviteRepo);

    const memberRepo = { createOrIgnoreMember: jest.fn().mockResolvedValue({ created: true }) };
    ;(StarshipMemberRepository as unknown as jest.Mock).mockImplementation(() => memberRepo);

    const starshipSvc = { getStarship: jest.fn().mockResolvedValue({ id: 'starship_1234', slug: 'ship-1', name: 'Ship 1', ownerId: 'user_1234567' }) };
    (StarshipService as unknown as jest.Mock).mockImplementation(() => starshipSvc);

    const req = {
      user: { id: 'u2', email: 'invitee@test' },
      body: { token: 't'.repeat(64) },
    } as unknown as Request;
    const res = createMockRes();

    const handler = getHandler('/starship-invites/accept', 'post');
    await handler(req, res as unknown as Response);

    expect(inviteRepo.validateAndConsumeTokenForEmail).toHaveBeenCalledWith('t'.repeat(64), 'invitee@test');
    expect(memberRepo.createOrIgnoreMember).toHaveBeenCalledWith(
      expect.objectContaining({
        starshipId: 'starship_1234',
        userId: 'u2',
        role: 'collaborator',
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0] as any;
    expect(payload.success).toBe(true);
    expect(payload.data.starship.slug).toBe('ship-1');
  });

  it('POST /starship-invites/preview returns invite context without consuming', async () => {
    const inviteRepo = {
      getValidInviteByToken: jest.fn().mockResolvedValue({
        starshipId: 'starship_1234',
        invitedEmail: 'invitee@test.com',
        invitedByUserId: 'user_owner',
        role: 'collaborator',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      }),
    };
    (StarshipInviteTokenRepository as unknown as jest.Mock).mockImplementation(() => inviteRepo);

    const starshipSvc = { getStarship: jest.fn().mockResolvedValue({ id: 'starship_1234', slug: 'ship-1', name: 'Ship 1', ownerId: 'user_owner' }) };
    (StarshipService as unknown as jest.Mock).mockImplementation(() => starshipSvc);

    const req = {
      body: { token: 't'.repeat(64) },
    } as unknown as Request;
    const res = createMockRes();

    const handler = getHandler('/starship-invites/preview', 'post');
    await handler(req, res as unknown as Response);

    expect(inviteRepo.getValidInviteByToken).toHaveBeenCalledWith('t'.repeat(64));
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0] as any;
    expect(payload.success).toBe(true);
    expect(payload.data.invitedEmail).toBe('invitee@test.com');
    expect(payload.data.starship.slug).toBe('ship-1');
  });

  it('POST /starship-invites/accept returns 400 on invalid token', async () => {
    const inviteRepo = {
      validateAndConsumeTokenForEmail: jest.fn().mockResolvedValue(null),
    };
    (StarshipInviteTokenRepository as unknown as jest.Mock).mockImplementation(() => inviteRepo);

    const req = {
      user: { id: 'u2', email: 'invitee@test' },
      body: { token: 'bad' },
    } as unknown as Request;
    const res = createMockRes();

    const handler = getHandler('/starship-invites/accept', 'post');
    await handler(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0] as any;
    expect(payload.success).toBe(false);
  });

  it('GET /starships/:id/members returns active members and pending invites', async () => {
    jest.mocked(verifyStarshipOwnerAccess).mockResolvedValue(true);

    // Route uses raw SQL via getConnection().query(...)
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          user_id: 'user_collab',
          role: 'admin',
          created_at: new Date().toISOString(),
          email: 'collab@test.com',
          display_name: 'Collab User',
          avatar: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          invited_email: 'invitee@test.com',
          invited_by_user_id: 'user_owner',
          role: 'collaborator',
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        },
      ]);
    const queryOne = jest.fn().mockResolvedValue({ email: 'owner@test.com', display_name: 'Owner', avatar: null });
    (getConnection as unknown as jest.Mock).mockReturnValue({ query, queryOne });

    const starshipSvc = {
      getStarship: jest.fn().mockResolvedValue({ id: 'starship_1234', slug: 'ship-1', name: 'Ship 1', ownerId: 'user_owner', createdAt: new Date().toISOString() }),
    };
    (StarshipService as unknown as jest.Mock).mockImplementation(() => starshipSvc);

    const req = {
      user: { id: 'user_owner', email: 'owner@test.com' },
      params: { id: 'starship_1234' },
    } as unknown as Request;
    const res = createMockRes();

    const handler = getHandler('/starships/:id/members', 'get');
    await handler(req, res as unknown as Response);

    expect(verifyStarshipOwnerAccess).toHaveBeenCalledWith('starship_1234', 'user_owner', expect.anything());
    expect(query).toHaveBeenCalledTimes(2);
    expect(queryOne).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0] as any;
    expect(payload.success).toBe(true);
    expect(payload.data.members.length).toBe(2); // owner + 1 collaborator
    expect(payload.data.invites.length).toBe(1);
    expect(payload.data.members[0].role).toBe('owner');
    expect(payload.data.members[1].email).toBe('collab@test.com');
  });

  it('DELETE /starships/:id/members/:memberUserId removes member (owner-only)', async () => {
    jest.mocked(verifyStarshipOwnerAccess).mockResolvedValue(true);

    const memberRepo = { removeMember: jest.fn().mockResolvedValue(true) };
    (StarshipMemberRepository as unknown as jest.Mock).mockImplementation(() => memberRepo);

    const starshipSvc = {
      getStarship: jest.fn().mockResolvedValue({ id: 'starship_1234', slug: 'ship-1', name: 'Ship 1', ownerId: 'user_owner', createdAt: new Date().toISOString() }),
    };
    (StarshipService as unknown as jest.Mock).mockImplementation(() => starshipSvc);

    const req = {
      user: { id: 'user_owner', email: 'owner@test.com' },
      params: { id: 'starship_1234', memberUserId: 'user_collab' },
    } as unknown as Request;
    const res = createMockRes();

    const handler = getHandler('/starships/:id/members/:memberUserId', 'delete');
    await handler(req, res as unknown as Response);

    expect(verifyStarshipOwnerAccess).toHaveBeenCalledWith('starship_1234', 'user_owner', expect.anything());
    expect(memberRepo.removeMember).toHaveBeenCalledWith('starship_1234', 'user_collab');
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0] as any;
    expect(payload.success).toBe(true);
    expect(payload.data.removed).toBe(true);
  });

  it('DELETE /starships/:id/invites revokes pending invite(s) (owner-only)', async () => {
    jest.mocked(verifyStarshipOwnerAccess).mockResolvedValue(true);

    const inviteRepo = { cancelOutstandingInvitesForEmail: jest.fn().mockResolvedValue(2) };
    (StarshipInviteTokenRepository as unknown as jest.Mock).mockImplementation(() => inviteRepo);

    const req = {
      user: { id: 'user_owner', email: 'owner@test.com' },
      params: { id: 'starship_1234' },
      query: { email: 'invitee@test.com' },
    } as unknown as Request;
    const res = createMockRes();

    const handler = getHandler('/starships/:id/invites', 'delete');
    await handler(req, res as unknown as Response);

    expect(verifyStarshipOwnerAccess).toHaveBeenCalledWith('starship_1234', 'user_owner', expect.anything());
    expect(inviteRepo.cancelOutstandingInvitesForEmail).toHaveBeenCalledWith('starship_1234', 'invitee@test.com');
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0] as any;
    expect(payload.success).toBe(true);
    expect(payload.data.revokedCount).toBe(2);
  });
});

