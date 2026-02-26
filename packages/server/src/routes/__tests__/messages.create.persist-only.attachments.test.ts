import express from 'express';
import http from 'http';

// Mocks must be declared before importing the router under test.
const createMessageMock = jest.fn();

jest.mock('@/middleware/jwt-auth', () => {
  return {
    jwtAuthMiddleware: (req: any, _res: any, next: any) => {
      req.user = { id: 'user-a' };
      next();
    },
  };
});

jest.mock('@/middleware/verify-starship-access', () => {
  return {
    verifyResourceAccess: jest.fn().mockResolvedValue(true),
  };
});

jest.mock('@/utils/conversation-membership', () => {
  return {
    enforcePrivateChannelMembership: jest.fn().mockResolvedValue(true),
    enforceDirectMessageMembership: jest.fn().mockResolvedValue(true),
  };
});

jest.mock('@/services/ConversationService', () => {
  return {
    ConversationService: jest.fn().mockImplementation(() => ({
      getConversationById: jest.fn().mockResolvedValue({
        id: 'conv_1234567',
        starshipId: 'ship_1234567',
      }),
    })),
  };
});

jest.mock('@/services/MessageService', () => {
  return {
    MessageService: jest.fn().mockImplementation(() => ({
      createMessage: createMessageMock,
    })),
  };
});

// The route module imports several repositories from @starships/models.
// POST /messages doesn't touch them, but we stub to avoid import failures.
jest.mock('@starships/models', () => {
  return {
    ChannelRepository: jest.fn(),
    ConversationParticipantRepository: jest.fn(),
    DirectMessageRepository: jest.fn(),
    MessageReactionRepository: jest.fn(),
    NotificationRepository: jest.fn(),
  };
});

// Not used by POST /messages, but imported by the route module.
jest.mock('@/services/ConversationStreamBus', () => {
  return { ConversationStreamBus: { getInstance: () => ({ publish: jest.fn() }) } };
});
jest.mock('@/services/NotificationStreamBus', () => {
  return { NotificationStreamBus: { getInstance: () => ({ publish: jest.fn() }) } };
});

import messageRoutes from '@/routes/messages';

async function httpJson(args: { port: number; path: string; method: string; body?: unknown; timeoutMs?: number }): Promise<{
  status: number;
  bodyText: string;
}> {
  const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : 5000;
  const payload = args.body === undefined ? undefined : JSON.stringify(args.body);

  return await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: args.port,
        path: args.path,
        method: args.method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : null),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
        res.on('end', () => {
          resolve({
            status: typeof res.statusCode === 'number' ? res.statusCode : 0,
            bodyText: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`request timed out after ${timeoutMs}ms`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

describe('POST /messages (persist-only) attachments', () => {
  beforeEach(() => {
    createMessageMock.mockReset();
  });

  it('passes attachmentIds through to MessageService.createMessage', async () => {
    const conversationId = 'conv_1234567';
    const starshipId = 'ship_1234567';
    const attachmentIds = ['att_1234567', 'att_abcdef12'];

    createMessageMock.mockResolvedValue({
      id: 'msg_1234567',
      role: 'user',
      content: 'hello',
      messageType: 'user_input',
      conversationId,
      starshipId,
      attachmentIds,
      userId: 'user-a',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const app = express();
    app.use(express.json());
    app.use('/api/v1', messageRoutes);

    const server = http.createServer(app);

    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const port = (server.address() as { port?: number } | null)?.port;
      if (!port) throw new Error('Failed to bind ephemeral port for test server');

      const res = await httpJson({
        port,
        path: '/api/v1/messages',
        method: 'POST',
        body: {
          role: 'user',
          content: 'hello',
          starshipId,
          conversationId,
          messageType: 'user_input',
          attachmentIds,
        },
      });

      expect(res.status).toBe(201);
      expect(createMessageMock).toHaveBeenCalledTimes(1);
      expect(createMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'user',
          content: 'hello',
          starshipId,
          conversationId,
          messageType: 'user_input',
          attachmentIds,
          userId: 'user-a',
        })
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

