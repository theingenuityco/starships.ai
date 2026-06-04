import type { Request, Response } from 'express';

jest.mock('@starships/env', () => ({
  getEnvConfig: () => ({
    PUBLIC_URL: 'https://server.test',
  }),
}));

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn(),
    },
  },
}));

jest.mock('bcrypt', () => ({
  __esModule: true,
  default: {
    compare: jest.fn(),
    hash: jest.fn(),
  },
}));

jest.mock('@/middleware/verify-starship-access', () => ({
  verifyStarshipAccess: jest.fn(),
  verifyStarshipOwnerAccess: jest.fn(),
}));

jest.mock('@starships/models', () => ({
  AgentRepository: jest.fn(),
  ConnectorRepository: jest.fn(),
  ConnectorSecretRepository: jest.fn(),
  ConversationRepository: jest.fn(),
  ConversationParticipantRepository: jest.fn(),
  PlatformSecretRepository: jest.fn(),
  PostgresConnection: jest.fn(),
  RoomTablesRepository: jest.fn(),
  RoomRepository: jest.fn(),
  RoomTaskBoardsRepository: jest.fn(),
  RoomToolsRepository: jest.fn(),
  RoomViewsRepository: jest.fn(),
  StarshipTableRepository: jest.fn(),
  StarshipTableRowRepository: jest.fn(),
  TaskBoardRepository: jest.fn(),
  TaskCardRepository: jest.fn(),
  TaskColumnRepository: jest.fn(),
  ToolRepository: jest.fn(),
  ViewRepository: jest.fn(),
  computeAgentContentHash: jest.fn(),
  computeToolContentHash: jest.fn(),
  getConnection: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  statSync: jest.fn(),
}));

import starshipsRouter from '@/routes/starships';
import { verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
import { ConversationParticipantRepository, RoomRepository } from '@starships/models';
import { existsSync } from 'fs';

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
  const layer = (starshipsRouter as any).stack.find((l: any) => l?.route?.path === path && Boolean(l?.route?.methods?.[method]));
  if (!layer) throw new Error(`Route not found: ${path}`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

describe('starships leadgen room route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reuses existing leadgen bundle-provisioned room and adds user as participant', async () => {
    jest.mocked(verifyStarshipOwnerAccess).mockResolvedValue(true);

    const existingRoom = {
      id: 'room_1',
      slug: 'leadgen',
      name: 'Leadgen',
      conversationId: 'conv_1',
      starshipId: 'starship_1234',
    };

    const roomRepo = {
      findLeadGenBundleRoom: jest.fn().mockResolvedValue(existingRoom),
    };
    (RoomRepository as unknown as jest.Mock).mockImplementation(() => roomRepo);

    const participantRepo = {
      addUserParticipant: jest.fn().mockResolvedValue(undefined),
    };
    (ConversationParticipantRepository as unknown as jest.Mock).mockImplementation(() => participantRepo);

    const req = {
      user: { id: 'user_123', email: 'owner@test.com' },
      params: { id: 'starship_1234' },
    } as unknown as Request;
    const res = createMockRes();

    const handler = getHandler('/starships/:id/ensure-leadgen-room', 'post');
    await handler(req, res as unknown as Response);

    expect(verifyStarshipOwnerAccess).toHaveBeenCalledWith('starship_1234', 'user_123', expect.anything());
    expect(roomRepo.findLeadGenBundleRoom).toHaveBeenCalledWith('starship_1234');
    expect(participantRepo.addUserParticipant).toHaveBeenCalledWith({
      conversationId: existingRoom.conversationId,
      userId: 'user_123',
      role: 'admin',
      createdBy: 'user_123',
    });

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0] as any;
    expect(payload.success).toBe(true);
    expect(payload.data.room.slug).toBe('leadgen');
  });

  it('returns 500 when leadgen bundle is missing', async () => {
    jest.mocked(verifyStarshipOwnerAccess).mockResolvedValue(true);

    const roomRepo = {
      findLeadGenBundleRoom: jest.fn().mockResolvedValue(null),
      findBySlug: jest.fn().mockResolvedValue(null),
    };
    (RoomRepository as unknown as jest.Mock).mockImplementation(() => roomRepo);

    (existsSync as unknown as jest.Mock).mockReturnValue(false);

    const req = {
      user: { id: 'user_123', email: 'owner@test.com' },
      params: { id: 'starship_1234' },
    } as unknown as Request;
    const res = createMockRes();

    const handler = getHandler('/starships/:id/ensure-leadgen-room', 'post');
    await handler(req, res as unknown as Response);

    expect(roomRepo.findLeadGenBundleRoom).toHaveBeenCalledWith('starship_1234');
    expect(existsSync).toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0] as any;
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
